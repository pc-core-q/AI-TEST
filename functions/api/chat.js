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

    // تجهيز قائمة المنتجات المتوفرة لتقديم الاقتراحات منها
    const productsText = (products || []).slice(0, 80).map(p => 
      `- [ID: ${p.id}] الاسم: ${p.name} | السعر: ${p.price} | الباركود: ${p.barcode || 'لا يوجد'}`
    ).join("\n");

    const systemPrompt = `أنت المساعد الذكي والمستشار الرسمي لمتجر "${storeInfo?.name || 'المتجر'}".
مهمتك: مساعدة الزبائن بلباقة، إجابة الاستفسارات عن المحل وتقديم النصائح التسويقية والمهنية.

معلومات المتجر:
- اسم المتجر: ${storeInfo?.name || ''}
- أوقات العمل: ${storeInfo?.workingHours || ''}
- التوصيل: ${storeInfo?.deliveryInfo || ''}
- العنوان: ${storeInfo?.address || ''}
- رقم واتساب: ${storeInfo?.whatsapp || ''}

قائمة المنتجات المتوفرة:
${productsText}

قواعد الإجابة:
1. أجب بأسلوب ودود ومبسط وواضح.
2. انصح الزبون واقترح المنتجات المناسبة لطلبه من القائمة أعلاه فقط.
3. إذا اقترحت أو ذكرت أي منتج من القائمة، ضع معرّفاته (IDs) في نهاية الرد حصراً بهذا الشكل:
<!--PRODUCTS: ["prd_xxx", "prd_yyy"]-->`;

    const fullPrompt = `${systemPrompt}\n\nسؤال الزبون:\n${message || ""}`;

    // استخدام الموديل المعتمد لحسابك
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: fullPrompt }]
          }
        ]
      })
    });

    const data = await geminiRes.json();

    if (data.error) {
      return new Response(JSON.stringify({ 
        reply: `خطأ من Google: ${data.error.message || JSON.stringify(data.error)}` 
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "لم أجد إجابة مناسبة حالياً.";

    // استخراج معرّفات المنتجات لعرض كروت الشراء
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
