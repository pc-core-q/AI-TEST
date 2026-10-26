// js/ai-assistant.js
(function() {
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
              مرحباً بك! أنا مستشارك الذكي في <strong>${escapeHtml(STORE_CONFIG.storeName || "المتجر")}</strong>.
              أستطيع إجابتك عن أي استفسار يخص المنتجات، المقاسات، العروض، التوصيل، أو سلة مشترياتك!
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

  const box = document.getElementById("aiChatBox");
  const toggleBtn = document.getElementById("aiToggleBtn");
  const closeBtn = document.getElementById("aiCloseBtn");
  const sendBtn = document.getElementById("aiSendBtn");
  const input = document.getElementById("aiInput");
  const messages = document.getElementById("aiMessages");

  // سجل ذاكرة المحادثة أثناء الجلسة
  const conversationHistory = [];

  toggleBtn.onclick = () => {
    box.style.display = box.style.display === "none" ? "flex" : "none";
    if (box.style.display === "flex") input.focus();
  };
  closeBtn.onclick = () => { box.style.display = "none"; };

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    addMessage("user", text);
    input.value = "";

    const loadingId = addMessage("bot", "جاري البحث والمساعدة...");

    try {
      const settings = Store.getSettings ? Store.getSettings() : {};
      const storeInfo = {
        name: STORE_CONFIG.storeName || "",
        phone: settings.phone || STORE_CONFIG.phone || "",
        phone2: settings.phone2 || STORE_CONFIG.phone2 || "",
        whatsapp: settings.whatsapp || STORE_CONFIG.whatsappNumber || "",
        address: settings.address || STORE_CONFIG.address || "",
        mapUrl: settings.mapUrl || STORE_CONFIG.mapUrl || "",
        workingHours: settings.workingHours || STORE_CONFIG.workingHours || "",
        deliveryInfo: settings.deliveryInfo || STORE_CONFIG.deliveryInfo || "",
        instagram: settings.instagram || STORE_CONFIG.instagram || "",
        tiktok: settings.tiktok || STORE_CONFIG.tiktok || ""
      };

      // 1. قراءة وفحص سلة المشتريات الحالية للزبون
      let cartSummary = "السلة فارغة حالياً.";
      if (typeof Store.getCart === "function") {
        const cart = Store.getCart();
        if (cart && cart.length > 0) {
          const allProducts = Store.getProducts ? Store.getProducts() : (Store.getIndexItems ? Store.getIndexItems() : []);
          let total = 0;
          const itemsText = cart.map(c => {
            const p = allProducts.find(item => item.id === c.productId);
            const price = p ? p.price : 0;
            total += price * (c.qty || 1);
            let opt = [];
            if (c.color) opt.push(`لون: ${c.color}`);
            if (c.size) opt.push(`مقاس: ${c.size}`);
            return `${p ? p.name : 'منتج'} (العدد: ${c.qty}${opt.length ? ' - ' + opt.join('، ') : ''})`;
          }).join(" ، ");
          cartSummary = `تحتوي السلة على ${cart.length} أصناف (${itemsText}) بإجمالي تقريبي: ${formatPrice(total)}`;
        }
      }

      // 2. قراءة الأقسام
      const categories = (Store.getCategories ? Store.getCategories() : []).map(c => ({
        id: c.id,
        name: c.name
      }));

      // 3. تصفية المنتجات الذكية مع كامل تفاصيل الألوان والمقاسات والوصف
      const allProducts = Store.getProducts ? Store.getProducts() : (Store.getIndexItems ? Store.getIndexItems() : []);
      const available = allProducts.filter(p => p.available !== false && (p.stock > 0 || (p.inventory && Object.values(p.inventory).some(v => v > 0))));

      const queryWords = text.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      const isOfferQuery = /عرض|عروض|خصم|تخفيض/i.test(text);

      let matched = available.filter(p => {
        if (isOfferQuery && p.isOffer) return true;
        const nameMatch = (p.name || "").toLowerCase();
        const descMatch = (p.description || "").toLowerCase();
        return queryWords.some(w => nameMatch.includes(w) || descMatch.includes(w));
      });

      const selectedProducts = (matched.length > 0 ? matched : available).slice(0, 15).map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        oldPrice: p.oldPrice || 0,
        isOffer: !!p.isOffer,
        colors: Array.isArray(p.colors) ? p.colors.map(c => c.name || c) : [],
        sizes: Array.isArray(p.sizes) ? p.sizes : [],
        desc: (p.description || "").slice(0, 70)
      }));

      // إرسال الطلب مع الذاكرة السابقة
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: conversationHistory,
          storeInfo: storeInfo,
          categories: categories,
          products: selectedProducts,
          cartInfo: { summary: cartSummary }
        })
      });

      const data = await response.json();
      removeMessage(loadingId);

      // حفظ السؤال والجواب في ذاكرة الجلسة
      conversationHistory.push({ role: "user", content: text });
      conversationHistory.push({ role: "assistant", content: data.reply });
      if (conversationHistory.length > 8) conversationHistory.splice(0, 2);

      renderBotResponse(data.reply, data.productIds, available);

    } catch (err) {
      removeMessage(loadingId);
      addMessage("bot", "تعذر الاتصال بالمساعد حالياً، يرجى إعادة المحاولة.");
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
                <div class="ai-prd-title">${escapeHtml(p.name)}</div>
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
