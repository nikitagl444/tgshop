// ===============================
// CONFIG
// ===============================

// ВСТАВЬ СЮДА URL БЭКЕНДА (без / в конце)
// пример: https://weapon-moderate-donors-handheld.trycloudflare.com

const DEFAULT_API_BASE = "https://weapon-moderate-donors-handheld.trycloudflare.com";

// Можно переопределить через ?api=https://xxxx или localStorage
function getApiBase() {
  const u = new URL(window.location.href);
  const fromQuery = u.searchParams.get("api");
  const fromLS = localStorage.getItem("API_BASE");
  const base = (fromQuery || fromLS || DEFAULT_API_BASE || "").trim();
  const clean = base.replace(/\/+$/, "");
  if (fromQuery) localStorage.setItem("API_BASE", clean);
  return clean;
}

const API_BASE = getApiBase();

// ===============================
// FAQ (оставил как было — можно потом вынести в backend)
// ===============================
const demoFaq = [
  { id: 1, question: "Как выбрать размер?", answer: "Смотрите таблицу размеров в карточке товара. Если сомневаетесь — берите на размер больше для oversize." },
  { id: 2, question: "Сколько доставка?", answer: "Доставка 1–3 дня по РБ (временно). Стоимость зависит от города." },
  { id: 3, question: "Можно ли вернуть?", answer: "Да, в течение 14 дней при сохранении товарного вида." }
];

// ===============================
// Helpers
// ===============================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const money = (n) => `${Number(n || 0).toFixed(2)} BYN`;

const LS_KEY = "miniapp_cart_v2";
// cart: { "productId|variantKey": { productId, variantKey, variationId, sizeLabel, qty } }
function loadCart() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function saveCart(cart) {
  localStorage.setItem(LS_KEY, JSON.stringify(cart));
  updateCartDot();
}
function cartKey(productId, variantKey) { return `${productId}|${variantKey}`; }

function updateCartDot() {
  const cart = loadCart();
  const has = Object.keys(cart).length > 0;
  const dot = $("#cartDot");
  if (dot) dot.classList.toggle("hidden", !has);
}

function getCartQtyForProduct(productId) {
  const cart = loadCart();
  let sum = 0;
  for (const k in cart) if (cart[k].productId === productId) sum += cart[k].qty;
  return sum;
}

function getUserName() {
  const tg = window.Telegram?.WebApp;
  const n = tg?.initDataUnsafe?.user?.first_name;
  return n || "друг";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripHtml(html) {
  const s = String(html ?? "");
  if (!s) return "";
  const div = document.createElement("div");
  div.innerHTML = s;
  return (div.textContent || div.innerText || "").replace(/\s+\n/g, "\n").trim();
}

function declOfNum(n, titles) {
  const cases = [2, 0, 1, 1, 1, 2];
  return titles[(n % 100 > 4 && n % 100 < 20) ? 2 : cases[(n % 10 < 5) ? n % 10 : 5]];
}

const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <defs>
        <linearGradient id="g" x1="0" x2="1">
          <stop offset="0" stop-color="#141824"/>
          <stop offset="1" stop-color="#0f1115"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial" font-size="36" fill="#9aa3b2">no image</text>
    </svg>`
  );

function pickPhoto(p) {
  const u =
    p.photo_url ||
    p.image_url ||
    p.image ||
    (Array.isArray(p.images) && p.images[0] && (p.images[0].src || p.images[0].url)) ||
    "";
  const s = String(u || "").trim();
  if (!s || s === "-" || s === "null") return FALLBACK_IMG;
  return s;
}

function normalizeVariants(raw) {
  let arr =
    raw?.variants ||
    raw?.sizes ||
    raw?.variations ||
    raw?.variation_options ||
    [];

  if (!Array.isArray(arr)) arr = [];

  let out = arr.map((v) => {
    if (typeof v === "string") {
      return { variation_id: null, label: v, price_byn: null, in_stock: true };
    }
    const variation_id = v.variation_id ?? v.variationId ?? v.id ?? null;

    // label может называться по-разному: label/size/option/name…
    const labelRaw =
      v.label ??
      v.size ??
      v.option ??
      v.value ??
      v.name ??
      (variation_id ? `var ${variation_id}` : "ONE");

    const price_byn =
      v.price_byn ?? v.price ?? v.regular_price ?? v.sale_price ?? null;

    // in_stock может приходить как boolean, либо stock_status
    let in_stock = true;
    if (typeof v.in_stock === "boolean") in_stock = v.in_stock;
    if (typeof v.stock_status === "string") in_stock = (v.stock_status === "instock");

    return {
      variation_id: variation_id ? Number(variation_id) : null,
      label: String(labelRaw),
      price_byn: price_byn !== null && price_byn !== undefined && price_byn !== "" ? Number(price_byn) : null,
      in_stock
    };
  });

  // если пусто — делаем один "ONE"
  if (out.length === 0) out = [{ variation_id: null, label: "ONE", price_byn: null, in_stock: true }];

  // удаляем пустые label
  out = out.map(v => ({
    ...v,
    label: (v.label && String(v.label).trim()) ? String(v.label).trim() : (v.variation_id ? `var ${v.variation_id}` : "ONE")
  }));

  return out;
}

function normalizeProduct(raw) {
  const id = Number(raw?.id ?? raw?.product_id ?? raw?.productId ?? 0);
  const title = raw?.title ?? raw?.name ?? "";
  const sku = raw?.sku ?? "";
  const category =
    raw?.category ??
    raw?.category_name ??
    (Array.isArray(raw?.categories) && raw.categories[0] && (raw.categories[0].name || raw.categories[0])) ??
    "Без категории";

  const description = stripHtml(raw?.description ?? raw?.description_html ?? raw?.desc ?? "");

  const variants = normalizeVariants(raw);

  const candidatePrices = variants
    .map(v => v.price_byn)
    .filter(n => typeof n === "number" && !Number.isNaN(n));

  const price_byn =
    candidatePrices.length > 0
      ? Math.min(...candidatePrices)
      : Number(raw?.price_byn ?? raw?.price ?? raw?.regular_price ?? 0);

  return {
    id,
    title: String(title || ""),
    sku: String(sku || ""),
    category: String(category || "Без категории"),
    photo_url: pickPhoto(raw),
    description,
    variants,
    price_byn
  };
}

async function apiGet(path) {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

async function apiPost(path, body) {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    let t = "";
    try { t = await r.text(); } catch {}
    throw new Error(`POST ${path} -> ${r.status} ${t}`);
  }
  return r.json();
}

// ===============================
// Data
// ===============================
let products = [];
let categories = [];

// ===============================
// Splash
// ===============================
function initSplash() {
  const hello = $("#hello");
  if (hello) hello.textContent = `Здравствуй, ${getUserName()}`;

  const hide = () => {
    const splash = $("#splash");
    if (splash) splash.classList.add("hidden");
  };

  setTimeout(hide, 900);
  setTimeout(hide, 3000);
}

// ===============================
// Navigation / Screens
// ===============================
const screenMap = {
  home: "#screen-home",
  categories: "#screen-categories",
  cart: "#screen-cart",
  faq: "#screen-faq",
  categoryProducts: "#screen-category-products",
  product: "#screen-product"
};

let navStack = [];

function showScreen(key, { push = true, title = null } = {}) {
  Object.values(screenMap).forEach(sel => {
    const el = $(sel);
    if (el) el.classList.remove("active");
  });

  const current = $(screenMap[key]);
  if (current) current.classList.add("active");

  const topTitle = $("#topTitle");
  if (topTitle) {
    if (title) topTitle.textContent = title;
    else {
      const defaultTitles = { home: "Главная", categories: "Категории", cart: "Корзина", faq: "FAQ" };
      topTitle.textContent = defaultTitles[key] || "";
    }
  }

  const isSub = (key === "product" || key === "categoryProducts");
  const back = $("#backBtn");
  if (back) back.classList.toggle("hidden", !isSub);

  if (push) navStack.push(key);
}

function goBack() {
  navStack.pop();
  const prev = navStack[navStack.length - 1] || "home";
  showScreen(prev, { push: false });
}

function setActiveTab(tabKey) {
  $$(".tab").forEach(btn => {
    const active = btn.dataset.tab === tabKey;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

// ===============================
// Render helpers
// ===============================
function buildImg(src, cls, alt) {
  const img = document.createElement("img");
  img.className = cls;
  img.src = src || FALLBACK_IMG;
  img.alt = alt || "";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.onerror = () => { img.onerror = null; img.src = FALLBACK_IMG; };
  return img;
}

function getMinPrice(p) {
  const arr = p.variants.map(v => v.price_byn).filter(n => typeof n === "number" && !Number.isNaN(n));
  if (arr.length) return Math.min(...arr);
  return Number(p.price_byn || 0);
}

// ===============================
// Home
// ===============================
function renderHome(list) {
  const root = $("#homeList");
  if (!root) return;
  root.innerHTML = "";

  for (const p of list) {
    const qtyInCart = getCartQtyForProduct(p.id);
    const inCart = qtyInCart > 0;

    const card = document.createElement("div");
    card.className = "card";

    const img = buildImg(p.photo_url, "card__img", p.title);

    const body = document.createElement("div");
    body.className = "card__body";
    body.innerHTML = `
      <div class="card__title">${escapeHtml(p.title)}</div>
      <div class="card__sku">${escapeHtml(p.sku)} • ${escapeHtml(p.category)}</div>
      <div class="card__row">
        <div class="price">${money(getMinPrice(p))}</div>
        ${inCart ? `<div class="badge">В корзине (${qtyInCart})</div>` : ``}
      </div>
    `;

    card.appendChild(img);
    card.appendChild(body);

    card.addEventListener("click", () => openProduct(p.id));
    root.appendChild(card);
  }
}

function initSearch() {
  const input = $("#searchInput");
  if (!input) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const filtered = products.filter(p =>
      p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
    renderHome(filtered);
  });
}

// ===============================
// Categories
// ===============================
function computeCategories() {
  const set = new Set(products.map(p => p.category || "Без категории"));
  categories = Array.from(set).sort((a,b) => a.localeCompare(b, "ru"));
}

function renderCategories() {
  computeCategories();

  const root = $("#catList");
  if (!root) return;
  root.innerHTML = "";

  for (const c of categories) {
    const count = products.filter(p => (p.category || "Без категории") === c).length;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="row__left">
        <div class="row__title">${escapeHtml(c)}</div>
        <div class="row__sub">${count} ${declOfNum(count, ["товар", "товара", "товаров"])}</div>
      </div>
      <div aria-hidden="true">›</div>
    `;
    row.addEventListener("click", () => openCategory(c));
    root.appendChild(row);
  }
}

function openCategory(categoryName) {
  const catTitle = $("#catTitle");
  if (catTitle) catTitle.textContent = categoryName;

  const list = products.filter(p => (p.category || "Без категории") === categoryName);

  const cc = $("#catCount");
  if (cc) cc.textContent = `${list.length} ${declOfNum(list.length, ["товар", "товара", "товаров"])}`;

  renderCategoryProducts(list);
  showScreen("categoryProducts", { title: categoryName });
}

function renderCategoryProducts(list) {
  const root = $("#catProducts");
  if (!root) return;
  root.innerHTML = "";

  for (const p of list) {
    const qtyInCart = getCartQtyForProduct(p.id);
    const inCart = qtyInCart > 0;

    const card = document.createElement("div");
    card.className = "card";

    const img = buildImg(p.photo_url, "card__img", p.title);

    const body = document.createElement("div");
    body.className = "card__body";
    body.innerHTML = `
      <div class="card__title">${escapeHtml(p.title)}</div>
      <div class="card__sku">${escapeHtml(p.sku)}</div>
      <div class="card__row">
        <div class="price">${money(getMinPrice(p))}</div>
        ${inCart ? `<div class="badge">В корзине (${qtyInCart})</div>` : ``}
      </div>
    `;

    card.appendChild(img);
    card.appendChild(body);

    card.addEventListener("click", () => openProduct(p.id));
    root.appendChild(card);
  }
}

// ===============================
// Product page
// ===============================
function openProduct(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;

  // выбираем первый доступный вариант
  let selected = p.variants.find(v => v.in_stock) || p.variants[0];
  let qty = 1;

  const root = $("#productView");
  if (!root) return;

  const priceForSelected = () => {
    const pr = selected?.price_byn;
    if (typeof pr === "number" && !Number.isNaN(pr)) return pr;
    return getMinPrice(p);
  };

  root.innerHTML = `
    <div id="prodImgWrap"></div>

    <div class="product__title">${escapeHtml(p.title)}</div>
    <div class="product__meta">
      <span>${escapeHtml(p.sku)}</span>
      <span>•</span>
      <span>${escapeHtml(p.category)}</span>
      <span>•</span>
      <strong id="prodPrice">${money(priceForSelected())}</strong>
    </div>

    <div class="pills" id="sizePills"></div>

    <div class="qty">
      <button class="qty__btn" id="qtyMinus">−</button>
      <div class="qty__val" id="qtyVal">1</div>
      <button class="qty__btn" id="qtyPlus">+</button>
    </div>

    <div id="inCartInfo"></div>

    <button class="btn btn--primary" id="addToCartBtn">Добавить в корзину</button>

    <div style="color: rgba(154,163,178,.92); line-height:1.35; font-size:13px">
      ${escapeHtml(p.description || "")}
    </div>
  `;

  // img
  const wrap = $("#prodImgWrap");
  if (wrap) {
    const img = buildImg(p.photo_url, "product__img", p.title);
    wrap.appendChild(img);
  }

  const pills = $("#sizePills");

  const renderPills = () => {
    if (!pills) return;
    pills.innerHTML = "";

    for (const v of p.variants) {
      const b = document.createElement("button");
      const active = (v === selected);
      b.className = "pill" + (active ? " active" : "");
      b.textContent = v.label; // вот тут теперь будут S/M/L, а не var 96
      if (!v.in_stock) {
        b.disabled = true;
        b.style.opacity = "0.45";
      }
      b.addEventListener("click", () => {
        if (!v.in_stock) return;
        selected = v;
        const pr = $("#prodPrice");
        if (pr) pr.textContent = money(priceForSelected());
        renderPills();
        renderInCartInfo();
      });
      pills.appendChild(b);
    }
  };

  const currentVariantKey = () => String(selected.variation_id ?? selected.label);

  const renderInCartInfo = () => {
    const cart = loadCart();
    const k = cartKey(p.id, currentVariantKey());
    const cur = cart[k]?.qty || 0;
    const el = $("#inCartInfo");
    if (!el) return;
    el.innerHTML = cur > 0
      ? `<div class="badge" style="display:inline-flex">Уже в корзине: ${cur} шт. (размер ${escapeHtml(selected.label)})</div>`
      : "";
  };

  const renderQty = () => {
    const val = $("#qtyVal");
    const minus = $("#qtyMinus");
    if (val) val.textContent = String(qty);
    if (minus) {
      minus.disabled = qty <= 1;
      minus.style.opacity = qty <= 1 ? "0.5" : "1";
    }
  };

  const plus = $("#qtyPlus");
  const minus = $("#qtyMinus");
  if (plus) plus.addEventListener("click", () => { qty++; renderQty(); });
  if (minus) minus.addEventListener("click", () => { qty = Math.max(1, qty - 1); renderQty(); });

  const addBtn = $("#addToCartBtn");
  if (addBtn) addBtn.addEventListener("click", () => {
    const cart = loadCart();
    const k = cartKey(p.id, currentVariantKey());
    const prev = cart[k]?.qty || 0;

    cart[k] = {
      productId: p.id,
      variantKey: currentVariantKey(),
      variationId: selected.variation_id ?? null,
      sizeLabel: selected.label,
      qty: prev + qty
    };

    saveCart(cart);

    renderHome(products);
    renderInCartInfo();
    alert("Добавлено в корзину ✅");
  });

  renderPills();
  renderQty();
  renderInCartInfo();

  showScreen("product", { title: "Товар" });
}

// ===============================
// Cart
// ===============================
function renderCart() {
  const cart = loadCart();
  const keys = Object.keys(cart);
  const root = $("#cartList");
  if (!root) return;

  root.innerHTML = "";
  let total = 0;

  if (keys.length === 0) {
    root.innerHTML = `
      <div class="row" style="cursor:default">
        <div class="row__left">
          <div class="row__title">Корзина пустая</div>
          <div class="row__sub">Добавьте товары на главной странице</div>
        </div>
      </div>
    `;
    const totalEl = $("#cartTotal");
    if (totalEl) totalEl.textContent = money(0);
    return;
  }

  for (const k of keys) {
    const item = cart[k];
    const p = products.find(x => x.id === item.productId);
    if (!p) continue;

    // цена: если у варианта есть price_byn — берём её
    const v = p.variants.find(vv => String(vv.variation_id ?? vv.label) === String(item.variantKey));
    const unit = (v && typeof v.price_byn === "number") ? v.price_byn : getMinPrice(p);

    const line = unit * item.qty;
    total += line;

    const row = document.createElement("div");
    row.className = "cartItem";

    const img = buildImg(p.photo_url, "cartItem__img", p.title);

    const mid = document.createElement("div");
    mid.className = "cartItem__mid";
    mid.innerHTML = `
      <div class="cartItem__title">${escapeHtml(p.title)}</div>
      <div class="cartItem__sub">${escapeHtml(p.sku)} • размер ${escapeHtml(item.sizeLabel || "")}</div>
      <div class="cartItem__sub"><strong>${money(unit)}</strong> за шт.</div>
    `;

    const right = document.createElement("div");
    right.className = "cartItem__right";
    right.innerHTML = `
      <div class="qty" style="gap:8px">
        <button class="qty__btn" data-act="minus" style="width:36px;height:36px">−</button>
        <div class="qty__val" style="min-width:22px">${item.qty}</div>
        <button class="qty__btn" data-act="plus" style="width:36px;height:36px">+</button>
      </div>
      <div style="font-weight:900">${money(line)}</div>
    `;

    row.appendChild(img);
    row.appendChild(mid);
    row.appendChild(right);

    right.querySelector('[data-act="plus"]').addEventListener("click", () => {
      const c = loadCart();
      c[k].qty += 1;
      saveCart(c);
      renderCart();
      renderHome(products);
    });

    right.querySelector('[data-act="minus"]').addEventListener("click", () => {
      const c = loadCart();
      c[k].qty -= 1;
      if (c[k].qty <= 0) delete c[k];
      saveCart(c);
      renderCart();
      renderHome(products);
    });

    root.appendChild(row);
  }

  const totalEl = $("#cartTotal");
  if (totalEl) totalEl.textContent = money(total);
}

async function checkout() {
  const tg = window.Telegram?.WebApp;
  const btn = $("#checkoutBtn");

  const cart = loadCart();
  const keys = Object.keys(cart);
  if (keys.length === 0) {
    alert("Корзина пустая");
    return;
  }

  const items = keys.map((k) => {
    const it = cart[k];
    const payload = {
      product_id: it.productId,
      quantity: it.qty
    };
    if (it.variationId) payload.variation_id = it.variationId;
    return payload;
  });

  const user = tg?.initDataUnsafe?.user;
  const customer = user ? { name: `${user.first_name || ""} ${user.last_name || ""}`.trim() } : null;

  try {
    if (btn) { btn.disabled = true; btn.textContent = "Создаю заказ…"; }

    const res = await apiPost("/create-order", {
      items,
      customer,
      telegram_init_data: tg?.initData || null
    });

    const payUrl = res?.pay_url;
    if (!payUrl) throw new Error("Backend не вернул pay_url");

    // чтобы не создавать 2 заказа — чистим корзину сразу после успеха
    saveCart({});
    renderCart();
    renderHome(products);

    try {
      tg?.openLink?.(payUrl);
    } catch {
      window.location.href = payUrl;
    }
  } catch (e) {
    alert(`Ошибка оформления: ${e?.message || e}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Оформить"; }
  }
}

function initCheckout() {
  const btn = $("#checkoutBtn");
  if (!btn) return;
  btn.addEventListener("click", checkout);
}

// ===============================
// FAQ
// ===============================
function renderFaq() {
  const root = $("#faqList");
  if (!root) return;
  root.innerHTML = "";

  for (const f of demoFaq) {
    const item = document.createElement("div");
    item.className = "faqItem";
    item.innerHTML = `
      <div class="faqQ">
        <span>${escapeHtml(f.question)}</span>
        <span aria-hidden="true">+</span>
      </div>
      <div class="faqA">${escapeHtml(f.answer)}</div>
    `;
    item.querySelector(".faqQ").addEventListener("click", () => {
      item.classList.toggle("open");
    });
    root.appendChild(item);
  }
}

// ===== Whole category header tap = back =====
function initCategoryHeaderBack() {
  const tap = document.getElementById("catHeaderTap");
  if (!tap) return;

  const go = () => {
    renderCategories();
    setActiveTab("categories");
    showScreen("categories", { title: "Категории" });
  };

  tap.addEventListener("click", go);
  tap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  });
}

// ===============================
// Tabs binding
// ===============================
function initTabs() {
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      setActiveTab(tab);

      if (tab === "home") {
        renderHome(products);
        showScreen("home", { title: "Главная" });
      }
      if (tab === "categories") {
        renderCategories();
        showScreen("categories", { title: "Категории" });
      }
      if (tab === "cart") {
        renderCart();
        showScreen("cart", { title: "Корзина" });
      }
      if (tab === "faq") {
        renderFaq();
        showScreen("faq", { title: "FAQ" });
      }
    });
  });

  const back = $("#backBtn");
  if (back) back.addEventListener("click", goBack);
}

// ===============================
// Disable zoom gestures (iOS)
// ===============================
function disableZoomGestures() {
  // iOS pinch
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("gesturechange", (e) => e.preventDefault());
  document.addEventListener("gestureend", (e) => e.preventDefault());

  // iOS double-tap
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
}

// ===============================
// Load catalog
// ===============================
async function loadCatalog() {
  // ждём: { products: [...] } или просто [...]
  const data = await apiGet("/catalog");
  const list = Array.isArray(data) ? data : (data.products || data.items || []);
  products = list.map(normalizeProduct).filter(p => p.id);

  // если backend отдаёт категории — можно потом использовать, но сейчас считаем по товарам
  computeCategories();
}

// ===============================
// Init
// ===============================
async function init() {
  const tg = window.Telegram?.WebApp;
  try { tg?.ready?.(); tg?.expand?.(); } catch {}

  disableZoomGestures();
  initSplash();
  initTabs();
  initCategoryHeaderBack();
  initSearch();
  initCheckout();

  updateCartDot();

  // Загружаем товары
  try {
    await loadCatalog();
  } catch (e) {
    // если не достучались до API — покажем понятную ошибку
    alert(`Не удалось загрузить каталог.\nПроверь API_BASE в app.js\nСейчас: ${API_BASE}\n\n${e?.message || e}`);
    products = [];
  }

  navStack = [];
  renderHome(products);
  showScreen("home", { title: "Главная" });
  setActiveTab("home");
}

document.addEventListener("DOMContentLoaded", init);


