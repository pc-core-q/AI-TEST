// js/ai-assistant.js
(function() {
  // 1. حقن نافذة المساعد الذكي وزر المحادثة في الصفحة
  const chatUI = `
    <div id="aiChatWidget" class="ai-widget">
      <button id="aiToggleBtn" class="ai-toggle-btn" title="المساعد الذكي">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
          <rect x="4" y="8" width="16" height="12" rx="2"/>
          <circle cx="9" cy="13" r="1.5"/><circle cx="15" cy="13" r="1.5"/>
          <path d="M9 17h6"/>
        </svg>
      </button>

      <div id="aiChatBox" class="ai-chat-box" style="display: none;">
        <div class="ai-header">
          <button id="aiCloseBtn" class="ai-close-btn">&times;</button>
          <div class="ai-title">
            <span class="ai-name">${escapeHtml(STORE_CONFIG.storeName || "المتجر")} AI</span>
            <span class="ai-status">● متصل الآن</span>
          </div>
        </div>

        <div id="aiMessages" class="ai-messages">
          <div class="ai-msg bot">
            <div class="ai-bubble">
              مرحباً بك! أنا المساعد الذكي لـ <strong>${escapeHtml(STORE_CONFIG.storeName || "المتجر")}</strong>.
              أستطيع إجابتك عن أي سؤال يخص التوصيل، أوقات العمل، المنتجات، أو تقديم نصائح واقتراحات لاختيار الأنسب لك!
            </div>
          </div>
        </div>

        <div class="ai-input-area">
          <input type="text" id="aiInput" placeholder="اسألني عن أي شيء يخص المتجر..." autocomplete="off" />
          <button id="aiSendBtn">إرسال</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", chatUI);

  const widget = document.getElementById("aiChatWidget");
  const box = document.getElementById("aiChatBox");
  const toggleBtn = document.getElementById("aiToggleBtn");
  const closeBtn = document.getElementById("aiCloseBtn");
  const sendBtn = document.getElementById("aiSendBtn");
  const input = document.getElementById("aiInput");
  const messages = document.getElementById("aiMessages");

  toggleBtn.onclick = () => {
    box.style.display = box.style.display === "none" ? "flex" : "none";
    if (box.style.display === "flex") input.focus();
  };
  closeBtn.onclick = () => { box.style.display = "none"; };

  // 2. إرسال السؤال ومعالجة البيانات
  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    addMessage("user", text);
    input.value = "";

    const loadingId = addMessage("bot", "جاري التفكير والبحث في المتجر...");

    try {
      // قراءة إعدادات المتجر الكاملة من Store
      const settings = Store.getSettings ? Store.getSettings() : {};
      const storeInfo = {
        name: STORE_CONFIG.storeName || "",
        description: STORE_CONFIG.storeDescription || "",
        workingHours: settings.workingHours || STORE_CONFIG.workingHours || "مفتوح يومياً",
        deliveryInfo: settings.deliveryInfo || STORE_CONFIG.deliveryInfo || "توصيل لكافة المحافظات",
        address: settings.address || STORE_CONFIG.address || "",
        whatsapp: settings.whatsapp || STORE_CONFIG.whatsappNumber || ""
      };

      // قراءة المنتجات المتاحة
      const allItems = Store.getIndexItems ? Store.getIndexItems() : (Store.getProducts ? Store.getProducts() : []);
      const availableProducts = allItems.filter(p => p.available !== false && p.stock > 0);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          storeInfo: storeInfo,
          products: availableProducts
        })
      });

      const data = await response.json();
      removeMessage(loadingId);

      renderBotResponse(data.reply, data.productIds, availableProducts);

    } catch (err) {
      removeMessage(loadingId);
      addMessage("bot", "تعذر الاتصال بالمساعد الذكي حالياً، يرجى المحاولة لاحقاً.");
    }
  }

  sendBtn.onclick = sendMessage;
  input.onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };

  function addMessage(sender, text) {
    const id = "msg_" + Date.now() + Math.random().toString(36).substr(2, 4);
    const div = document.createElement("div");
    div.className = `ai-msg ${sender}`;
    div.id = id;
    div.innerHTML = `<div class="ai-bubble">${escapeHtml(text)}</div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return id;
  }

  function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // 3. عرض رد البوت مع بطاقات المنتجات إن وُجدت
  function renderBotResponse(replyText, productIds, productsList) {
    const div = document.createElement("div");
    div.className = "ai-msg bot";

    let cardsHtml = "";
    if (productIds && productIds.length > 0) {
      const matched = productsList.filter(p => productIds.includes(p.id));
      if (matched.length > 0) {
        cardsHtml = `
          <div class="ai-product-list">
            ${matched.map(p => `
              <div class="ai-product-card">
                <div class="ai-prd-title">${escapeHtml(p.name)} ${p.barcode ? `— SKU: ${escapeHtml(p.barcode)}` : ""}</div>
                <div class="ai-prd-foot">
                  <span class="ai-prd-price">${formatPrice(p.price)}</span>
                  <a href="product.html?id=${encodeURIComponent(p.id)}" class="ai-view-btn">عرض المنتج ↗</a>
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

    div.innerHTML = `
      <div class="ai-bubble">
        <div>${escapeHtml(replyText).replace(/\n/g, "<br>")}</div>
        ${cardsHtml}
      </div>
    `;

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }
})();
