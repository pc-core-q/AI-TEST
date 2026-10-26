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

    // تجهيز قائمة مصغرة بالمنتجات
    const productsText = (products || []).slice(0, 60).map(p => 
      `- [ID: ${p.id}] الاسم: ${p.name} | السعر: ${p.price} | الباركود: ${p.barcode || 'لا يوجد'}`
    ).join("\n");

    const systemPrompt = `أنت المساعد الذكي لمتجر "${storeInfo?.name || 'المتجر'}". جاوب الزبون بلباقة وبساطة. إذا اقترحت منتجات ضع معرّفاتها في النهاية هكذا: <!--PRODUCTS: ["id1"]-->`;

    // استدعاء Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: (message || "") }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      })
    });

    const data = await geminiRes.json();

    // إذا أرجعت جوجل أي خطأ سنظهره مباشرة لنعرف السبب
    if (data.error) {
      return new Response(JSON.stringify({ 
        reply: `خطأ من Google: ${data.error.message || JSON.stringify(data.error)}` 
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "لم أجد إجابة مناسبة حالياً.";

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
