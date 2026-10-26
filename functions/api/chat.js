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

    // 1. جلب قائمة الموديلات المتاحة لحسابك مباشرة من Groq بدون تخمين
    const modelsRes = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const modelsData = await modelsRes.json();

    if (modelsData.error) {
      return new Response(JSON.stringify({ reply: `خطأ في مفتاح Groq: ${modelsData.error.message}` }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // استبعاد موديلات الصوت والصور وحصر الموديلات النصية المتاحة
    const availableChatModels = (modelsData.data || [])
      .map(m => m.id)
      .filter(id => !id.includes("whisper") && !id.includes("embed") && !id.includes("guard") && !id.includes("vision"));

    if (availableChatModels.length === 0) {
      return new Response(JSON.stringify({ reply: "لا توجد موديلات محادثة مفعلة في حسابك في Groq حالياً." }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // اختيار أفضل موديل متاح تلقائياً (Llama أو Qwen أو أول موديل متاح)
    const activeModel = availableChatModels.find(id => id.includes("llama")) || 
                        availableChatModels.find(id => id.includes("qwen") || id.includes("mixtral") || id.includes("gemma")) || 
                        availableChatModels[0];

    // 2. تجهيز ملخص المنتجات
    const productsText = (products || []).slice(0, 30).map(p => 
      `[${p.id}] ${p.name} - السعر: ${p.price} د.ع`
    ).join("\n");

    const systemPrompt = `أنت مساعد متجر "${storeInfo?.name || 'المتجر'}".
أوقات العمل: ${storeInfo?.workingHours || ''}
التوصيل: ${storeInfo?.deliveryInfo || ''}
المنتجات المتوفرة:
${productsText}

التعليمات:
- أجب بلباقة وسرعة واختصار بلهجة عربية بسيطة ومرحبة.
- اقترح المنتجات المناسبة من القائمة فقط.
- إذا اقترحت أي منتج ضع معرّفاته في نهاية الرسالة بهذا الشكل حصراً:
<!--PRODUCTS: ["prd_xxx"]-->`;

    // 3. إرسال الطلب للموديل المختار تلقائياً
    const chatRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: activeModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message || "" }
        ],
        temperature: 0.5,
        max_tokens: 300
      })
    });

    const chatData = await chatRes.json();

    if (chatData.error) {
      return new Response(JSON.stringify({ reply: `خطأ من Groq (${activeModel}): ${chatData.error.message}` }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const rawReply = chatData.choices?.[0]?.message?.content || "أهلاً بك! كيف يمكنني مساعدتك؟";

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
