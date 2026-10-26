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

    // تجهيز قائمة المنتجات
    const productsText = (products || []).slice(0, 70).map(p => 
      `- [ID: ${p.id}] الاسم: ${p.name} | السعر: ${p.price} | الباركود: ${p.barcode || 'لا يوجد'}`
    ).join("\n");

    const systemPrompt = `أنت المساعد الذكي لمتجر "${storeInfo?.name || 'المتجر'}".
جاوب الزبون بلباقة وبساطة. إذا اقترحت منتجات ضع معرّفاتها في نهاية الرد هكذا:
<!--PRODUCTS: ["prd_xxx"]-->`;

    const fullPrompt = `${systemPrompt}\n\nسؤال الزبون:\n${message || ""}`;

    // موديلات مفعّلة في حسابك: إذا واجه الأول ضغطاً، يتحول تلقائياً للثاني
    const modelsToTry = [
      "gemini-3.8-flash",
      "gemini-3.8-flash-lite-tts",
      "gemini-3.1-flash-lite"
    ];

    let rawReply = null;
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }]
          })
        });

        const data = await geminiRes.json();

        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          rawReply = data.candidates[0].content.parts[0].text;
          break; // تم الرد بنجاح، توقف عن المحاولة
        } else if (data.error) {
          lastError = data.error.message;
        }
      } catch (e) {
        lastError = e.message;
      }
    }

    if (!rawReply) {
      return new Response(JSON.stringify({ 
        reply: `عذراً، السيرفرات مشغولة حالياً، يرجى إعادة المحاولة بعد ثوانٍ. (${lastError})` 
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

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
