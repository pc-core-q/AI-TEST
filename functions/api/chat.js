export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    
    const { message, history, storeInfo, products, categories, cartInfo } = body;
    const apiKey = (env.GROQ_API_KEY || "").trim();

    if (!apiKey) {
      return new Response(JSON.stringify({ reply: "تنبيه: مفتاح GROQ_API_KEY غير موجود في إعدادات Cloudflare." }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 1. اختيار موديل سريع ونشط تلقائياً
    const modelsRes = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const modelsData = await modelsRes.json();
    const availableChatModels = (modelsData.data || [])
      .map(m => m.id)
      .filter(id => !id.includes("whisper") && !id.includes("embed") && !id.includes("guard") && !id.includes("vision"));

    const activeModel = availableChatModels.find(id => id.includes("llama")) || 
                        availableChatModels.find(id => id.includes("qwen") || id.includes("mixtral")) || 
                        availableChatModels[0];

    // 2. تجهيز نصوص المتجر المتكاملة
    const catsText = (categories || []).map(c => `- قسم "${c.name}": رابطه ( products.html?cat=${c.id} )`).join("\n");
    
    const productsText = (products || []).slice(0, 20).map(p => {
      let details = `[${p.id}] ${p.name} - السعر: ${p.price} د.ع`;
      if (p.isOffer && p.oldPrice) details += ` (عرض خاص! السعر السابق: ${p.oldPrice} د.ع)`;
      if (p.colors && p.colors.length) details += ` | الألوان: ${p.colors.join('، ')}`;
      if (p.sizes && p.sizes.length) details += ` | المقاسات/الأحجام: ${p.sizes.join('، ')}`;
      if (p.desc) details += ` | وصف: ${p.desc}`;
      return details;
    }).join("\n");

    const systemPrompt = `أنت المساعد الذكي والمستشار الرسمي لمتجر "${storeInfo?.name || 'المتجر'}".
معلومات المتجر والتواصل:
- الهاتف الأساسي: ${storeInfo?.phone || 'غير محدد'}
- هاتف إضافي: ${storeInfo?.phone2 || 'غير محدد'}
- واتساب: ${storeInfo?.whatsapp || 'غير محدد'}
- إنستغرام: ${storeInfo?.instagram ? storeInfo.instagram : 'غير متوفر'}
- تيك توك: ${storeInfo?.tiktok ? storeInfo.tiktok : 'غير متوفر'}
- العنوان: ${storeInfo?.address || 'غير محدد'}
- موقع الخريطة: ${storeInfo?.mapUrl ? storeInfo.mapUrl : 'غير متوفر'}
- أوقات العمل: ${storeInfo?.workingHours || 'غير محدد'}
- التوصيل: ${storeInfo?.deliveryInfo || 'توصيل متوفر لكافة المناطق'}

حالة سلة الزبون الحالية:
${cartInfo?.summary || 'السلة فارغة حالياً.'}

أقسام المتجر:
${catsText}
- روابط هامة: ( categories.html للأقسام ، products.html للمتجر ، cart.html للسلة ، contact.html للتواصل )

عينة المنتجات الأكثر صلة بطلب الزبون:
${productsText || 'لا توجد منتجات مطابقة مباشرة.'}

التعليمات والإرشادات:
1. أجب بأسلوب ودود ومختصر ولبق (لهجة عراقية مهذبة أو عربية مبسطة).
2. إذا سأل الزبون عن حسابتكم بمواقع التواصل، زوده بإنستغرام أو تيك توك من المعلومات أعلاه.
3. إذا سأل الزبون عن سلة مشترياته أو عدد المنتجات بها أو إجمالي حسابه، أجب بدقة من قسم "حالة سلة الزبون الحالية".
4. إذا سأل عن توفر ألوان أو مقاسات لمنتج، ارجع لتفاصيل المنتجات أعلاه وأخبره بالمتوفر منها.
5. إذا اقترحت منتجات للشراء، ضع معرّفاتها في نهاية رسالتك تماماً بهذا الشكل حصراً:
<!--PRODUCTS: ["prd_xxx", "prd_yyy"]-->`;

    // 3. بناء سجل المحادثة لدعم الذاكرة المتتابعة
    const messages = [{ role: "system", content: systemPrompt }];
    if (Array.isArray(history)) {
      history.slice(-4).forEach(h => {
        if (h.role && h.content) messages.push({ role: h.role, content: h.content });
      });
    }
    messages.push({ role: "user", content: message || "" });

    const chatRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: activeModel,
        messages: messages,
        temperature: 0.5,
        max_tokens: 350
      })
    });

    const chatData = await chatRes.json();
    const rawReply = chatData.choices?.[0]?.message?.content || "أهلاً بك! كيف أقدر أساعدك؟";

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
