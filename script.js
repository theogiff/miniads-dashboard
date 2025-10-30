// --- Utilitaires simples ---
function getParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function parseCSV(text) {
  if (!text) return [];
  const rows = [];
  let value = "";
  let row = [];
  let inQuotes = false;

  const pushValue = () => {
    row.push(value);
    value = "";
  };

  const pushRow = () => {
    pushValue();
    rows.push(row);
    row = [];
  };

  const input = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        pushValue();
      } else if (char === "\n") {
        pushRow();
      } else {
        value += char;
      }
    }
  }

  pushValue();
  if (row.length > 1 || (row.length === 1 && row[0])) {
    rows.push(row);
  }

  const cleaned = rows
    .map(r => r.map((cell, idx) => {
      let v = cell ?? "";
      if (idx === 0) v = v.replace(/^\ufeff/, "");
      return v.trim();
    }))
    .filter(r => r.some(cell => cell));

  const headers = cleaned.shift();
  if (!headers) return [];

  return cleaned.map(r => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

function normalizeKey(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collectFieldKeys(rows) {
  const set = new Set();
  rows.forEach(r => {
    if (!r) return;
    Object.keys(r).forEach(key => set.add(key));
  });
  return Array.from(set);
}

function getFirstNonEmptyValue(rows, key) {
  if (!key) return "";
  for (const row of rows) {
    if (!row) continue;
    const value = row[key];
    if (value != null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function resolveFieldName(allKeys, manual, variants = []) {
  if (!allKeys.length && !manual) return null;

  const normalized = allKeys.map(key => ({ raw: key, norm: normalizeKey(key) }));
  const matchTarget = target => {
    const exact = normalized.find(entry => entry.norm === target);
    if (exact) return exact.raw;
    return normalized.find(entry => entry.norm.includes(target))?.raw || null;
  };

  if (manual) {
    const manualNorm = normalizeKey(manual);
    const manualMatch = matchTarget(manualNorm);
    if (manualMatch) return manualMatch;
    if (allKeys.includes(manual)) return manual;
  }

  for (const variant of variants) {
    const match = matchTarget(normalizeKey(variant));
    if (match) return match;
  }

  return manual || null;
}

function parseNumber(value) {
  if (value == null || value === "") return 0;
  const sanitized = String(value)
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  const num = Number.parseFloat(sanitized);
  return Number.isFinite(num) ? num : 0;
}

function formatCount(value) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function extractFirstUrl(value) {
  if (!value) return "";
  const clean = value.replace(/""/g, '"');
  const directMatch = clean.match(/https?:\/\/[^\s,"']+/i);
  if (directMatch) return directMatch[0];
  return clean
    .split(/[,;\n]/)
    .map(part => part.trim())
    .find(part => /^https?:\/\//i.test(part)) || "";
}

function flattenAirtableValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map(flattenAirtableValue)
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    if (typeof value.url === "string") return value.url;
    if (typeof value.text === "string") return value.text;
    if (typeof value.name === "string") return value.name;
    return Object.values(value)
      .map(flattenAirtableValue)
      .filter(Boolean)
      .join(" ");
  }
  return String(value);
}

// --- Configuration multi-clients ---
// Renseigne ici ton token d'accès Airtable (lecture seule) commun à tous les clients.
const DEFAULT_API_KEY = "patcwtLlGwr56ejaH.3366d5e270a09e8874feff12cf371bee81a82b0326a0b3e5da1ed7ced2bdb3de";
// Paramètres par défaut si tous les clients partagent la même base / table / vue.
const DEFAULT_BASE_ID = "app4xekxY53MuEQvK";
const DEFAULT_TABLE_ID = "tblnA0z8ooGAZYXIp";
const DEFAULT_VIEW_ID = "";
const DEFAULT_PSEUDO_FIELD = "Créateurs";
// Mappe chaque client à ses paramètres Airtable.
const CLIENTS = {
  // Exemple:
  // oseille: {
  //   label: "OseilleTV",
//   baseId: "appXXXXXXXXXXXXXX",
//   tableId: "tblYYYYYYYYYYYY",
//   view: "Vue filtrée Oseille",
//   accessKey: "client-secret-oseille", // requis dans l'URL ?key=...
//   filterByFormula: "{Créateurs} = 'OseilleTV'",
//   apiKey: "", // (optionnel) pour override du token global
//   greeting: ["Hey Oseille 👋 ravi de te revoir !", "Voici ton espace client..."] // (optionnel)
// }
};

const ADMIN_EMAIL = "test@test.fr";
const ADMIN_PASSWORD = "admin";
const ADMIN_SESSION_KEY = "miniads-admin-session";

function escapeFormulaValue(value) {
  return String(value || "").replace(/'/g, "''");
}

function slugToName(rawSlug) {
  if (!rawSlug) return "";
  const decoded = decodeURIComponent(rawSlug).trim();
  const withSpaces = /\s/.test(decoded) ? decoded : decoded.replace(/[-_]+/g, " ");
  const squeezed = withSpaces.replace(/\s+/g, " ").trim();
  if (!squeezed) return "";
  return squeezed
    .split(" ")
    .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : "")
    .join(" ");
}

function toSlug(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || value.toLowerCase();
}

function generateAccessKey(value = "") {
  const slug = toSlug(value);
  const salt = `${DEFAULT_BASE_ID || ""}|${DEFAULT_TABLE_ID || ""}`;
  const seed = `${slug}|${salt}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);
  return `mk-${hash.toString(36)}`;
}

function applyClientConfig(slug, options = {}) {
  if (!slug) return null;
  const normalizedSlug = toSlug(slug);
  const configEntry = CLIENTS[normalizedSlug] || CLIENTS[slug];
  const isFallback = !configEntry;

  if (isFallback && (!DEFAULT_BASE_ID || !DEFAULT_TABLE_ID)) {
    return null;
  }

  const apiKey = (configEntry && configEntry.apiKey) || DEFAULT_API_KEY;
  const baseId = (configEntry && configEntry.baseId) || DEFAULT_BASE_ID;
  const tableId = (configEntry && configEntry.tableId) || DEFAULT_TABLE_ID;
  const view = configEntry && configEntry.view !== undefined ? configEntry.view : DEFAULT_VIEW_ID;

  if (!apiKey || !baseId || !tableId) return null;

  const computedAccessKey = options.accessKeyOverride
    || (configEntry && configEntry.accessKey)
    || generateAccessKey(normalizedSlug);

  if (!options.bypassAccessKey) {
    const providedKey = getParam("key");
    if (computedAccessKey && providedKey !== computedAccessKey) {
      return null;
    }
  }

  if (airtableKeyInput) airtableKeyInput.value = apiKey;
  if (airtableBaseInput) airtableBaseInput.value = baseId;
  if (airtableTableInput) airtableTableInput.value = tableId;
  if (airtableViewInput) airtableViewInput.value = view || "";

  const label = options.labelOverride
    || (configEntry && configEntry.label)
    || slugToName(normalizedSlug);
  const formulaField = DEFAULT_PSEUDO_FIELD || "Créateurs";
  const autoFilter = configEntry ? configEntry.autoFilter !== false : true;
  const filter = (configEntry && configEntry.filterByFormula)
    || (autoFilter && label ? `LOWER({${formulaField}}) = '${escapeFormulaValue(label.toLowerCase())}'` : "");
  const greeting = configEntry && configEntry.greeting ? configEntry.greeting : null;

  return {
    apiKey,
    baseId,
    tableId,
    view,
    filterByFormula: filter,
    label,
    accessKey: computedAccessKey,
    greeting
  };
}

function setLoadingState() {
  if (summaryBody) {
    summaryBody.innerHTML = `<tr><td colspan="5" class="empty">Chargement…</td></tr>`;
  }
  setClientStats({ loading: true });
  updateOpenOrdersDisplay(0, { loading: true });
  if (document.body.classList.contains("client-mode")) {
    setClientContext(currentClientLabel);
  }
}

function handleLoadError(error) {
  const message = typeof error === "string" ? error : (error && error.message) || "Erreur de chargement";
  console.error(message, error);
  alert(message);
  setClientStats({ total: 0, monthly: 0, lastDate: null });
  updateOpenOrdersDisplay("—");
  if (summaryBody) {
    summaryBody.innerHTML = `<tr><td colspan="5" class="empty">Erreur de chargement.</td></tr>`;
  }
}

function renderRows(rows) {
  if (summaryBody) {
    summaryBody.innerHTML = `<tr><td colspan="5" class="empty">En attente de données…</td></tr>`;
  }

  if (!Array.isArray(rows) || !rows.length) {
    if (summaryBody) {
      summaryBody.innerHTML = `<tr><td colspan="5" class="empty">Aucune miniature trouvée avec cette source.</td></tr>`;
    }
    setClientStats({ total: 0, monthly: 0, lastDate: null });
    return;
  }

  const allKeys = collectFieldKeys(rows);
  let imageField = resolveFieldName(allKeys, null, [
    "miniature finale",
    "miniature",
    "miniature (url)",
    "aperçu",
    "apercu",
    "thumbnail",
    "image",
    "preview",
    "cover",
    "visuel",
    "attachment",
    "url",
    "lien miniature",
    "miniature finale url"
  ]);
  let dateField = resolveFieldName(allKeys, null, [
    "date de livraison",
    "livree le",
    "livré le",
    "livre le",
    "date de creation",
    "date de création",
    "date de rendu",
    "date de publication",
    "creation",
    "created at",
    "date",
    "date de creation"
  ]);
  let titleField = resolveFieldName(allKeys, null, [
    "titre",
    "title",
    "titre de la video",
    "video",
    "projet",
    "campaign",
    "task name",
    "titre de la video",
    "titre de la miniature"
  ]);
let creatorField = resolveFieldName(allKeys, null, [
    "pseudo",
    "createur",
    "créateur",
    "créateurs",
    "créateurs / clients",
    "clients",
    "liste clients",
    "client",
    "brand",
    "chaine",
    "channel",
    "creator",
    "client final"
]);
let quantityField = resolveFieldName(allKeys, null, [
    "nombre de miniatures",
    "nb miniatures",
    "miniatures commandées",
    "nombre de miniatures commandées",
    "nb miniatures commandees",
    "quantite",
    "quantité",
    "count",
    "quantity",
  "volume"
]);
let requestDateField = resolveFieldName(allKeys, null, [
  "date de la demande",
  "demande le",
  "date demande",
  "requested at",
  "request date",
  "created",
  "created time"
]);
let creationDateField = resolveFieldName(allKeys, null, [
  "date de creation",
  "date de création",
  "creation",
  "date de production",
  "date de rendu",
  "production date",
  "created at"
]);
let statusField = resolveFieldName(allKeys, null, [
  "status de la commande",
  "statut de la commande",
  "statut",
  "status",
  "etat",
  "état",
  "state",
  "progression"
]);
  if (!imageField) {
    imageField = allKeys.find(key => {
      const value = String(getFirstNonEmptyValue(rows, key) || "").toLowerCase();
      return /^https?:\/\//.test(value) || /\.(png|jpe?g|webp|gif)$/.test(value);
    }) || null;
    if (!imageField) {
      console.warn("Impossible de trouver une colonne Miniature. Colonnes disponibles :", allKeys);
    }
  }

  if (!creatorField) {
    creatorField = allKeys.find(key => {
      const norm = normalizeKey(key);
      if (/miniature|thumb|image|url|http|https|statut|status|date|prix|montant|facture|facturation|quantity|nombre|count/.test(norm)) return false;
      const value = getFirstNonEmptyValue(rows, key);
      if (!value) return false;
      const str = String(value).trim();
      if (!str) return false;
      if (/https?:\/\//i.test(str)) return false;
      if (!isNaN(Number(str))) return false;
      return true;
    }) || null;
  }

  if (!dateField) {
    dateField = allKeys.find(key => {
      const value = getFirstNonEmptyValue(rows, key);
      if (!value) return false;
      const dt = new Date(value);
      return !Number.isNaN(dt.getTime());
    }) || null;
  }

  if (!creationDateField) {
    creationDateField = allKeys.find(key => {
      const value = getFirstNonEmptyValue(rows, key);
      if (!value) return false;
      const dt = new Date(value);
      return !Number.isNaN(dt.getTime());
    }) || null;
  }

  if (!requestDateField) {
    requestDateField = allKeys.find(key => {
      const value = getFirstNonEmptyValue(rows, key);
      if (!value) return false;
      const dt = new Date(value);
      return !Number.isNaN(dt.getTime());
    }) || null;
  }

  if (!quantityField) {
    quantityField = allKeys.find(key => {
      const norm = normalizeKey(key);
      if (!/\b(nombre|nb|quantite|quantité|count|volume|miniature)\b/.test(norm)) return false;
      const value = getFirstNonEmptyValue(rows, key);
      if (!value) return false;
      const num = parseNumber(value);
      return Number.isFinite(num) && num > 0;
    }) || null;
  }

  if (creationDateField && dateField && creationDateField === dateField) {
    creationDateField = null;
  }
  if (creationDateField && requestDateField && creationDateField === requestDateField) {
    creationDateField = null;
  }
  if (requestDateField && dateField && requestDateField === dateField) {
    requestDateField = null;
  }

  const filteredRows = rows;
  const datePriority = [creationDateField, dateField, requestDateField, "created_time"];
  const sortedRows = Array.isArray(filteredRows)
    ? [...filteredRows].sort((a, b) => {
        const dateB = getRowDate(b, datePriority);
        const dateA = getRowDate(a, datePriority);
        const timeB = dateB ? dateB.getTime() : -Infinity;
        const timeA = dateA ? dateA.getTime() : -Infinity;
        if (timeB === timeA) return 0;
        return timeB - timeA;
      })
    : filteredRows;
  const datasetToRender = Array.isArray(sortedRows) ? sortedRows : filteredRows;

  let total = 0;
  let deliveredThisMonth = 0;
  let lastDelivered = null;
  let openOrders = 0;

  datasetToRender.forEach(r => {
    const d = dateField ? r[dateField] : null;
    const qty = quantityField ? parseNumber(r[quantityField]) : 1;
    total += qty;
    if (d && isSameMonth(d)) deliveredThisMonth += qty;
    if (d) {
      const dt = new Date(d);
      if (!Number.isNaN(dt.getTime()) && (!lastDelivered || dt > lastDelivered)) lastDelivered = dt;
    }

    if (document.body.classList.contains("client-mode") && creatorField && !currentClientLabel) {
      const rawCreator = (r[creatorField] || "").trim();
      if (rawCreator) setClientContext(rawCreator);
    }
  });

  setClientStats({
    total,
    monthly: deliveredThisMonth,
    lastDate: lastDelivered
  });

  if (summaryBody) {
    if (!creatorField && !titleField) {
      summaryBody.innerHTML = `<tr><td colspan="5" class="empty">Colonnes nécessaires introuvables.</td></tr>`;
      updateOpenOrdersDisplay("—");
    } else if (!filteredRows.length) {
      summaryBody.innerHTML = `<tr><td colspan="5" class="empty">Aucune miniature trouvée dans cette source.</td></tr>`;
      updateOpenOrdersDisplay(0);
    } else {
      summaryBody.innerHTML = "";
      datasetToRender.forEach(r => {
        const tr = document.createElement("tr");

        const creatorTd = document.createElement("td");
        creatorTd.textContent = creatorField ? (r[creatorField] || "—") : "—";
        tr.appendChild(creatorTd);

        const titleTd = document.createElement("td");
        titleTd.textContent = titleField ? (r[titleField] || "—") : "—";
        tr.appendChild(titleTd);

        const requestTd = document.createElement("td");
        requestTd.textContent = requestDateField ? formatDate(r[requestDateField]) : "—";
        tr.appendChild(requestTd);

        const creationTd = document.createElement("td");
        creationTd.textContent = creationDateField
          ? formatDate(r[creationDateField])
          : (dateField ? formatDate(r[dateField]) : "—");
        tr.appendChild(creationTd);

        const statusTd = document.createElement("td");
        let normalizedStatus = "";
        if (statusField) {
          const rawStatus = (r[statusField] || "").trim();
          if (rawStatus) {
            normalizedStatus = rawStatus
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
            const chip = document.createElement("span");
            chip.className = "status-chip";
            chip.dataset.status = normalizedStatus || "statut";
            chip.textContent = rawStatus;
            statusTd.appendChild(chip);
          } else {
            statusTd.textContent = "—";
          }
        } else {
          statusTd.textContent = "—";
        }
        tr.appendChild(statusTd);

        summaryBody.appendChild(tr);

        const doneStatuses = ["realisee", "livree", "terminee", "livre", "delivree", "complete", "done"];
        const isDone = normalizedStatus
          ? doneStatuses.some(statusToken => normalizedStatus.includes(statusToken))
          : false;
        if (!isDone) {
          openOrders += 1;
        }
      });
      updateOpenOrdersDisplay(openOrders);
    }
  }
}

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("fr-FR", { year:"numeric", month:"2-digit", day:"2-digit" });
}

function formatDateTime(d) {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isSameMonth(dateA, dateB = new Date()) {
  const a = new Date(dateA);
  if (isNaN(a)) return false;
  return a.getFullYear() === dateB.getFullYear() && a.getMonth() === dateB.getMonth();
}

// --- Sélecteurs ---
const grid = document.getElementById("grid");
const airtableKeyInput = document.getElementById("airtableKey");
const airtableBaseInput = document.getElementById("airtableBase");
const airtableTableInput = document.getElementById("airtableTable");
const airtableViewInput = document.getElementById("airtableView");
const airtableBtn = document.getElementById("loadAirtableBtn");
const summaryBody = document.getElementById("summaryBody");
const clientBadge = document.getElementById("clientBadge");
const clientTitle = document.getElementById("clientTitle");
const clientGreeting = document.getElementById("clientGreeting");
const adminLogin = document.getElementById("adminLogin");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminEmailInput = document.getElementById("adminEmail");
const adminPasswordInput = document.getElementById("adminPassword");
const adminLoginError = document.getElementById("adminLoginError");
const adminPanel = document.getElementById("adminPanel");
const clientSearchInput = document.getElementById("clientSearch");
const clientList = document.getElementById("clientList");
const shareBox = document.getElementById("shareBox");
const shareLinkInput = document.getElementById("shareLink");
const shareHint = document.getElementById("shareHint");
const copyShareBtn = document.getElementById("copyShareLink");
const loginWrapper = document.getElementById("loginWrapper");
const clientContainer = document.getElementById("clientContainer");
const adminLayout = document.getElementById("adminLayout");
const clientTableHost = document.getElementById("clientTableHost");
const adminTableHost = document.getElementById("adminTableHost");
const tableSection = document.getElementById("tableSection");
const adminTopTitle = document.getElementById("adminTopTitle");
const adminTopSubtitle = document.getElementById("adminTopSubtitle");
const adminNavLinks = Array.from(document.querySelectorAll(".sidebar-link[data-admin-view]"));
const adminViews = {
  dashboard: document.getElementById("adminDashboardView"),
  clients: adminPanel,
  extension: document.getElementById("adminExtensionView")
};
const totalThumbsEl = document.getElementById("totalThumbs");
const deliveredThisMonthEl = document.getElementById("deliveredThisMonth");
const monthlyDeliveryValueEl = document.getElementById("monthlyDeliveryValue");
const lastDeliveredEl = document.getElementById("lastDelivered");
const adminPeriodLabel = document.getElementById("adminPeriodLabel");
const adminFilterButtons = Array.from(document.querySelectorAll(".filter-chip[data-admin-range]"));
const adminStartInput = document.getElementById("adminStartDate");
const adminEndInput = document.getElementById("adminEndDate");
const adminApplyCustomBtn = document.getElementById("adminApplyCustom");
const adminKpiRevenueEl = document.getElementById("adminKpiRevenue");
const adminKpiClientsEl = document.getElementById("adminKpiClients");
const adminKpiAverageBasketEl = document.getElementById("adminKpiAverageBasket");
const adminKpiNewClientRateEl = document.getElementById("adminKpiNewClientRate");
const adminKpiActiveRateEl = document.getElementById("adminKpiActiveRate");
const adminKpiActiveTooltip = document.getElementById("adminKpiActiveTooltip");
const adminKpiOrdersPerClientEl = document.getElementById("adminKpiOrdersPerClient");
const adminKpiCltvEl = document.getElementById("adminKpiCltv");
const adminRevenueChartCanvas = document.getElementById("adminRevenueChart");
const adminClientsChartCanvas = document.getElementById("adminClientsChart");
const adminRatioChartCanvas = document.getElementById("adminRatioChart");
const adminRetentionChartCanvas = document.getElementById("adminRetentionChart");
const adminRevenueChartStatus = document.getElementById("adminRevenueChartStatus");
const adminClientsChartStatus = document.getElementById("adminClientsChartStatus");
const adminRatioChartStatus = document.getElementById("adminRatioChartStatus");
const adminRetentionChartStatus = document.getElementById("adminRetentionChartStatus");
const adminDashboardEmpty = document.getElementById("adminDashboardEmpty");
const adminActiveClientEl = document.getElementById("adminActiveClient");
const heroDateEl = document.getElementById("heroDate");
const heroLastDeliveryEl = document.getElementById("heroLastDeliveryValue");
const openOrdersEl = document.getElementById("openOrdersValue");
const clientInitialsEl = document.getElementById("clientInitials");
let currentClientLabel = "";
let activeAdminClient = null;
let discoveredClients = [];
let activeAdminView = "dashboard";
let lastDirectorySync = null;
let currentClientConfig = null;
const agencyState = {
  rawRows: [],
  normalized: [],
  fieldMap: {},
  firstOrderByClient: new Map(),
  charts: {
    revenue: null,
    clients: null,
    ratio: null,
    retention: null
  },
  filter: {
    preset: "12m",
    start: null,
    end: null
  },
  global: {
    totalRevenue: 0,
    totalOrders: 0,
    revenueByClient: new Map(),
    ordersByClient: new Map(),
    timelineByClient: new Map()
  }
};
let agencyInitialized = false;
let agencyLoading = false;

function ensureTableInHost(host) {
  if (!host || !tableSection) return;
  if (tableSection.parentElement !== host) {
    host.appendChild(tableSection);
  }
}

let chartThemeConfigured = false;
function configureChartsTheme() {
  if (chartThemeConfigured || typeof Chart === "undefined") return;
  chartThemeConfigured = true;
}

configureChartsTheme();

const ADMIN_VIEW_COPY = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Suivi en temps réel de l’activité Miniads."
  },
  clients: {
    title: "Mes clients",
    subtitle: "Sélectionne un créateur pour charger ses miniatures et copier son lien sécurisé."
  },
  extension: {
    title: "Extension YouTube",
    subtitle: "Installe l’extension pour afficher les visuels directement dans YouTube Studio."
  }
};

function setAdminView(view) {
  if (!view || !adminViews[view]) return;
  activeAdminView = view;
  adminNavLinks.forEach(link => {
    if (!link.dataset.adminView) return;
    link.classList.toggle("active", link.dataset.adminView === view);
  });
  Object.entries(adminViews).forEach(([name, section]) => {
    if (!section) return;
    section.classList.toggle("active", name === view);
  });
  const copy = ADMIN_VIEW_COPY[view];
  if (copy) {
    if (adminTopTitle) adminTopTitle.textContent = copy.title;
    if (adminTopSubtitle) adminTopSubtitle.textContent = copy.subtitle;
  }
  if (view === "dashboard") {
    initializeAgencyDashboard();
  }
  if (view === "clients") {
    ensureTableInHost(adminTableHost);
  }
}

function updateAdminDirectoryStats() {
  if (adminActiveClientEl && !activeAdminClient) {
    adminActiveClientEl.textContent = "—";
  }
}

function markLastSync() {
  lastDirectorySync = new Date();
}

ensureTableInHost(clientTableHost);

function showAdminUI() {
  document.body.classList.remove("client-mode");
  document.body.classList.add("admin-mode");
  if (loginWrapper) loginWrapper.classList.add("hidden");
  if (clientContainer) clientContainer.classList.add("hidden");
  if (adminLayout) adminLayout.classList.remove("admin-hidden");
  if (activeAdminView === "clients") ensureTableInHost(adminTableHost);
}

function showLoginUI() {
  document.body.classList.remove("admin-mode");
  document.body.classList.remove("client-mode");
  if (loginWrapper) loginWrapper.classList.remove("hidden");
  if (adminLayout) adminLayout.classList.add("admin-hidden");
  if (clientContainer) clientContainer.classList.remove("hidden");
  currentClientConfig = null;
  updateOpenOrdersDisplay("—");
  setClientContext("");
  ensureTableInHost(clientTableHost);
  if (shareBox) {
    shareBox.classList.remove("visible");
    if (shareLinkInput) shareLinkInput.value = "";
    if (shareHint) shareHint.textContent = "";
  }
}

function setClientStats({ total, monthly, lastDate, loading = false } = {}) {
  const totalValue = loading ? "…" : Number.isFinite(total) ? formatCount(total) : "0";
  const monthlyValue = loading ? "…" : Number.isFinite(monthly) ? formatCount(monthly) : "0";
  const lastValue = loading ? "…" : lastDate ? formatDate(lastDate) : "—";
  if (totalThumbsEl) totalThumbsEl.textContent = totalValue;
  if (deliveredThisMonthEl) deliveredThisMonthEl.textContent = monthlyValue;
  if (monthlyDeliveryValueEl) monthlyDeliveryValueEl.textContent = monthlyValue;
  if (lastDeliveredEl) lastDeliveredEl.textContent = lastValue;
  if (heroLastDeliveryEl) heroLastDeliveryEl.textContent = lastValue;
}

function formatCurrency(value, options = {}) {
  if (!Number.isFinite(value)) return "—";
  const defaults = { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 };
  return value.toLocaleString("fr-FR", { ...defaults, ...options });
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits })}%`;
}

function formatFriendlyDate(date = new Date()) {
  try {
    const formatted = date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "long"
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch (err) {
    return formatDate(date);
  }
}

function parseDateValue(value) {
  if (!value) return null;
  const dt = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function getRowDate(row, preferredFields = []) {
  if (!row) return null;
  for (const key of preferredFields) {
    if (!key) continue;
    const candidate = parseDateValue(row[key]);
    if (candidate) return candidate;
  }
  return parseDateValue(row.created_time);
}

function updateOpenOrdersDisplay(value, { loading = false } = {}) {
  if (!openOrdersEl) return;
  if (loading) {
    openOrdersEl.textContent = "…";
    return;
  }
  if (typeof value === "string") {
    openOrdersEl.textContent = value;
    return;
  }
  if (Number.isFinite(value)) {
    openOrdersEl.textContent = formatCount(Math.max(0, value));
    return;
  }
  openOrdersEl.textContent = "—";
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function computeActivePeriod(filter = agencyState.filter) {
  const now = new Date();
  const end = filter.end ? endOfDay(filter.end) : endOfDay(now);
  let start = filter.start ? startOfDay(filter.start) : null;
  let label = "Toutes les périodes";

  switch (filter.preset) {
    case "30d": {
      start = start || startOfDay(new Date(end));
      start.setDate(start.getDate() - 29);
      label = "Vue sur les 30 derniers jours";
      break;
    }
    case "6m": {
      const anchor = new Date(end.getFullYear(), end.getMonth(), 1);
      start = start || startOfDay(new Date(anchor.getFullYear(), anchor.getMonth() - 5, 1));
      label = "Vue sur les 6 derniers mois";
      break;
    }
    case "12m": {
      const anchor = new Date(end.getFullYear(), end.getMonth(), 1);
      start = start || startOfDay(new Date(anchor.getFullYear(), anchor.getMonth() - 11, 1));
      label = "Vue sur les 12 derniers mois";
      break;
    }
    case "custom": {
      if (!start) start = startOfDay(new Date(end.getFullYear(), end.getMonth(), 1));
      label = `Du ${formatDate(start)} au ${formatDate(end)}`;
      break;
    }
    default: {
      const anchor = new Date(end.getFullYear(), end.getMonth(), 1);
      start = start || startOfDay(new Date(anchor.getFullYear(), anchor.getMonth() - 11, 1));
      label = "Vue globale (12 mois par défaut)";
    }
  }

  return { start, end, label };
}

function updateFilterButtonsUI() {
  if (!adminFilterButtons.length) return;
  const activePreset = agencyState.filter.preset;
  adminFilterButtons.forEach(button => {
    const preset = button.dataset.adminRange;
    button.classList.toggle("active", preset === activePreset);
  });
}

function setDashboardPreset(preset) {
  if (!preset) return;
  agencyState.filter.preset = preset;
  if (preset !== "custom") {
    agencyState.filter.start = null;
    agencyState.filter.end = null;
    if (adminStartInput) adminStartInput.value = "";
    if (adminEndInput) adminEndInput.value = "";
  }
  updateFilterButtonsUI();
  updateAdminDashboard();
}

function applyCustomDateRange() {
  if (!adminStartInput || !adminEndInput) return;
  const startValue = adminStartInput.value ? new Date(adminStartInput.value) : null;
  const endValue = adminEndInput.value ? new Date(adminEndInput.value) : null;
  if (startValue && endValue && startValue.getTime() > endValue.getTime()) {
    alert("La date de début doit précéder la date de fin.");
    return;
  }
  agencyState.filter.preset = "custom";
  agencyState.filter.start = startValue ? startOfDay(startValue) : null;
  agencyState.filter.end = endValue ? endOfDay(endValue) : null;
  updateFilterButtonsUI();
  updateAdminDashboard();
}

function displayDashboardEmptyState(show) {
  if (adminDashboardEmpty) {
    adminDashboardEmpty.classList.toggle("hidden", !show);
  }
}

const monthLabelFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });

function formatMonthLabel(date) {
  return monthLabelFormatter.format(date);
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthlyTimeline(start, end) {
  const buckets = [];
  if (!start || !end) return buckets;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const limit = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor.getTime() <= limit.getTime()) {
    buckets.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
}

function computeMovingAverage(values, windowSize = 3) {
  return values.map((value, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const subset = values.slice(start, index + 1).filter(v => Number.isFinite(v));
    if (!subset.length) return null;
    const sum = subset.reduce((acc, current) => acc + current, 0);
    return sum / subset.length;
  });
}

async function fetchAirtableRows({ apiKey, baseId, tableId, view, filterByFormula } = {}, options = {}) {
  if (!apiKey || !baseId || !tableId) {
    throw new Error("Identifiants Airtable manquants.");
  }

  const safeBase = encodeURIComponent(baseId.trim());
  const safeTable = encodeURIComponent(tableId.trim());
  const baseUrl = `https://api.airtable.com/v0/${safeBase}/${safeTable}`;
  const allRows = [];
  const fields = Array.isArray(options.fields) ? options.fields.filter(Boolean) : null;
  let offset;

  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (view) params.set("view", view.trim());
    if (filterByFormula) params.set("filterByFormula", filterByFormula);
    if (offset) params.set("offset", offset);
    if (fields) fields.forEach(field => params.append("fields[]", field));

    const response = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });

    const payloadText = await response.text();
    let payload;
    try {
      payload = payloadText ? JSON.parse(payloadText) : null;
    } catch (err) {
      console.error("Réponse Airtable invalide :", payloadText);
      throw new Error("Réponse Airtable illisible. Vérifie les identifiants.");
    }

    if (!response.ok) {
      const errMsg = payload && payload.error && payload.error.message
        ? payload.error.message
        : `${response.status} ${response.statusText}`;
      throw new Error(`Airtable : ${errMsg}`);
    }

    const records = (payload && payload.records) || [];
    records.forEach(record => {
      const fieldsData = record.fields || {};
      const row = {};
      Object.keys(fieldsData).forEach(key => {
        row[key] = flattenAirtableValue(fieldsData[key]);
      });
      if (!row.created_time && record.createdTime) {
        row.created_time = record.createdTime;
      }
      allRows.push(row);
    });

    offset = payload && payload.offset;
  } while (offset);

  return allRows;
}

const rawModeParam = getParam("mode");
const rawClientParam = getParam("client");
const isAdminRoute = rawModeParam === "admin" || !rawClientParam;
const clientParam = isAdminRoute ? null : rawClientParam;
const csvParam = null;

function isLikelyNumericColumn(rows, field) {
  if (!field) return false;
  const sample = getFirstNonEmptyValue(rows, field);
  if (sample === undefined || sample === null || sample === "") return false;
  const num = parseNumber(sample);
  return Number.isFinite(num);
}

function detectAgencyFields(rows) {
  if (!Array.isArray(rows) || !rows.length) return {};
  const allKeys = collectFieldKeys(rows);

  const creatorField = resolveFieldName(allKeys, DEFAULT_PSEUDO_FIELD, [
    DEFAULT_PSEUDO_FIELD,
    "pseudo",
    "client",
    "client final",
    "créateur",
    "créateurs",
    "clients",
    "chaine",
    "channel",
    "brand",
    "creator"
  ]);

  const dateField = resolveFieldName(allKeys, null, [
    "date de livraison",
    "date de création",
    "date de rendu",
    "date",
    "created at",
    "creation",
    "livré le",
    "livraison",
    "deadline"
  ]);

  const requestDateField = resolveFieldName(allKeys, null, [
    "date de la demande",
    "demande le",
    "request date",
    "created",
    "created time"
  ]);

  const creationDateField = resolveFieldName(allKeys, null, [
    "date de création",
    "date de production",
    "créé le",
    "production date",
    "created at"
  ]);

  let revenueField = resolveFieldName(allKeys, null, [
    "montant",
    "montant ht",
    "montant ttc",
    "total",
    "total ttc",
    "total ht",
    "chiffre d'affaires",
    "ca",
    "tarif",
    "prix",
    "amount",
    "revenue",
    "budget",
    "facture",
    "paiement",
    "fees",
    "sales"
  ]);

  let quantityField = resolveFieldName(allKeys, null, [
    "nombre de miniatures",
    "nb miniatures",
    "miniatures commandées",
    "nombre de miniatures commandées",
    "nb miniatures commandees",
    "quantite",
    "quantité",
    "count",
    "quantity",
    "volume"
  ]);

  if (revenueField && !isLikelyNumericColumn(rows, revenueField)) {
    revenueField = null;
  }

  if (!revenueField) {
    const fallback = allKeys.find(key => {
      if (key === quantityField) return false;
      const norm = normalizeKey(key);
      if (/date|client|statut|status|titre|title|nom|description|commentaire|note|status|phase|lien|url/.test(norm)) {
        return false;
      }
      return isLikelyNumericColumn(rows, key);
    });
    if (fallback) revenueField = fallback;
  }

  return {
    creatorField,
    dateField,
    requestDateField,
    creationDateField,
    revenueField,
    quantityField
  };
}

function selectBestDate(row, fields) {
  if (!row || !fields) return null;
  const sources = [fields.creationDateField, fields.dateField, fields.requestDateField, "created_time"];
  for (const source of sources) {
    if (!source || !row[source]) continue;
    const dt = parseDateValue(row[source]);
    if (dt) return dt;
  }
  return null;
}

function prepareAgencyDataset(rows) {
  agencyState.rawRows = Array.isArray(rows) ? rows.slice() : [];
  agencyState.fieldMap = detectAgencyFields(rows);
  agencyState.normalized = [];
  agencyState.firstOrderByClient = new Map();
  agencyState.global = {
    totalRevenue: 0,
    totalOrders: 0,
    revenueByClient: new Map(),
    ordersByClient: new Map(),
    timelineByClient: new Map()
  };

  if (!Array.isArray(rows) || !rows.length) {
    updateAdminDashboard();
    return;
  }

  if (!agencyState.fieldMap.revenueField) {
    console.warn("Aucune colonne Montant détectée : le chiffre d'affaires sera considéré comme égal à 0.");
  }
  if (!agencyState.fieldMap.dateField && !agencyState.fieldMap.creationDateField && !agencyState.fieldMap.requestDateField) {
    console.warn("Aucune colonne Date détectée pour les indicateurs.");
  }

  const normalized = [];
  rows.forEach(row => {
    const date = selectBestDate(row, agencyState.fieldMap);
    if (!date) return;
    const client = agencyState.fieldMap.creatorField ? String(row[agencyState.fieldMap.creatorField] || "").trim() : "";
    const revenue = agencyState.fieldMap.revenueField ? parseNumber(row[agencyState.fieldMap.revenueField]) : 0;
    normalized.push({
      row,
      client,
      date,
      time: date.getTime(),
      revenue: Number.isFinite(revenue) ? revenue : 0
    });
    if (client) {
      const prevRevenue = agencyState.global.revenueByClient.get(client) || 0;
      agencyState.global.revenueByClient.set(client, prevRevenue + (Number.isFinite(revenue) ? revenue : 0));
      const prevOrders = agencyState.global.ordersByClient.get(client) || 0;
      agencyState.global.ordersByClient.set(client, prevOrders + 1);
      const timeline = agencyState.global.timelineByClient.get(client) || [];
      timeline.push(date);
      agencyState.global.timelineByClient.set(client, timeline);
    }
    if (Number.isFinite(revenue)) {
      agencyState.global.totalRevenue += revenue;
    }
    agencyState.global.totalOrders += 1;
  });

  normalized.sort((a, b) => a.time - b.time);
  agencyState.global.timelineByClient.forEach(list => list.sort((a, b) => a.getTime() - b.getTime()));
  agencyState.normalized = normalized;

  normalized.forEach(entry => {
    if (!entry.client) return;
    const existing = agencyState.firstOrderByClient.get(entry.client);
    if (!existing || entry.time < existing.getTime()) {
      agencyState.firstOrderByClient.set(entry.client, entry.date);
    }
  });

  agencyState.totals = {
    uniqueClients: agencyState.firstOrderByClient.size
  };

  updateFilterButtonsUI();
  updateAdminDashboard();
}

function renderRevenueChart(labels, revenueValues, movingAverage) {
  if (!adminRevenueChartCanvas) return;
  if (typeof Chart === "undefined") {
    if (adminRevenueChartStatus) adminRevenueChartStatus.textContent = "Chart.js requis";
    return;
  }

  const ctx = adminRevenueChartCanvas.getContext("2d");
  if (!agencyState.charts.revenue) {
    agencyState.charts.revenue = new Chart(adminRevenueChartCanvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "CA mensuel",
            data: revenueValues,
            backgroundColor: "rgba(255,142,60,0.75)",
            borderRadius: 12,
            maxBarThickness: 48
          },
          {
            type: "line",
            label: "Moyenne mobile",
            data: movingAverage,
            borderColor: "#1e1f24",
            backgroundColor: "rgba(30,31,36,0.08)",
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            spanGaps: true
          }
        ]
      },
      options: {
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label(context) {
                const label = context.dataset.label || "";
                const value = Number(context.parsed.y || 0);
                return `${label} : ${formatCurrency(value, { maximumFractionDigits: 0 })}`;
              }
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback(value) {
                return formatCurrency(Number(value), { maximumFractionDigits: 0 });
              }
            },
            grid: { color: "rgba(30,31,36,0.08)" }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  } else {
    const chart = agencyState.charts.revenue;
    chart.data.labels = labels;
    chart.data.datasets[0].data = revenueValues;
    chart.data.datasets[1].data = movingAverage;
    chart.update();
  }
}

function renderClientsChart(labels, clientTotals) {
  if (!adminClientsChartCanvas) return;
  if (typeof Chart === "undefined") {
    if (adminClientsChartStatus) adminClientsChartStatus.textContent = "Chart.js requis";
    return;
  }

  if (!agencyState.charts.clients) {
    agencyState.charts.clients = new Chart(adminClientsChartCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Clients cumulés",
            data: clientTotals,
            borderColor: "rgba(61,181,166,1)",
            backgroundColor: "rgba(61,181,166,0.15)",
            borderWidth: 3,
            tension: 0.25,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                return `${formatCount(Number(context.parsed.y || 0))} clients`;
              }
            }
          }
        },
        scales: {
          y: {
            ticks: {
              precision: 0,
              callback(value) {
                return formatCount(Number(value));
              }
            },
            grid: { color: "rgba(30,31,36,0.08)" }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  } else {
    const chart = agencyState.charts.clients;
    chart.data.labels = labels;
    chart.data.datasets[0].data = clientTotals;
    chart.update();
  }
}

function renderRatioChart(newClients, existingClients) {
  if (!adminRatioChartCanvas) return;
  if (typeof Chart === "undefined") {
    if (adminRatioChartStatus) adminRatioChartStatus.textContent = "Chart.js requis";
    return;
  }

  const dataset = [Math.max(newClients, 0), Math.max(existingClients, 0)];
  const labels = ["Nouveaux", "Existants"];

  if (!agencyState.charts.ratio) {
    agencyState.charts.ratio = new Chart(adminRatioChartCanvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: dataset,
            backgroundColor: ["rgba(255,142,60,0.9)", "rgba(30,31,36,0.15)"],
            borderWidth: 0,
            hoverOffset: 4
          }
        ]
      },
      options: {
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label(context) {
                const label = context.label || "";
                const value = context.parsed;
                return `${label} : ${formatCount(value)} clients`;
              }
            }
          }
        },
        cutout: "68%"
      }
    });
  } else {
    const chart = agencyState.charts.ratio;
    chart.data.datasets[0].data = dataset;
    chart.update();
  }
}

function renderRetentionChart(labels, datasetMatrix) {
  if (!adminRetentionChartCanvas) return;
  if (typeof Chart === "undefined") {
    if (adminRetentionChartStatus) adminRetentionChartStatus.textContent = "Chart.js requis";
    return;
  }

  const datasets = datasetMatrix.map(item => ({
    label: item.label,
    data: item.values,
    borderColor: item.color,
    backgroundColor: item.fill,
    borderWidth: 2,
    tension: 0.3,
    fill: false,
    spanGaps: true
  }));

  if (!agencyState.charts.retention) {
    agencyState.charts.retention = new Chart(adminRetentionChartCanvas, {
      type: "line",
      data: {
        labels,
        datasets
      },
      options: {
        plugins: {
          tooltip: {
            callbacks: {
              label(context) {
                const label = context.dataset.label || "";
                const value = Number(context.parsed.y || 0);
                return `${label} : ${value.toFixed(1)}%`;
              }
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: {
              callback(value) {
                return `${value}%`;
              }
            },
            grid: { color: "rgba(30,31,36,0.08)" }
          },
          x: {
            grid: { color: "rgba(30,31,36,0.06)" }
          }
        }
      }
    });
  } else {
    const chart = agencyState.charts.retention;
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update();
  }
}

function updateAdminDashboard() {
  if (!isAdminRoute) return;

  const hasData = Array.isArray(agencyState.normalized) && agencyState.normalized.length > 0;
  if (!hasData) {
    if (adminPeriodLabel) adminPeriodLabel.textContent = "Aucune donnée disponible";
    if (adminKpiRevenueEl) adminKpiRevenueEl.textContent = "—";
    if (adminKpiClientsEl) adminKpiClientsEl.textContent = "—";
    if (adminKpiAverageBasketEl) adminKpiAverageBasketEl.textContent = "—";
    if (adminKpiNewClientRateEl) adminKpiNewClientRateEl.textContent = "—";
    if (adminKpiActiveRateEl) adminKpiActiveRateEl.textContent = "—";
    if (adminKpiActiveTooltip) adminKpiActiveTooltip.textContent = "—";
    if (adminKpiOrdersPerClientEl) adminKpiOrdersPerClientEl.textContent = "—";
    if (adminKpiCltvEl) adminKpiCltvEl.textContent = "—";
    if (adminRevenueChartStatus) adminRevenueChartStatus.textContent = "—";
    if (adminClientsChartStatus) adminClientsChartStatus.textContent = "—";
    if (adminRatioChartStatus) adminRatioChartStatus.textContent = "—";
    if (adminRetentionChartStatus) adminRetentionChartStatus.textContent = "—";
    displayDashboardEmptyState(true);
    renderRevenueChart([], [], []);
    renderClientsChart([], []);
    renderRatioChart(0, 0);
    renderRetentionChart([], []);
    return;
  }

  const { start, end, label } = computeActivePeriod();
  updateFilterButtonsUI();
  if (adminPeriodLabel) adminPeriodLabel.textContent = label;
  const dashboardCopy = ADMIN_VIEW_COPY.dashboard;
  if (adminTopSubtitle) {
    const base = dashboardCopy ? dashboardCopy.subtitle : "";
    adminTopSubtitle.textContent = base ? `${base} — ${label}` : label;
  }

  const startTime = start ? start.getTime() : Number.NEGATIVE_INFINITY;
  const endTime = end ? end.getTime() : Number.POSITIVE_INFINITY;

  const filtered = agencyState.normalized.filter(entry => entry.time >= startTime && entry.time <= endTime);
  const hasFiltered = filtered.length > 0;
  displayDashboardEmptyState(!hasFiltered);

  if (!hasFiltered) {
    if (adminKpiRevenueEl) adminKpiRevenueEl.textContent = "—";
    if (adminKpiClientsEl) adminKpiClientsEl.textContent = "—";
    if (adminKpiAverageBasketEl) adminKpiAverageBasketEl.textContent = "—";
    if (adminKpiNewClientRateEl) adminKpiNewClientRateEl.textContent = "—";
    if (adminKpiActiveRateEl) adminKpiActiveRateEl.textContent = "—";
    if (adminKpiActiveTooltip) adminKpiActiveTooltip.textContent = "—";
    if (adminKpiOrdersPerClientEl) adminKpiOrdersPerClientEl.textContent = "—";
    if (adminKpiCltvEl) adminKpiCltvEl.textContent = "—";
    if (adminRevenueChartStatus) adminRevenueChartStatus.textContent = "Aucune donnée";
    if (adminClientsChartStatus) adminClientsChartStatus.textContent = "Aucune donnée";
    if (adminRatioChartStatus) adminRatioChartStatus.textContent = "Aucune donnée";
    if (adminRetentionChartStatus) adminRetentionChartStatus.textContent = "Aucune donnée";
    renderRevenueChart([], [], []);
    renderClientsChart([], []);
    renderRatioChart(0, 0);
    renderRetentionChart([], []);
    return;
  }

  const totalRevenue = filtered.reduce((sum, entry) => sum + (Number.isFinite(entry.revenue) ? entry.revenue : 0), 0);
  const totalOrders = filtered.length;
  const clientsSet = new Set(filtered.map(entry => entry.client).filter(Boolean));
  const activeClientsCount = clientsSet.size;
  const totalKnownClients = agencyState.firstOrderByClient ? agencyState.firstOrderByClient.size : activeClientsCount;

  let newClientsCount = 0;
  const startBoundary = start ? start.getTime() : Number.NEGATIVE_INFINITY;
  const endBoundary = end ? end.getTime() : Number.POSITIVE_INFINITY;
  clientsSet.forEach(client => {
    const firstDate = agencyState.firstOrderByClient.get(client);
    if (!firstDate) return;
    const firstTime = firstDate.getTime();
    if (firstTime >= startBoundary && firstTime <= endBoundary) {
      newClientsCount += 1;
    }
  });

  const totalExisting = Math.max(activeClientsCount - newClientsCount, 0);
  const averageBasket = totalOrders ? totalRevenue / totalOrders : 0;
  const newClientsRate = activeClientsCount ? (newClientsCount / activeClientsCount) * 100 : 0;

  if (adminKpiRevenueEl) adminKpiRevenueEl.textContent = formatCurrency(totalRevenue, { maximumFractionDigits: 0 });
  if (adminKpiClientsEl) adminKpiClientsEl.textContent = formatCount(activeClientsCount);
  if (adminKpiAverageBasketEl) adminKpiAverageBasketEl.textContent = formatCurrency(averageBasket, { maximumFractionDigits: 2 });
  if (adminKpiNewClientRateEl) adminKpiNewClientRateEl.textContent = formatPercent(newClientsRate);

  const globalRevenueValues = Array.from(agencyState.global.revenueByClient.values());
  const globalOrdersValues = Array.from(agencyState.global.ordersByClient.values());
  const globalRevenueSum = globalRevenueValues.reduce((sum, value) => sum + value, 0);
  const globalOrdersSum = globalOrdersValues.reduce((sum, value) => sum + value, 0);
  const globalClientCount = agencyState.global.revenueByClient.size || totalKnownClients || activeClientsCount;
  const ordersPerClientAvg = globalClientCount ? globalOrdersSum / globalClientCount : 0;
  const cltvAvg = globalClientCount ? globalRevenueSum / globalClientCount : 0;

  const activeRate = totalKnownClients ? (activeClientsCount / totalKnownClients) * 100 : 0;
  if (adminKpiActiveRateEl) adminKpiActiveRateEl.textContent = formatPercent(activeRate, 1);
  if (adminKpiActiveTooltip) adminKpiActiveTooltip.textContent = `${formatCount(activeClientsCount)} actifs / ${formatCount(totalKnownClients)} clients`;
  if (adminKpiOrdersPerClientEl) adminKpiOrdersPerClientEl.textContent = ordersPerClientAvg.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  if (adminKpiCltvEl) adminKpiCltvEl.textContent = formatCurrency(cltvAvg, { maximumFractionDigits: 0 });

  if (adminRevenueChartStatus) {
    const statusText = lastDirectorySync ? `MAJ ${formatDateTime(lastDirectorySync)}` : `${totalOrders} commandes`;
    adminRevenueChartStatus.textContent = statusText;
  }
  if (adminClientsChartStatus) adminClientsChartStatus.textContent = `${formatCount(totalKnownClients)} clients`;
  if (adminRatioChartStatus) adminRatioChartStatus.textContent = `${formatCount(newClientsCount)} nouveaux`;
  if (adminRetentionChartStatus) adminRetentionChartStatus.textContent = `${formatCount(totalKnownClients)} clients analysés`;

  const rangeStart = start || (filtered[0] ? startOfDay(filtered[0].date) : null);
  const rangeEnd = end || (filtered[filtered.length - 1] ? endOfDay(filtered[filtered.length - 1].date) : null);
  const timeline = buildMonthlyTimeline(rangeStart, rangeEnd);
  const monthKeys = timeline.map(getMonthKey);
  const monthIndex = new Map();
  monthKeys.forEach((key, idx) => monthIndex.set(key, idx));

  const revenuePerMonth = new Array(timeline.length).fill(0);
  filtered.forEach(entry => {
    const key = getMonthKey(entry.date);
    const idx = monthIndex.get(key);
    if (idx !== undefined) {
      revenuePerMonth[idx] += entry.revenue || 0;
    }
  });

  const movingAverage = computeMovingAverage(revenuePerMonth);
  const timelineLabels = timeline.map(formatMonthLabel);

  const clientTotals = timeline.map(monthStart => {
    const monthEnd = endOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));
    let count = 0;
    agencyState.firstOrderByClient.forEach(firstDate => {
      if (firstDate.getTime() <= monthEnd.getTime()) count += 1;
    });
    return count;
  });

  const retentionBuckets = [
    { label: "+1 mois", months: 1, color: "rgba(123,110,255,1)", fill: "rgba(123,110,255,0.2)" },
    { label: "+3 mois", months: 3, color: "rgba(61,181,166,1)", fill: "rgba(61,181,166,0.2)" },
    { label: "+6 mois", months: 6, color: "rgba(255,142,60,1)", fill: "rgba(255,142,60,0.25)" },
    { label: "+12 mois", months: 12, color: "rgba(30,31,36,0.8)", fill: "rgba(30,31,36,0.18)" }
  ];

  const timelineForRetention = timeline;
  const retentionLabels = timelineForRetention.map(formatMonthLabel);
  const retentionMatrix = retentionBuckets.map(bucket => ({
    label: bucket.label,
    color: bucket.color,
    fill: bucket.fill,
    values: new Array(timelineForRetention.length).fill(0)
  }));

  const firstOrderMap = agencyState.firstOrderByClient;
  const ordersTimeline = agencyState.global.timelineByClient || new Map();

  const uniqueClients = Array.from(firstOrderMap.keys());
  uniqueClients.forEach(client => {
    const firstDate = firstOrderMap.get(client);
    if (!firstDate) return;
    if (end && firstDate.getTime() > endBoundary) return;
    const clientOrders = ordersTimeline.get(client) || [];
    if (!clientOrders.length) return;
    timelineForRetention.forEach((monthStart, idx) => {
      const monthEnd = endOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));
      retentionBuckets.forEach((bucket, bucketIdx) => {
        const threshold = new Date(firstDate);
        threshold.setMonth(threshold.getMonth() + bucket.months);
        if (threshold.getTime() > monthEnd.getTime()) return;
        const hasAnotherOrder = clientOrders.some(orderDate => {
          return orderDate.getTime() >= threshold.getTime() && orderDate.getTime() <= monthEnd.getTime();
        });
        if (hasAnotherOrder) {
          retentionMatrix[bucketIdx].values[idx] += 1;
        }
      });
    });
  });

  retentionMatrix.forEach(bucket => {
    bucket.values = bucket.values.map((count, idx) => {
      const totalAtMonth = clientTotals[idx] || 0;
      return totalAtMonth ? (count / totalAtMonth) * 100 : 0;
    });
  });

  renderRevenueChart(timelineLabels, revenuePerMonth, movingAverage);
  renderClientsChart(timelineLabels, clientTotals);
  renderRatioChart(newClientsCount, totalExisting);
  renderRetentionChart(retentionLabels, retentionMatrix);
}

async function initializeAgencyDashboard(force = false) {
  if (!isAdminRoute) return;
  if (agencyLoading) return;
  if (agencyInitialized && !force) {
    updateAdminDashboard();
    return;
  }
  if (!DEFAULT_API_KEY || !DEFAULT_BASE_ID || !DEFAULT_TABLE_ID) {
    if (adminTopSubtitle) {
      adminTopSubtitle.textContent = "Renseigne ton API Airtable pour activer les indicateurs.";
    }
    return;
  }

  try {
    agencyLoading = true;
    if (adminTopSubtitle) {
      adminTopSubtitle.textContent = "Chargement des indicateurs…";
    }
    const rows = await fetchAirtableRows({
      apiKey: DEFAULT_API_KEY,
      baseId: DEFAULT_BASE_ID,
      tableId: DEFAULT_TABLE_ID,
      view: DEFAULT_VIEW_ID || undefined
    });
    prepareAgencyDataset(rows);
    agencyInitialized = true;
    markLastSync();
    updateAdminDashboard();
  } catch (error) {
    console.error("Impossible de charger les indicateurs agence", error);
    if (adminTopSubtitle) {
      adminTopSubtitle.textContent = (error && error.message) ? error.message : "Erreur lors du chargement des indicateurs.";
    }
    displayDashboardEmptyState(true);
  } finally {
    agencyLoading = false;
  }
}

function setClientContext(label = "") {
  if (label !== undefined) {
    currentClientLabel = label;
  }
  const effectiveConfig = currentClientConfig || {};
  const displayName = currentClientLabel || effectiveConfig.label || "";
  if (heroDateEl) {
    heroDateEl.textContent = formatFriendlyDate(new Date());
  }
  if (clientBadge) {
    if (displayName) {
      clientBadge.textContent = displayName;
      clientBadge.classList.remove("hidden");
    } else {
      clientBadge.textContent = "";
      clientBadge.classList.add("hidden");
    }
  }
  if (adminActiveClientEl) {
    adminActiveClientEl.textContent = displayName || "—";
  }
  if (clientTitle) clientTitle.textContent = displayName ? `Espace de ${displayName}` : "Suivi de vos miniatures";
  if (clientGreeting) {
    const container = clientGreeting;
    container.innerHTML = "";
    let lines = [];
    if (effectiveConfig.greeting) {
      if (Array.isArray(effectiveConfig.greeting)) {
        lines = effectiveConfig.greeting.slice();
      } else if (typeof effectiveConfig.greeting === "string") {
        lines = effectiveConfig.greeting.split(/\n+/);
      }
    }
    const cleanedLines = [];
    lines.forEach(line => {
      if (typeof line !== "string") return;
      const trimmed = line.trim();
      if (trimmed) cleanedLines.push(trimmed);
    });
    let finalLines = cleanedLines;
    if (!finalLines.length) {
      const firstLine = displayName
        ? `Hey ${displayName} 👋 ravi de te revoir !`
        : "Bienvenue dans ton espace Miniads 👋";
      finalLines = [
        firstLine,
        "Voici ton espace client, tu y retrouveras tout ton historique de commandes de miniatures."
      ];
    }
    const placeholderName = displayName || "toi";
    finalLines.forEach((line, idx) => {
      const span = document.createElement("span");
      const lineText = typeof line === "string"
        ? line.replace(/\{\{\s*name\s*\}\}|\{name\}|%name%/gi, placeholderName)
        : "";
      span.textContent = lineText;
      container.appendChild(span);
      if (idx < finalLines.length - 1) {
        container.appendChild(document.createElement("br"));
      }
    });
  }
  if (clientInitialsEl) {
    let initials = "M";
    if (displayName) {
      const parts = displayName.split(/\s+/).filter(Boolean);
      if (parts.length) {
        initials = parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join("") || parts[0].charAt(0).toUpperCase();
      }
    }
    clientInitialsEl.textContent = initials || "M";
  }
}

function renderClientList(filter = "") {
  if (!clientList) return;
  const term = filter.trim().toLowerCase();
  const entries = discoveredClients
    .filter(entry => !term || entry.label.toLowerCase().includes(term) || entry.slug.includes(term))
    .sort((a, b) => a.label.localeCompare(b.label));

  clientList.innerHTML = "";
  if (!entries.length) {
    clientList.innerHTML = `<p class="empty admin-empty">Aucun client trouvé.</p>`;
    return;
  }

  entries.forEach(({ slug, label }) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "client-card";
    if (activeAdminClient && activeAdminClient === slug) card.classList.add("active");
    card.innerHTML = `<span class="client-card-name">${label}</span><span class="client-card-slug">${slug}</span>`;
    card.addEventListener("click", () => handleAdminSelect(slug));
    clientList.appendChild(card);
  });
}

function handleAdminSelect(slug) {
  setAdminView("clients");
  const normalizedSlug = toSlug(slug);
  const entry = discoveredClients.find(item => item.slug === normalizedSlug) || null;
  const config = applyClientConfig(normalizedSlug, {
    bypassAccessKey: true,
    labelOverride: entry ? entry.label : undefined,
    accessKeyOverride: entry ? entry.accessKey : undefined
  });
  if (!config) {
    alert("Configuration incomplète pour ce client.");
    return;
  }
  currentClientConfig = config;
  activeAdminClient = normalizedSlug;
  setClientContext(entry ? entry.label : (config.label || slugToName(normalizedSlug)));
  renderClientList(clientSearchInput ? clientSearchInput.value : "");
  loadAirtable(config);
  if (shareBox) {
    const params = new URLSearchParams();
    params.set("client", normalizedSlug);
    const shareKey = config.accessKey || generateAccessKey(normalizedSlug);
    if (shareKey) {
      params.set("key", shareKey);
      if (shareHint) shareHint.textContent = "Partage ce lien, la clé d’accès est déjà incluse.";
    } else if (shareHint) {
      shareHint.textContent = "Aucune clé définie pour ce client (accès libre).";
    }
    const origin = location.origin && location.origin !== "null" ? location.origin : `${location.protocol}//${location.host}`;
    if (shareLinkInput) shareLinkInput.value = `${origin || ""}${location.pathname}?${params.toString()}`;
    shareBox.classList.add("visible");
  }
  const params = new URLSearchParams(location.search);
  params.set("mode", "admin");
  params.set("client", normalizedSlug);
  params.delete("key");
  history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
}

async function buildClientDirectory() {
  const map = new Map();
  Object.entries(CLIENTS).forEach(([slug, cfg]) => {
    const normalized = toSlug(slug);
    const label = cfg.label || slugToName(slug);
    map.set(normalized, {
      slug: normalized,
      label,
      accessKey: cfg.accessKey || generateAccessKey(normalized)
    });
  });

  if (DEFAULT_API_KEY && DEFAULT_BASE_ID && DEFAULT_TABLE_ID && DEFAULT_PSEUDO_FIELD) {
    try {
      const baseUrl = `https://api.airtable.com/v0/${encodeURIComponent(DEFAULT_BASE_ID)}/${encodeURIComponent(DEFAULT_TABLE_ID)}`;
      let offset;
      do {
        const params = new URLSearchParams();
        params.set("pageSize", "100");
        params.append("fields[]", DEFAULT_PSEUDO_FIELD);
        if (DEFAULT_VIEW_ID) params.set("view", DEFAULT_VIEW_ID);
        if (offset) params.set("offset", offset);

        const response = await fetch(`${baseUrl}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${DEFAULT_API_KEY}`,
            "Content-Type": "application/json"
          },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`Airtable ${response.status}`);
        const payload = await response.json();
        (payload.records || []).forEach(record => {
          const field = record.fields ? record.fields[DEFAULT_PSEUDO_FIELD] : null;
          let label = "";
          if (Array.isArray(field)) {
            label = field.find(v => typeof v === "string" && v.trim()) || "";
          } else if (typeof field === "string") {
            label = field;
          }
          label = (label || "").trim();
          if (!label) return;
          const normalized = toSlug(label);
          if (!normalized || map.has(normalized)) return;
          map.set(normalized, {
            slug: normalized,
            label,
            accessKey: generateAccessKey(normalized)
          });
        });
        offset = payload.offset;
      } while (offset);
    } catch (err) {
      console.warn("Impossible de récupérer la liste des clients Airtable :", err);
    }
  }

  discoveredClients = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  updateAdminDirectoryStats();
}

async function enterAdminMode(initialSlug) {
  sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  showAdminUI();
  if (adminLogin) adminLogin.classList.remove("visible");
  if (adminLoginError) adminLoginError.textContent = "";
  if (shareBox) {
    shareBox.classList.remove("visible");
    if (shareLinkInput) shareLinkInput.value = "";
    if (shareHint) shareHint.textContent = "Sélectionne un client pour générer le lien de partage.";
  }
  if (clientSearchInput) clientSearchInput.value = "";
  setAdminView(initialSlug ? "clients" : activeAdminView || "clients");
  await buildClientDirectory();
  const normalizedInitial = initialSlug ? toSlug(initialSlug) : null;
  if (normalizedInitial && !discoveredClients.some(entry => entry.slug === normalizedInitial)) {
    discoveredClients.push({
      slug: normalizedInitial,
      label: slugToName(normalizedInitial),
      accessKey: generateAccessKey(normalizedInitial)
    });
    discoveredClients.sort((a, b) => a.label.localeCompare(b.label));
    updateAdminDirectoryStats();
  }
  renderClientList(clientSearchInput ? clientSearchInput.value : "");
  if (normalizedInitial && discoveredClients.some(entry => entry.slug === normalizedInitial)) {
    setAdminView("clients");
    handleAdminSelect(normalizedInitial);
  } else {
    currentClientConfig = null;
    setClientContext("");
  }
  initializeAgencyDashboard();
}

if (airtableKeyInput && !airtableKeyInput.value && DEFAULT_API_KEY) {
  airtableKeyInput.value = DEFAULT_API_KEY;
}
if (airtableBaseInput && !airtableBaseInput.value && DEFAULT_BASE_ID) {
  airtableBaseInput.value = DEFAULT_BASE_ID;
}
if (airtableTableInput && !airtableTableInput.value && DEFAULT_TABLE_ID) {
  airtableTableInput.value = DEFAULT_TABLE_ID;
}
if (airtableViewInput && !airtableViewInput.value && DEFAULT_VIEW_ID) {
  airtableViewInput.value = DEFAULT_VIEW_ID;
}

// --- Logique principale ---
async function loadAirtable({ apiKey, baseId, tableId, view, filterByFormula } = {}) {
  if (!apiKey || !baseId || !tableId) {
    alert("Renseigne une clé API, un ID de base et une table Airtable.");
    return;
  }

  setLoadingState();

  try {
    const rows = await fetchAirtableRows({ apiKey, baseId, tableId, view, filterByFormula });
    renderRows(rows);
  } catch (e) {
    handleLoadError(e);
  }
}

if (isAdminRoute) {
  setClientContext("");
  const hasSession = sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
  if (hasSession) {
    enterAdminMode(rawClientParam ? rawClientParam.toLowerCase() : null).catch(err => {
      console.error("Erreur lors de l'initialisation admin", err);
    });
  } else {
    showLoginUI();
    if (adminLogin) {
      adminLogin.classList.add("visible");
    }
  }

  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", event => {
      event.preventDefault();
      const email = (adminEmailInput ? adminEmailInput.value : "test@test.fr").trim().toLowerCase();
      const password = adminPasswordInput ? adminPasswordInput.value : "admin";
      const valid = email === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD;
      if (valid) {
        if (adminLoginError) adminLoginError.textContent = "";
        enterAdminMode(rawClientParam ? rawClientParam.toLowerCase() : null).catch(err => {
          console.error("Erreur lors de la connexion admin", err);
        });
      } else if (adminLoginError) {
        adminLoginError.textContent = "Identifiants incorrects.";
      }
    });
  }

  if (adminNavLinks.length) {
    adminNavLinks.forEach(link => {
      link.addEventListener("click", () => {
        const view = link.dataset.adminView || "clients";
        setAdminView(view);
      });
    });
  }

  if (adminFilterButtons.length) {
    adminFilterButtons.forEach(button => {
      button.addEventListener("click", () => {
        const preset = button.dataset.adminRange;
        if (!preset) return;
        if (preset === "custom") {
          agencyState.filter.preset = "custom";
          updateFilterButtonsUI();
          updateAdminDashboard();
        } else {
          setDashboardPreset(preset);
        }
      });
    });
  }

  if (adminApplyCustomBtn) {
    adminApplyCustomBtn.addEventListener("click", () => {
      applyCustomDateRange();
    });
  }

  if (clientSearchInput) {
    clientSearchInput.addEventListener("input", e => renderClientList(e.target.value));
  }

  if (copyShareBtn && shareLinkInput) {
    copyShareBtn.addEventListener("click", async () => {
      if (!shareLinkInput.value) return;
      try {
        await navigator.clipboard.writeText(shareLinkInput.value);
        copyShareBtn.textContent = "Copié !";
        setTimeout(() => { copyShareBtn.textContent = "Copier"; }, 1500);
      } catch (err) {
        console.warn("Impossible de copier dans le presse-papiers", err);
      }
    });
  }

  updateFilterButtonsUI();
} else if (clientParam) {
  const clientConfig = applyClientConfig(clientParam);
  if (clientConfig && clientConfig.apiKey && clientConfig.baseId && clientConfig.tableId) {
    document.body.classList.remove("admin-mode");
    document.body.classList.add("client-mode");
    if (adminLayout) adminLayout.classList.add("admin-hidden");
    if (clientContainer) clientContainer.classList.remove("hidden");
    ensureTableInHost(clientTableHost);
    currentClientConfig = clientConfig;
    setClientContext(clientConfig.label || slugToName(clientParam));
    loadAirtable(clientConfig);
  } else {
    console.warn(`Aucun client configuré ou clé invalide pour le slug « ${clientParam} ».`);
    if (summaryBody) {
      summaryBody.innerHTML = `<tr><td colspan="5" class="empty">Configuration client introuvable.</td></tr>`;
    }
  }
}
