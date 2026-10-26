export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    
    const { message, storeInfo, products } = body;
    const apiKey = (env.GROQ_API_KEY || "").trim();

    if (!apiKey) {
      return new Response(JSON.stringify({ reply: "تنبيه: مفتاح GROQ_API_KEY غير موجود في Cloudflare." }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // تلخيص خفيف للمنتجات
    const productsText = (products || []).slice(0, 25).map(p => 
      `[${p.id}] ${p.name} - السعر: ${p.price}`
    ).join("\n");

    const systemPrompt = `أنت مساعد متجر "${storeInfo?.name || 'المتجر'}".
معلومات المتجر: ${storeInfo?.workingHours || ''} | ${storeInfo?.deliveryInfo || ''}
المنتجات:
${productsText}

التعليمات:
- أجب باختصار ولطافة وبسرعة باللهجة العراقية الودية أو عربية بسيطة.
- إذا اقترحت منتجات ضع معرّفاتها في النهاية هكذا فقط:
<!--PRODUCTS: ["prd_xxx"]-->`;

    // طلب فائق السرعة عبر محرك Groq
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message || "" }
        ],
        temperature: 0.5,
        max_tokens: 200
      })
    });

    const data = await groqRes.json();
    const rawReply = data.choices?.[0]?.message?.content || "أهلاً بك! كيف أقدر أساعدك؟";

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
    return new Response(JSON.stringify({ reply: "حدث خطأ في الاتصال، يرجى المحاولة ثانية." }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}
