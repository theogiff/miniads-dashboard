// ===== Miniads YouTube Preview — content.js =====

// Log d'injection
console.log("[Miniads] content.js chargé sur:", location.href);

// --- Constantes & utilitaires ---
const OVERLAY_CLASS = "miniads-overlay";
const BTN_CLASS = "miniads-add-btn";
const ORIGINAL_TITLE_ATTR = "data-miniads-original-title";
const TILE_SELECTORS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-compact-video-renderer"
];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// --- ON/OFF via storage (contrôlé depuis popup) ---
let miniadsEnabled = true;
chrome.storage?.local.get(["miniads_enabled"], (res) => {
  if (typeof res.miniads_enabled === "boolean") {
    miniadsEnabled = res.miniads_enabled;
  }
  if (miniadsEnabled) boot();
});
chrome.storage?.local.onChanged.addListener((changes) => {
  if ("miniads_enabled" in changes) {
    miniadsEnabled = changes.miniads_enabled.newValue;
    if (miniadsEnabled) boot();
    else teardown();
  }
});

function boot(){
  injectNoHoverStyle();
  attachAll();
  observeDom();
  ensureModal();
}
function teardown(){
  // retire boutons/overlays, ferme modal
  TILE_SELECTORS.forEach(sel => {
    $$(sel).forEach((card) => {
      const { thumb, titleEl } = getParts(card);
      if (thumb) {
        const btn = thumb.querySelector("button." + BTN_CLASS);
        if (btn) btn.remove();
        const ov = thumb.querySelector("." + OVERLAY_CLASS);
        if (ov) ov.remove();
      }
      if (titleEl && titleEl.hasAttribute(ORIGINAL_TITLE_ATTR)) {
        titleEl.textContent = titleEl.getAttribute(ORIGINAL_TITLE_ATTR);
        titleEl.removeAttribute(ORIGINAL_TITLE_ATTR);
      }
    });
  });
  removeModal();
}

// --- Bloquer l'aperçu vidéo au survol ---
let noHoverStyleInjected = false;
function injectNoHoverStyle(){
  if (noHoverStyleInjected) return;
  const style = document.createElement("style");
  style.textContent = `
    ytd-thumbnail:hover #hover-overlays,
    ytd-thumbnail:hover #mouseover-overlay,
    ytd-thumbnail video,
    ytd-thumbnail:hover video { display: none !important; }
  `;
  document.documentElement.appendChild(style);
  noHoverStyleInjected = true;
}

// --- Récupérer parties d'une tuile ---
function getParts(card){
  const thumb = card.querySelector("ytd-thumbnail") || card.querySelector("#thumbnail");
  const titleEl =
    card.querySelector("#video-title") ||
    card.querySelector("a#video-title") ||
    card.querySelector("yt-formatted-string#video-title") ||
    card.querySelector("h3 a");
  return { thumb, titleEl };
}

// --- Overlay miniature ---
function applyOverlay(card, imageUrl){
  const { thumb } = getParts(card);
  if (!thumb) return false;
  thumb.style.position = "relative";

  let overlay = thumb.querySelector("." + OVERLAY_CLASS);
  if (!overlay){
    overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;
    const br = getComputedStyle(thumb).borderRadius || "12px";
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      backgroundSize: "cover",
      backgroundPosition: "center",
      borderRadius: br,
      pointerEvents: "auto",
      zIndex: "5",
      cursor: "pointer"
    });
    overlay.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const link =
        card.querySelector("a#thumbnail") ||
        card.querySelector("a#video-title") ||
        card.querySelector("a#video-title-link") ||
        card.querySelector("a#video-title.ytd-rich-grid-media");
      if (link) link.click();
    });
    thumb.appendChild(overlay);
  }
  overlay.style.backgroundImage = imageUrl ? 'url("' + imageUrl + '")' : "none";
  return true;
}

// --- Modifier titre localement ---
function applyTitle(card, title){
  const { titleEl } = getParts(card);
  if (!titleEl) return false;
  if (!titleEl.hasAttribute(ORIGINAL_TITLE_ATTR)){
    titleEl.setAttribute(ORIGINAL_TITLE_ATTR, titleEl.textContent || "");
  }
  titleEl.textContent = title;
  return true;
}

// --- Reset d'une tuile ---
function resetCard(card){
  const { thumb, titleEl } = getParts(card);
  if (thumb){
    const ov = thumb.querySelector("." + OVERLAY_CLASS);
    if (ov) ov.remove();
  }
  if (titleEl && titleEl.hasAttribute(ORIGINAL_TITLE_ATTR)){
    titleEl.textContent = titleEl.getAttribute(ORIGINAL_TITLE_ATTR);
    titleEl.removeAttribute(ORIGINAL_TITLE_ATTR);
  }
}

// --- Bouton sur chaque tuile ---
function attachButtonToCard(card){
  if (card.__miniadsBtnAttached) return;
  const { thumb } = getParts(card);
  if (!thumb) return;

  card.__miniadsBtnAttached = true;
  thumb.style.position = "relative";

  const btn = document.createElement("button");
  btn.className = BTN_CLASS;
  btn.type = "button";
  btn.textContent = "Ajouter votre miniature";
  Object.assign(btn.style, {
    position: "absolute",
    top: "8px",
    right: "8px",
    zIndex: "6",
    background: "#ff7a00",
    color: "#111",
    border: "0",
    borderRadius: "999px",
    padding: "8px 10px",
    fontSize: "12px",
    fontWeight: "800",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,.35)"
  });

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModalForCard(card);
  });

  thumb.appendChild(btn);
}

function attachAll(){
  TILE_SELECTORS.forEach(sel => $$(sel).forEach(attachButtonToCard));
}
function observeDom(){
  const mo = new MutationObserver(() => {
    if (!miniadsEnabled) return;
    attachAll();
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

// --- Modal (Shadow DOM) ---
let modalHost = null, shadow = null, ui = null;
function ensureModal(){
  if (modalHost) return;
  modalHost = document.createElement("div");
  document.documentElement.appendChild(modalHost);
  shadow = modalHost.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999998;display:none;}
      .modal{position:fixed;inset:0;display:none;place-items:center;z-index:999999;}
      .card{width:min(760px,94vw);background:#181818;color:#fff;border:1px solid #2a2a2a;border-radius:16px;padding:16px;font-family:system-ui,Roboto,Arial,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5);}
      .row{display:grid;gap:10px;margin:10px 0;}
      label{font-size:13px;color:#ccc;}
      input[type="file"],input[type="url"],input[type="text"]{background:#111;border:1px solid #333;color:#eee;padding:10px;border-radius:10px;width:100%;}
      .preview{border:1px dashed #333;border-radius:12px;padding:10px;background:#0f0f0f}
      .preview img{max-width:100%;max-height:280px;display:block;margin:auto;border-radius:10px}
      .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;}
      .ghost{background:transparent;border:1px solid #333;color:#ddd;padding:8px 12px;border-radius:10px;cursor:pointer;}
      .apply{background:#fafafa;color:#111;border:0;padding:10px 16px;border-radius:10px;cursor:pointer;font-weight:700;}
    </style>
    <div class="backdrop" id="backdrop"></div>
    <div class="modal" id="modal">
      <div class="card">
        <h2>Ajouter votre miniature (Miniads)</h2>

        <div class="row">
          <label>Miniature (upload ou URL)</label>
          <input type="file" id="fileInput" accept="image/*" />
          <input type="url" id="urlInput" placeholder="https://exemple.com/miniature.jpg" />
          <div class="preview"><img id="thumbPreview" alt=""></div>
        </div>

        <div class="row">
          <label>Titre de la vidéo</label>
          <input type="text" id="titleInput" placeholder="Votre titre…" />
        </div>

        <div class="actions">
          <button class="ghost" id="applyAllBtn">Appliquer à toutes</button>
          <button class="ghost" id="resetBtn">Réinitialiser</button>
          <button class="ghost" id="resetAllBtn">Tout réinitialiser</button>
          <button class="ghost" id="cancelBtn">Fermer</button>
          <button class="apply" id="applyBtn">Appliquer</button>
        </div>
      </div>
    </div>
  `;
  ui = {
    backdrop: shadow.getElementById("backdrop"),
    modal: shadow.getElementById("modal"),
    fileInput: shadow.getElementById("fileInput"),
    urlInput: shadow.getElementById("urlInput"),
    titleInput: shadow.getElementById("titleInput"),
    thumbPreview: shadow.getElementById("thumbPreview"),
    applyBtn: shadow.getElementById("applyBtn"),
    applyAllBtn: shadow.getElementById("applyAllBtn"),
    resetBtn: shadow.getElementById("resetBtn"),
    resetAllBtn: shadow.getElementById("resetAllBtn"),
    cancelBtn: shadow.getElementById("cancelBtn")
  };

  ui.backdrop.addEventListener("click", closeModal);
  ui.cancelBtn.addEventListener("click", closeModal);

  // Image upload
  let imageDataUrl = localStorage.getItem("miniads_last_image") || "";
  if (imageDataUrl) ui.thumbPreview.src = imageDataUrl;

  ui.fileInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      imageDataUrl = String(r.result || "");
      ui.thumbPreview.src = imageDataUrl;
      try { localStorage.setItem("miniads_last_image", imageDataUrl); } catch {}
    };
    r.readAsDataURL(f);
  });
  ui.urlInput.addEventListener("change", () => {
    const url = (ui.urlInput.value || "").trim();
    if (!url) return;
    imageDataUrl = url;
    ui.thumbPreview.src = imageDataUrl;
    try { localStorage.setItem("miniads_last_image", imageDataUrl); } catch {}
  });

  // Actions
  ui.applyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!currentCard) { alert("Aucune tuile ciblée."); return; }
    const title = (ui.titleInput.value || "").trim();
    const img = ui.thumbPreview.src || "";
    if (img) applyOverlay(currentCard, img);
    if (title) applyTitle(currentCard, title);
    try { localStorage.setItem("miniads_last_title", title); } catch {}
    closeModal();
  });

  ui.applyAllBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const title = (ui.titleInput.value || "").trim();
    const img = ui.thumbPreview.src || "";
    const cards = TILE_SELECTORS.flatMap(sel => $$(sel));
    cards.forEach(c => {
      if (img) applyOverlay(c, img);
      if (title) applyTitle(c, title);
    });
    try { localStorage.setItem("miniads_last_title", title); } catch {}
    closeModal();
  });

  ui.resetBtn.addEventListener("click", () => {
    if (currentCard) resetCard(currentCard);
  });
  ui.resetAllBtn.addEventListener("click", () => {
    const cards = TILE_SELECTORS.flatMap(sel => $$(sel));
    cards.forEach(resetCard);
  });
}

function removeModal(){
  if (modalHost) {
    modalHost.remove();
    modalHost = null;
    shadow = null;
    ui = null;
  }
}

let currentCard = null;
function openModalForCard(card){
  currentCard = card;
  ensureModal();
  ui.backdrop.style.display = "block";
  ui.modal.style.display = "grid";
}
function closeModal(){
  if (!ui) return;
  ui.backdrop.style.display = "none";
  ui.modal.style.display = "none";
}

// Attacher boutons & observer
function pickFirstCard(){
  for (let i=0;i<TILE_SELECTORS.length;i++){
    const el = document.querySelector(TILE_SELECTORS[i]);
    if (el) return el;
  }
  return null;
}
