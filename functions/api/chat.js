export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    
    const { message, storeInfo, products } = body;
    const apiKey = (env.GEMINI_API_KEY || "").trim();

    if (!apiKey) {
      return new Response(JSON.stringify({ reply: "تنبيه: مفتاح GEMINI_API_KEY غير موجود في إعدادات Cloudflare." }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // تلخيص خفيف جداً (أول 20 منتجاً فقط) لسرعة معالجة فائقة
    const productsText = (products || []).slice(0, 20).map(p => 
      `[${p.id}] ${p.name} (${p.price} د.ع)`
    ).join("\n");

    const prompt = `أنت بائع ومساعد متجر "${storeInfo?.name || 'المتجر'}".
ساعات العمل: ${storeInfo?.workingHours || ''} | التوصيل: ${storeInfo?.deliveryInfo || ''}
المنتجات المتاحة:
${productsText}

سؤال الزبون: ${message || ""}
جاوب فوراً وبسطرين فقط بلهجة ودية سريعة. إذا اقترحت منتجات ضع أرقامها فقط في النهاية هكذا:
<!--PRODUCTS: ["prd_xxx"]-->`;

    // gemini-flash-lite-latest هو أسرع موديل نصي متاح في حسابك
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 150,
          temperature: 0.4
        }
      })
    });

    const data = await geminiRes.json();
    const rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "أهلاً بك! كيف أقدر أساعدك؟";

    let productIds = [];
    let cleanReply = rawReply;
    const match = rawReply.match(/<!--PRODUCTS:\s*(\[.*?\])\s*-->/);
    if (match) {
      try {
        productIds = JSON.parse(match[1]);
        cleanReply = rawReply.replace(match[0], "").trim();
      } catch (e) {}
    }

    return new Response(JSON.stringify({ reply: cleanReply, productIds }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ reply: "حدث خطأ بسيط، يرجى المحاولة ثانية." }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}
