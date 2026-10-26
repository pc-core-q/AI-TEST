export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    
    const { message, storeInfo, products } = body;
    const apiKey = (env.GROQ_API_KEY || "").trim();

    if (!apiKey) {
      return new Response(JSON.stringify({ reply: "تنبيه: مفتاح GROQ_API_KEY غير موجود في إعدادات Cloudflare." }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // تلخيص الكتالوج
    const productsText = (products || []).slice(0, 30).map(p => 
      `[${p.id}] ${p.name} - السعر: ${p.price} د.ع`
    ).join("\n");

    const systemPrompt = `أنت مساعد متجر "${storeInfo?.name || 'المتجر'}".
ساعات العمل: ${storeInfo?.workingHours || ''}
التوصيل: ${storeInfo?.deliveryInfo || ''}
المنتجات المتاحة حالياً:
${productsText}

التعليمات:
- أجب عن سؤال الزبون بلباقة وسرعة واختصار بلهجة عربية بسيطة ومرحبة.
- اقترح المنتجات المناسبة من القائمة أعلاه فقط.
- إذا اقترحت أو ذكرت منتجات، ضع أرقامها فقط في نهاية رسالتك بهذا الشكل:
<!--PRODUCTS: ["prd_xxx"]-->`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message || "" }
        ],
        temperature: 0.5,
        max_tokens: 300
      })
    });

    const data = await groqRes.json();

    // إذا أرجع Groq أي خطأ سنظهره لنعرف السبب فوراً
    if (data.error) {
      return new Response(JSON.stringify({ 
        reply: `خطأ من Groq: ${data.error.message || JSON.stringify(data.error)}` 
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const rawReply = data.choices?.[0]?.message?.content || "عذراً، لم أستطع العثور على رد.";

    // استخراج معرّفات المنتجات
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
    return new Response(JSON.stringify({ reply: `خطأ بالسيرفر: ${err.message}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}
