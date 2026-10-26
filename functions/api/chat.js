export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    
    // استلام البيانات القادمة من المتجر
    const { message, storeInfo, products } = body;
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ reply: "عذراً، لم يتم ضبط مفتاح الذكاء الاصطناعي في Cloudflare." }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // تجهيز قائمة مختصرة بالمنتجات ليفهمها الذكاء الاصطناعي
    const productsText = (products || []).slice(0, 100).map(p => 
      `- [ID: ${p.id}] الاسم: ${p.name} | السعر: ${p.price} | الباركود: ${p.barcode || 'لا يوجد'} | الوصف: ${p.description || 'لا يوجد'}`
    ).join("\n");

    // التعليمات الكاملة للبوت ليتصرف كبائع ومستشار خبير في المحل
    const systemPrompt = `
أنت المساعد الذكي والمستشار الرسمي لمتجر "${storeInfo.name}".
مهمتك: مساعدة الزبائن بلباقة واحترافية وود، والإجابة عن كل ما يخص المتجر وتقديم النصائح التسويقية والمهنية.

معلومات المتجر:
- اسم المتجر: ${storeInfo.name}
- الوصف العام: ${storeInfo.description}
- أوقات العمل: ${storeInfo.workingHours}
- معلومات التوصيل: ${storeInfo.deliveryInfo}
- العنوان: ${storeInfo.address}
- للتواصل أو الطلب المباشر: عبر واتساب ${storeInfo.whatsapp}

قائمة المنتجات المتوفرة في المتجر حالياً:
${productsText}

قواعد الإجابة:
1. أجب بأسلوب ودود وسلس ومرحب (لهجة عراقية مهذبة أو عربية مبسطة).
2. إذا سألك الزبون نصيحة (مثال: مستحضرات لبشرة معينة، قطع كمبيوتر متوافقة، أو تنسيق ملابس)، انصحه كخبير، ثم اقترح له المنتجات المناسبة من القائمة أعلاه فقط ولا تقترح منتجات غير موجودة بالمحل.
3. إذا سأل عن التوصيل، الدوام، العنوان، أو طريقة الشراء، جاوبه بدقة من معلومات المتجر أعلاه.
4. مهم جداً: إذا قمت باقتراح أو ذكر منتجات من القائمة، في نهاية رسالتك تماماً اكتب أرقام معرّفات المنتجات (IDs) فقط بهذا الشكل وبدون أي تغيير:
<!--PRODUCTS: ["prd_xxx", "prd_yyy"]-->
`;

    // الاتصال بموديل Gemini 1.5 Flash المجاني والسريع
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: message }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      })
    });

    const data = await geminiRes.json();
    const rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "عذراً، لم أستطع معالجة السؤال حالياً.";

    // استخراج معرّفات المنتجات إن وُجدت
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
    return new Response(JSON.stringify({ reply: "حدث خطأ أثناء الاتصال بالمساعد الذكي." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}