export async function onRequestPost(context) {
  try {
    const { env } = context;
    const apiKey = (env.GEMINI_API_KEY || "").trim();

    if (!apiKey) {
      return new Response(JSON.stringify({ reply: "تنبيه: مفتاح GEMINI_API_KEY غير موجود في Cloudflare." }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // استدعاء دالة ListModels الرسمية لمعرفة الموديلات المتاحة لمفتاحك
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(listUrl);
    const data = await res.json();

    if (data.error) {
      return new Response(JSON.stringify({ reply: `خطأ من Google: ${data.error.message}` }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // تصفية الموديلات التي تدعم المحادثة وتوليد النصوص (generateContent)
    const supportedModels = (data.models || [])
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));

    return new Response(JSON.stringify({
      reply: `الموديلات المتاحة والمفعلة في حسابك هي:\n\n${supportedModels.join("\n")}`
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ reply: `خطأ: ${err.message}` }), {
      headers: { "Content-Type": "application/json" }
    });
  }
}
