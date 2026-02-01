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

function extractDriveFolderId(value = "") {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/i);
    if (folderMatch) return folderMatch[1];
    const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (idMatch) return idMatch[1];
    return "";
  }
  return /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : "";
}

function buildDriveFolderEntry({ id, url, label, description }) {
  const safeId = id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : "";
  const finalUrl = (url && url.trim()) || (safeId ? `https://drive.google.com/drive/folders/${safeId}` : "");
  if (!finalUrl && !safeId) return null;
  const embedUrl = safeId ? `https://drive.google.com/embeddedfolderview?id=${safeId}#grid` : "";
  return {
    id: safeId,
    url: finalUrl,
    embedUrl,
    label: (label || "").trim() || "Miniatures livrées",
    description: (description || "").trim()
  };
}

function normalizeDriveFolder(input) {
  if (!input) return null;
  if (typeof input === "string") {
    const id = extractDriveFolderId(input);
    const url = /^https?:\/\//i.test(input) ? input : "";
    return buildDriveFolderEntry({ id, url });
  }
  if (typeof input === "object") {
    const candidateId = input.id || input.url || "";
    const id = extractDriveFolderId(candidateId);
    const url = typeof input.url === "string" ? input.url : "";
    return buildDriveFolderEntry({
      id,
      url,
      label: input.label,
      description: input.description
    });
  }
  return null;
}

function normalizeDriveFolders(configEntry) {
  if (!configEntry) return [];
  const seeds = [];
  if (Array.isArray(configEntry.driveFolders)) {
    seeds.push(...configEntry.driveFolders);
  } else if (configEntry.driveFolderId || configEntry.driveFolderUrl) {
    seeds.push({
      id: configEntry.driveFolderId,
      url: configEntry.driveFolderUrl,
      label: configEntry.driveFolderLabel,
      description: configEntry.driveFolderDescription
    });
  }
  return seeds
    .map(normalizeDriveFolder)
    .filter((folder, index, arr) => {
      if (!folder) return false;
      return arr.findIndex(item => item && item.id === folder.id && item.url === folder.url) === index;
    });
}

function stripMiniaturesPrefix(value = "") {
  if (!value) return "";
  return value.replace(/^miniatures?\s*-\s*/i, "").trim();
}

function formatDriveClientLabel(value = "") {
  const trimmed = stripMiniaturesPrefix(value) || value || "";
  const fallback = trimmed.trim();
  return fallback || "Client Miniads";
}

// --- Configuration multi-clients ---
// Clé Airtable côté serveur (laisse vide ici, lue via variable d'environnement).
const DEFAULT_API_KEY = "";
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
  //   greeting: ["Hey Oseille 👋 ravi de te revoir !", "Voici ton espace client..."], // (optionnel)
  //   driveFolders: [
  //     { id: "1AbcXYZ", label: "Miniatures validées", description: "Toutes les miniatures prêtes à publier." },
  //     "https://drive.google.com/drive/folders/EXEMPLE_AUTRE_DOSSIER"
  //   ], // (optionnel) plusieurs dossiers possibles
  //   driveFolderId: "1AbcXYZ", // raccourci si un seul dossier
  //   driveFolderUrl: "https://drive.google.com/drive/folders/1AbcXYZ" // idem mais via URL
  // }
};

const ADMIN_DEFAULTS = {
  email: "",
  password: "",
  sessionKey: "miniads-admin-session"
};

const ADMIN_CONFIG = (() => {
  if (typeof window === "undefined") return ADMIN_DEFAULTS;
  const external = window.MINIADS_ADMIN_AUTH && typeof window.MINIADS_ADMIN_AUTH === "object"
    ? window.MINIADS_ADMIN_AUTH
    : {};
  return {
    email: external.email || ADMIN_DEFAULTS.email,
    password: external.password || ADMIN_DEFAULTS.password,
    sessionKey: external.sessionKey || ADMIN_DEFAULTS.sessionKey
  };
})();

const ADMIN_EMAIL = ADMIN_CONFIG.email;
const ADMIN_PASSWORD = ADMIN_CONFIG.password;
const ADMIN_SESSION_KEY = ADMIN_CONFIG.sessionKey;

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

function seedFromString(str = "") {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function seededUuid(seedString = "") {
  const seedGenerator = seedFromString(seedString);
  let a = seedGenerator();
  let b = seedGenerator();
  let c = seedGenerator();
  let d = seedGenerator();

  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(next() * 256);
  }

  // RFC 4122 variant + version 4 bits to keep a standard UUID layout.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function generateAccessKey(value = "") {
  const slug = toSlug(value);
  const salt = `${DEFAULT_BASE_ID || ""}|${DEFAULT_TABLE_ID || ""}`;
  const seed = `${slug}|${salt}`;
  return seededUuid(seed);
}

function applyClientConfig(slug, options = {}) {
  if (!slug) return null;
  const normalizedSlug = toSlug(slug);
  const configEntry = CLIENTS[normalizedSlug] || CLIENTS[slug];
  const isFallback = !configEntry;

  if (isFallback && (!DEFAULT_BASE_ID || !DEFAULT_TABLE_ID)) {
    return null;
  }

  const apiKey = (configEntry && configEntry.apiKey) || DEFAULT_API_KEY || null;
  const baseId = (configEntry && configEntry.baseId) || DEFAULT_BASE_ID;
  const tableId = (configEntry && configEntry.tableId) || DEFAULT_TABLE_ID;
  const view = configEntry && configEntry.view !== undefined ? configEntry.view : DEFAULT_VIEW_ID;

  if (!baseId || !tableId) return null;

  const computedAccessKey = options.accessKeyOverride !== undefined
    ? options.accessKeyOverride
    : configEntry && configEntry.accessKey
      ? configEntry.accessKey
      : generateAccessKey(normalizedSlug);

  if (!options.bypassAccessKey) {
    const providedKey = getParam("key");
    if (!computedAccessKey || !providedKey || providedKey !== computedAccessKey) return null;
  }

  if (airtableKeyInput && apiKey) airtableKeyInput.value = apiKey;
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
  const driveFolders = normalizeDriveFolders(configEntry);

  return {
    apiKey,
    baseId,
    tableId,
    view,
    filterByFormula: filter,
    label,
    accessKey: computedAccessKey,
    greeting,
    driveFolders
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
  return dt.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" });
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

function openInYoutubeFeed(file = {}, triggerBtn) {
  if (!MINIADS_EXTENSION_ID) {
    alert("Extension Miniads non configurée. Ajoutez MINIADS_EXTENSION_ID dans window pour activer le bouton.");
    return;
  }

  const thumb = getMiniatureThumbnail(file.thumbnailLink);
  const title = truncateText(file.name || "Votre miniature", 90);
  const channel = getFolderLabel(file);
  const params = new URLSearchParams({
    thumb,
    title,
    channel
  });

  const url = `chrome-extension://${MINIADS_EXTENSION_ID}/preview.html?${params.toString()}`;
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = "Ouverture…";
  }
  window.open(url, "_blank", "noopener,noreferrer");
  if (triggerBtn) {
    setTimeout(() => {
      triggerBtn.disabled = false;
      triggerBtn.textContent = "Voir sur le feed YouTube";
    }, 800);
  }
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
const clientNavLinks = Array.from(document.querySelectorAll(".client-nav-link[data-client-view]"));
const clientScrollLinks = Array.from(document.querySelectorAll(".client-nav-link[data-scroll-target]"));
const clientViewSections = Array.from(document.querySelectorAll(".client-view[data-client-view]"));
const miniaturesContent = document.getElementById("miniaturesContent");
const miniaturesEmbed = document.getElementById("miniaturesEmbed");
const miniaturesDriveFrame = document.getElementById("miniaturesDriveFrame");
const MINIADS_API_MODE = true; // ⬅️ active le mode API
const MINIADS_EXTENSION_ID = window.MINIADS_EXTENSION_ID || "";
const MINIADS_EXTENSION_INSTALL_URL = window.MINIADS_EXTENSION_INSTALL_URL
  || (MINIADS_EXTENSION_ID
    ? `https://chrome.google.com/webstore/detail/${MINIADS_EXTENSION_ID}`
    : "https://chrome.google.com/webstore");
const miniaturesGrid = document.getElementById("miniaturesGrid");
const viewSwitchButtons = Array.from(document.querySelectorAll(".switch-btn"));
const pipOverlay = document.getElementById("miniaturePip");
const pipImage = document.getElementById("miniaturePipImage");
const pipTitle = document.getElementById("miniaturePipTitle");
const pipSubtitle = document.getElementById("miniaturePipSubtitle");
const pipOpenLink = document.getElementById("miniaturePipOpen");
const pipDownloadLink = document.getElementById("miniaturePipDownload");
const extensionInstallBtn = document.getElementById("extensionInstallBtn");
const extensionDocBtn = document.getElementById("extensionDocBtn");
const extensionInstallBtnInline = document.getElementById("extensionInstallBtnInline");
const topbar = document.querySelector(".topbar");

async function fetchDriveFilesForClient(slug) {
  const res = await fetch(
    `/api/client/bySlug/${encodeURIComponent(slug)}`
  );

  if (!res.ok) throw new Error("API Drive KO");

  return await res.json();
}

// === NOUVELLE PARTIE ===
let currentFiles = [];

async function displayClientMiniatures(slug) {
  try {
    const data = await fetchDriveFilesForClient(slug);

    currentFiles = data.files || [];

    setMiniaturesView("folders");

  } catch (e) {
    console.error("Erreur affichage miniatures :", e);
    miniaturesGrid.innerHTML = "<p>Erreur lors du chargement des miniatures.</p>";
  }
}

viewSwitchButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    setMiniaturesView(view);
  });
});

function setMiniaturesView(view = "folders") {
  viewSwitchButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (view === "gallery") {
    renderFilesGrid(currentFiles);
  } else {
    renderFolderView(currentFiles);
  }
}

function initializeMiniaturesFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("client");
  if (slug) {
    displayClientMiniatures(slug);
  }
}

initializeMiniaturesFromUrl();

function openMiniaturePip(file = {}) {
  if (!pipOverlay || !pipImage) return;
  const src = getMiniatureThumbnail(file.thumbnailLink);
  pipImage.src = src;
  pipImage.alt = file.name || "Miniature";
  if (pipTitle) pipTitle.textContent = file.name || "Miniature";
  if (pipSubtitle) {
    const dateText = formatDate(file.modifiedTime);
    const folderLabel = getFolderLabel(file);
    pipSubtitle.textContent = dateText !== "—"
      ? `Modifié le ${dateText} • ${folderLabel}`
      : folderLabel;
  }
  if (pipOpenLink) {
    if (file.webViewLink) {
      pipOpenLink.href = file.webViewLink;
      pipOpenLink.removeAttribute("aria-disabled");
    } else {
      pipOpenLink.href = "#";
      pipOpenLink.setAttribute("aria-disabled", "true");
    }
  }
  if (pipDownloadLink) {
    if (file.webContentLink) {
      pipDownloadLink.href = file.webContentLink;
      pipDownloadLink.removeAttribute("aria-disabled");
    } else {
      pipDownloadLink.href = "#";
      pipDownloadLink.setAttribute("aria-disabled", "true");
    }
  }
  pipOverlay.classList.add("is-visible");
  pipOverlay.setAttribute("aria-hidden", "false");
  const closeBtn = pipOverlay.querySelector(".mini-pip-close");
  if (closeBtn) closeBtn.focus();
}

function closeMiniaturePip() {
  if (!pipOverlay) return;
  pipOverlay.classList.remove("is-visible");
  pipOverlay.setAttribute("aria-hidden", "true");
}

if (pipOverlay) {
  const closeButtons = pipOverlay.querySelectorAll("[data-pip-close]");
  closeButtons.forEach(button => {
    button.addEventListener("click", () => closeMiniaturePip());
  });
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeMiniaturePip();
  }
});

function renderFilesGrid(files = [], { container = miniaturesGrid, emptyLabel } = {}) {
  const targetGrid = container || miniaturesGrid;
  if (!targetGrid) return;
  updateMiniaturesGridMode("gallery", targetGrid);
  targetGrid.innerHTML = "";

  if (!files.length) {
    targetGrid.innerHTML = `<div class="miniatures-empty">${emptyLabel || "Aucune miniature pour l’instant."}</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  files.forEach(file => {
    const card = document.createElement("article");
    card.className = "mini-card";

    const thumbWrapper = document.createElement("button");
    thumbWrapper.type = "button";
    thumbWrapper.className = "mini-card-thumb";
    thumbWrapper.addEventListener("click", () => openMiniaturePip(file));

    const img = document.createElement("img");
    img.alt = file.name || "Miniature";
    img.loading = "lazy";
    img.src = getMiniatureThumbnail(file.thumbnailLink);
    thumbWrapper.appendChild(img);

    const versionChip = extractVersion(file.name);
    if (versionChip) {
      const chip = document.createElement("span");
      chip.className = "mini-card-chip";
      chip.textContent = versionChip;
      thumbWrapper.appendChild(chip);
    }

    const body = document.createElement("div");
    body.className = "mini-card-body";

    const textWrapper = document.createElement("div");
    textWrapper.className = "mini-card-text";

    const title = document.createElement("h3");
    title.className = "mini-card-title";
    title.textContent = truncateText(file.name);
    if (file.name) title.title = file.name;

    const meta = document.createElement("p");
    meta.className = "mini-card-meta";
    const dateSpan = document.createElement("span");
    const formattedDate = formatDate(file.modifiedTime);
    dateSpan.textContent = formattedDate !== "—" ? `Modifié le ${formattedDate}` : "Date inconnue";
    const folderSpan = document.createElement("span");
    folderSpan.textContent = getFolderLabel(file);
    meta.append(dateSpan, folderSpan);

    textWrapper.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "mini-card-actions";

    const feedBtn = document.createElement("button");
    feedBtn.type = "button";
    feedBtn.className = "mini-card-btn mini-card-btn-accent";
    feedBtn.textContent = "Voir sur le feed YouTube";
    feedBtn.addEventListener("click", () => openInYoutubeFeed(file, feedBtn));
    actions.appendChild(feedBtn);

    if (file.webViewLink) {
      const previewLink = document.createElement("a");
      previewLink.className = "mini-card-btn mini-card-btn-primary";
      previewLink.href = file.webViewLink;
      previewLink.target = "_blank";
      previewLink.rel = "noopener";
      previewLink.textContent = "Aperçu";
      actions.appendChild(previewLink);
    }

    if (file.webContentLink) {
      const downloadLink = document.createElement("a");
      downloadLink.className = "mini-card-btn";
      downloadLink.href = file.webContentLink;
      downloadLink.target = "_blank";
      downloadLink.rel = "noopener";
      downloadLink.textContent = "Télécharger";
      actions.appendChild(downloadLink);
    }

    body.append(textWrapper, actions);
    card.append(thumbWrapper, body);
    fragment.appendChild(card);
  });

  targetGrid.appendChild(fragment);
}

function extractVersion(name) {
  const match = name.match(/v(\d+)/i);
  return match ? "V" + match[1] : null;
}

function truncateText(value = "", limit = 68) {
  const safeValue = (value || "Sans titre").trim();
  return safeValue.length > limit ? `${safeValue.slice(0, limit - 1)}…` : safeValue;
}

function getMiniatureThumbnail(link = "") {
  if (!link) return new URL("logo.svg", window.location.href).href;
  const normalized = link.replace(/=s\d+(?:-[a-z])?$/i, "=s800");
  if (/^https?:\/\//i.test(normalized)) return normalized;
  try {
    return new URL(normalized, window.location.href).href;
  } catch {
    return normalized;
  }
}

function getFolderLabel(file = {}) {
  const segments = getFolderSegments(file);
  if (!segments.length) {
    const fallback = (file.folderName || file.folder || "").trim();
    return fallback || "Drive Miniads";
  }
  return segments.join(" / ");
}

function getFolderSegments(file = {}) {
  const raw = (file.folderPath || file.folderName || file.folder || "").trim();
  if (!raw) return [];
  return raw
    .split("/")
    .map(part => part.trim())
    .filter(Boolean);
}

function getFolderGroupLabel(file = {}) {
  const segments = getFolderSegments(file);
  if (!segments.length) {
    const fallback = (file.folderName || file.folder || "").trim();
    return fallback || "Drive Miniads";
  }
  return segments[0];
}

function getSubfolderPathLabel(file = {}) {
  const segments = getFolderSegments(file);
  if (segments.length <= 1) return "";
  return segments.slice(1).join(" / ");
}

const ROOT_SUBFOLDER_KEY = "__ROOT__";

function getFolderAccent(label = "") {
  const palettes = [
    { background: "#fff7ed", accent: "#f59e0b" },
    { background: "#fef2f2", accent: "#ef4444" },
    { background: "#f0f9ff", accent: "#0ea5e9" },
    { background: "#ecfdf5", accent: "#10b981" },
    { background: "#fdf2f8", accent: "#d946ef" },
    { background: "#eef2ff", accent: "#6366f1" },
    { background: "#f5f3ff", accent: "#8b5cf6" }
  ];
  const seed = (label || "folder").split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const palette = palettes[seed % palettes.length];
  return palette || palettes[0];
}

function updateMiniaturesGridMode(mode, target = miniaturesGrid) {
  const grid = target || miniaturesGrid;
  if (!grid) return;
  grid.dataset.view = mode;
  grid.classList.toggle("is-gallery", mode === "gallery");
  grid.classList.toggle("is-folders", mode === "folders");
}

function buildSubfolderGroups(files = [], fallbackLabel = "Miniatures principales") {
  const map = new Map();
  files.forEach(file => {
    const subLabel = getSubfolderPathLabel(file);
    const key = subLabel || ROOT_SUBFOLDER_KEY;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(file);
  });
  return Array.from(map.entries()).map(([key, groupFiles]) => {
    const sorted = [...groupFiles].sort(
      (a, b) => new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0)
    );
    const latestTimestamp = sorted.length
      ? new Date(sorted[0].modifiedTime || 0).getTime()
      : 0;
    return {
      key,
      label: key === ROOT_SUBFOLDER_KEY ? fallbackLabel : key,
      displayLabel: key === ROOT_SUBFOLDER_KEY ? "Miniatures principales" : key,
      files: sorted,
      count: sorted.length,
      latestTimestamp
    };
  }).sort((a, b) => {
    if (b.latestTimestamp !== a.latestTimestamp) {
      return b.latestTimestamp - a.latestTimestamp;
    }
    return a.label.localeCompare(b.label, "fr");
  });
}

function createFolderMiniCard(file, parentLabel) {
  const item = document.createElement("div");
  item.className = "folder-mini-card";

  const thumb = document.createElement("div");
  thumb.className = "folder-mini-thumb";
  const img = document.createElement("img");
  img.alt = file.name || "Miniature";
  img.loading = "lazy";
  img.src = getMiniatureThumbnail(file.thumbnailLink);
  thumb.appendChild(img);

  const info = document.createElement("div");
  info.className = "folder-mini-info";
  const title = document.createElement("p");
  title.className = "folder-mini-title";
  title.textContent = truncateText(file.name, 60);
  if (file.name) title.title = file.name;
  const meta = document.createElement("p");
  meta.className = "folder-mini-meta";
  const formatted = formatDate(file.modifiedTime);
  const metaParts = [];
  if (formatted !== "—") metaParts.push(`Modifié le ${formatted}`);
  const folderPathLabel = getFolderLabel(file);
  if (folderPathLabel && folderPathLabel !== parentLabel) {
    metaParts.push(folderPathLabel);
  }
  meta.textContent = metaParts.length ? metaParts.join(" • ") : "Date inconnue";
  info.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "folder-mini-actions";
  if (file.webViewLink) {
    const openLink = document.createElement("a");
    openLink.className = "mini-card-btn mini-card-btn-primary";
    openLink.href = file.webViewLink;
    openLink.target = "_blank";
    openLink.rel = "noopener";
    openLink.textContent = "Ouvrir";
    actions.appendChild(openLink);
  }
  if (file.webContentLink) {
    const downloadLink = document.createElement("a");
    downloadLink.className = "mini-card-btn";
    downloadLink.href = file.webContentLink;
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener";
    downloadLink.textContent = "Télécharger";
    actions.appendChild(downloadLink);
  }

  item.append(thumb, info, actions);
  return item;
}

function closeOtherFolderTiles(currentCard, scope = miniaturesGrid) {
  const grid = scope || miniaturesGrid;
  if (!grid || !currentCard) return;
  const tiles = grid.querySelectorAll(".folder-tile.open");
  tiles.forEach(tile => {
    if (tile === currentCard) return;
    const trigger = tile.querySelector(".folder-tile-body");
    const panelEl = tile.querySelector(".folder-tile-panel");
    if (!trigger || !panelEl) return;
    trigger.setAttribute("aria-expanded", "false");
    tile.classList.remove("open");
    panelEl.hidden = true;
  });
}

function closeSiblingSubfolderCards(container, currentCard) {
  if (!container || !currentCard) return;
  const cards = container.querySelectorAll(".subfolder-card.open");
  cards.forEach(card => {
    if (card === currentCard) return;
    const head = card.querySelector(".subfolder-head");
    const panelEl = card.querySelector(".subfolder-panel");
    if (!head || !panelEl) return;
    head.setAttribute("aria-expanded", "false");
    card.classList.remove("open");
    panelEl.hidden = true;
  });
}

function renderFolderView(files = [], { container = miniaturesGrid, emptyLabel } = {}) {
  const targetGrid = container || miniaturesGrid;
  if (!targetGrid) return;
  updateMiniaturesGridMode("folders", targetGrid);
  targetGrid.innerHTML = "";

  if (!files.length) {
    targetGrid.innerHTML = `<div class="miniatures-empty">${emptyLabel || "Aucun dossier disponible pour l’instant."}</div>`;
    return;
  }

  const groups = files.reduce((acc, file) => {
    const folder = getFolderGroupLabel(file);
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(file);
    return acc;
  }, {});

  const folderList = document.createElement("div");
  folderList.className = "folder-tiles";

  const folders = Object.entries(groups).map(([folderName, folderFiles]) => {
    const sortedFiles = [...folderFiles].sort(
      (a, b) => new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0)
    );
    const latestTimestamp = sortedFiles.length
      ? new Date(sortedFiles[0].modifiedTime || 0).getTime()
      : 0;
    return { folderName, folderFiles, sortedFiles, latestTimestamp };
  });

  folders
    .sort((a, b) => {
      if (b.latestTimestamp !== a.latestTimestamp) return b.latestTimestamp - a.latestTimestamp;
      return a.folderName.localeCompare(b.folderName, "fr");
    })
    .forEach(({ folderName, folderFiles, sortedFiles }) => {
      const card = document.createElement("article");
      card.className = "folder-tile";

      const accents = getFolderAccent(folderName);
      card.style.setProperty("--folder-tile-color", accents.background);
      card.style.setProperty("--folder-tile-accent", accents.accent);

      const latestDate = sortedFiles.length ? formatDate(sortedFiles[0].modifiedTime) : "—";
      const versionCount = folderFiles.length;
      const versionLabel = `${versionCount} miniature${versionCount > 1 ? "s" : ""}`;
      const previewFile = sortedFiles.find(file => file.thumbnailLink);
      const previewMarkup = previewFile
        ? `<img src="${getMiniatureThumbnail(previewFile.thumbnailLink)}" alt="${folderName}" loading="lazy" />`
        : `<span>${(folderName[0] || "D").toUpperCase()}</span>`;
      const subtitle = latestDate !== "—"
        ? `Dernière màj ${latestDate}`
        : "Historique en préparation";

      card.innerHTML = `
        <div class="folder-tile-cover">
          <div class="folder-tile-avatar">${previewMarkup}</div>
        </div>
        <div class="folder-tile-body" role="button" tabindex="0" aria-expanded="false">
          <div class="folder-tile-row">
            <div class="folder-tile-text">
              <h3 class="folder-tile-name">${folderName}</h3>
              <p class="folder-tile-subtitle">${subtitle}</p>
            </div>
            <div class="folder-tile-meta">
              <div class="folder-tile-stat">
                <span class="icon-star" aria-hidden="true"></span>
                <span>${versionLabel}</span>
              </div>
              <span class="folder-tile-caret" aria-hidden="true"></span>
            </div>
          </div>
        </div>
        <div class="folder-tile-panel" hidden></div>
      `;

      const panel = card.querySelector(".folder-tile-panel");
      const subfolders = buildSubfolderGroups(sortedFiles, folderName);
      const onlyRootSubfolder = subfolders.length === 1 && subfolders[0].key === ROOT_SUBFOLDER_KEY;
      if (!subfolders.length || onlyRootSubfolder) {
        const grid = document.createElement("div");
        grid.className = "folder-mini-grid";
        sortedFiles.forEach(file => grid.appendChild(createFolderMiniCard(file, folderName)));
        panel.appendChild(grid);
      } else {
        const list = document.createElement("div");
        list.className = "subfolder-list";
        subfolders.forEach(subfolder => {
          const subCard = document.createElement("article");
          subCard.className = "subfolder-card";

          const head = document.createElement("div");
          head.className = "subfolder-head";
          head.setAttribute("role", "button");
          head.setAttribute("tabindex", "0");
          head.setAttribute("aria-expanded", "false");
          const subSubtitle = subfolder.files.length
            ? `Dernière màj ${formatDate(subfolder.files[0].modifiedTime)}`
            : "En attente de miniatures";
          const countLabel = `${subfolder.count} miniature${subfolder.count > 1 ? "s" : ""}`;
          head.innerHTML = `
            <div class="subfolder-head-text">
              <h4>${subfolder.displayLabel}</h4>
              <p>${subSubtitle}</p>
            </div>
            <div class="subfolder-head-meta">
              <span>${countLabel}</span>
              <span class="subfolder-caret" aria-hidden="true"></span>
            </div>
          `;

          const subPanel = document.createElement("div");
          subPanel.className = "subfolder-panel";
          subPanel.hidden = true;
          const grid = document.createElement("div");
          grid.className = "folder-mini-grid";
          subfolder.files.forEach(file => grid.appendChild(createFolderMiniCard(file, subfolder.label)));
          subPanel.appendChild(grid);

          const toggleSubfolder = () => {
            const expanded = head.getAttribute("aria-expanded") === "true";
            if (!expanded) closeSiblingSubfolderCards(list, subCard);
            head.setAttribute("aria-expanded", String(!expanded));
            subCard.classList.toggle("open", !expanded);
            subPanel.hidden = expanded;
          };
          head.addEventListener("click", toggleSubfolder);
          head.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleSubfolder();
            }
          });

          subCard.append(head, subPanel);
          list.appendChild(subCard);
        });
        panel.appendChild(list);
      }

      const trigger = card.querySelector(".folder-tile-body");
      const setState = expand => {
        if (expand) closeOtherFolderTiles(card, targetGrid);
        trigger.setAttribute("aria-expanded", String(expand));
        card.classList.toggle("open", expand);
        panel.hidden = !expand;
      };
      setState(false);
      const togglePanel = () => {
        const isExpanded = trigger.getAttribute("aria-expanded") === "true";
        setState(!isExpanded);
      };
      trigger.addEventListener("click", togglePanel);
      trigger.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          togglePanel();
        }
      });

      folderList.appendChild(card);
    });

  targetGrid.appendChild(folderList);
}


const adminMiniaturesView = document.getElementById("adminMiniaturesView");
const adminMiniaturesSearchInput = document.getElementById("adminMiniaturesSearch");
const adminMiniaturesClientList = document.getElementById("adminMiniaturesClientList");
const adminMiniaturesCountEl = document.getElementById("adminMiniaturesCount");
const adminMiniaturesGrid = document.getElementById("adminMiniaturesGrid");
const adminMiniaturesStatus = document.getElementById("adminMiniaturesStatus");
const adminMiniaturesTitle = document.getElementById("adminMiniaturesTitle");
const adminMiniaturesSubtitle = document.getElementById("adminMiniaturesSubtitle");
const adminMiniaturesDriveLink = document.getElementById("adminMiniaturesDriveLink");
const adminMiniaturesRefreshBtn = document.getElementById("adminMiniaturesRefresh");

let adminDriveDirectory = [];
let adminDriveDirectoryLoaded = false;
let adminDriveDirectoryLoading = false;
const adminDriveCache = new Map();
let adminDriveActiveSlug = null;

function getAdminMiniaturesFilter() {
  return adminMiniaturesSearchInput ? adminMiniaturesSearchInput.value || "" : "";
}

function buildDriveDirectoryEntry(entry) {
  if (!entry || !entry.name) return null;
  const label = formatDriveClientLabel(entry.name);
  const slug = toSlug(label);
  if (!slug) return null;
  return {
    id: entry.id || "",
    label,
    rawName: entry.name || label,
    slug,
    driveUrl: entry.id ? `https://drive.google.com/drive/folders/${entry.id}` : ""
  };
}

function setAdminMiniaturesStatus(message, { loading = false } = {}) {
  if (!adminMiniaturesStatus) return;
  const text = message || "";
  adminMiniaturesStatus.textContent = text;
  adminMiniaturesStatus.classList.toggle("hidden", !text);
  adminMiniaturesStatus.classList.toggle("loading", Boolean(text && loading));
}

function clearAdminMiniaturesSelection() {
  if (adminMiniaturesTitle) adminMiniaturesTitle.textContent = "Aucun dossier sélectionné";
  if (adminMiniaturesSubtitle) {
    adminMiniaturesSubtitle.textContent = "Sélectionne un client à gauche pour accéder à ses miniatures.";
  }
  if (adminMiniaturesDriveLink) {
    adminMiniaturesDriveLink.setAttribute("aria-disabled", "true");
    adminMiniaturesDriveLink.removeAttribute("href");
  }
  if (adminMiniaturesGrid) {
    adminMiniaturesGrid.classList.add("hidden");
    adminMiniaturesGrid.innerHTML = "";
  }
  setAdminMiniaturesStatus("Sélectionne un dossier client pour afficher les miniatures.");
}

function renderAdminMiniaturesDirectory(filter = "") {
  if (!adminMiniaturesClientList) return;
  const term = filter.trim().toLowerCase();
  const entries = adminDriveDirectory
    .filter(entry => !term || entry.label.toLowerCase().includes(term) || entry.slug.includes(term))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  adminMiniaturesClientList.innerHTML = "";
  if (adminMiniaturesCountEl) {
    adminMiniaturesCountEl.textContent = entries.length
      ? `${entries.length} dossier${entries.length > 1 ? "s" : ""}`
      : "0 dossier";
  }

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "admin-miniatures-empty";
    empty.textContent = adminDriveDirectoryLoaded
      ? "Aucun dossier ne correspond à ta recherche."
      : "Aucun dossier Drive détecté.";
    adminMiniaturesClientList.appendChild(empty);
    return;
  }

  entries.forEach(entry => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-miniatures-client";
    if (entry.slug === adminDriveActiveSlug) button.classList.add("active");
    button.innerHTML = `<strong>${entry.label}</strong><span>${entry.slug}</span>`;
    button.addEventListener("click", () => selectAdminDriveClient(entry.slug));
    adminMiniaturesClientList.appendChild(button);
  });
}

async function loadAdminDriveDirectory(force = false) {
  if (!adminMiniaturesView) return;
  if (adminDriveDirectoryLoading) return;
  if (adminDriveDirectoryLoaded && !force) return;

  adminDriveDirectoryLoading = true;
  setAdminMiniaturesStatus("Chargement des dossiers Drive…", { loading: true });

  try {
    const response = await fetch("/api/client/list-root");
    if (!response.ok) throw new Error("Impossible de récupérer les dossiers Drive.");
    const payload = await response.json();
    adminDriveDirectory = Array.isArray(payload)
      ? payload
        .map(buildDriveDirectoryEntry)
        .filter(Boolean)
        .sort((a, b) => a.label.localeCompare(b.label, "fr"))
      : [];
    adminDriveDirectoryLoaded = true;
    renderAdminMiniaturesDirectory(getAdminMiniaturesFilter());
    if (!adminDriveDirectory.length) {
      setAdminMiniaturesStatus("Aucun dossier Drive détecté.");
    } else if (!adminDriveActiveSlug) {
      setAdminMiniaturesStatus("Sélectionne un dossier client pour afficher les miniatures.");
    }
  } catch (error) {
    console.error("Erreur lors du chargement des dossiers Drive", error);
    setAdminMiniaturesStatus(
      (error && error.message) || "Impossible de charger les dossiers Drive."
    );
  } finally {
    adminDriveDirectoryLoading = false;
  }
}

async function selectAdminDriveClient(slug, { force = false } = {}) {
  if (!slug) return;
  const entry = adminDriveDirectory.find(item => item.slug === slug);
  if (!entry) {
    setAdminMiniaturesStatus("Dossier client introuvable.");
    return;
  }
  adminDriveActiveSlug = slug;
  renderAdminMiniaturesDirectory(getAdminMiniaturesFilter());
  if (adminMiniaturesTitle) adminMiniaturesTitle.textContent = entry.label;
  if (adminMiniaturesDriveLink) {
    if (entry.driveUrl) {
      adminMiniaturesDriveLink.href = entry.driveUrl;
      adminMiniaturesDriveLink.removeAttribute("aria-disabled");
    } else {
      adminMiniaturesDriveLink.setAttribute("aria-disabled", "true");
      adminMiniaturesDriveLink.removeAttribute("href");
    }
  }

  const cached = adminDriveCache.get(slug);
  if (cached && !force) {
    renderAdminDriveFiles(entry, cached);
    return;
  }

  setAdminMiniaturesStatus("Chargement des miniatures…", { loading: true });
  try {
    const payload = await fetchDriveFilesForClient(slug);
    adminDriveCache.set(slug, payload);
    renderAdminDriveFiles(entry, payload);
  } catch (error) {
    console.error(`Impossible de charger les miniatures Drive pour ${slug}`, error);
    setAdminMiniaturesStatus("Impossible de charger les miniatures de ce client.");
    if (adminMiniaturesGrid) {
      adminMiniaturesGrid.innerHTML = "";
      adminMiniaturesGrid.classList.add("hidden");
    }
  }
}

function renderAdminDriveFiles(entry, payload) {
  if (!adminMiniaturesGrid) return;
  const files = Array.isArray(payload && payload.files) ? payload.files : [];
  const folderName = (payload && payload.folderName) || entry.rawName || entry.label;
  if (adminMiniaturesSubtitle) {
    adminMiniaturesSubtitle.textContent = folderName || entry.label;
  }
  if (!files.length) {
    adminMiniaturesGrid.innerHTML = "";
    adminMiniaturesGrid.classList.remove("hidden");
    renderFolderView([], {
      container: adminMiniaturesGrid,
      emptyLabel: "Ce dossier Drive ne contient aucune miniature."
    });
    setAdminMiniaturesStatus("Aucune miniature détectée pour ce dossier.");
    return;
  }
  renderFolderView(files, {
    container: adminMiniaturesGrid,
    emptyLabel: "Ce dossier Drive ne contient aucune miniature."
  });
  adminMiniaturesGrid.classList.remove("hidden");
  const countLabel = `${files.length} miniature${files.length > 1 ? "s" : ""} synchronisée${files.length > 1 ? "s" : ""}.`;
  setAdminMiniaturesStatus(countLabel);
}

function ensureAdminMiniaturesDirectory(force = false) {
  if (!adminMiniaturesView) return Promise.resolve();
  return loadAdminDriveDirectory(force);
}

function refreshAdminMiniaturesDirectory() {
  adminDriveCache.clear();
  const loadPromise = ensureAdminMiniaturesDirectory(true);
  if (!loadPromise || typeof loadPromise.then !== "function") {
    clearAdminMiniaturesSelection();
    return;
  }
  loadPromise
    .then(() => {
      if (adminDriveActiveSlug) {
        return selectAdminDriveClient(adminDriveActiveSlug, { force: true });
      }
      clearAdminMiniaturesSelection();
      return null;
    })
    .catch(error => {
      console.error("Impossible d’actualiser les dossiers Drive", error);
    });
}

const miniaturesExternalLink = document.getElementById("miniaturesExternalLink");
const miniaturesFolderList = document.getElementById("miniaturesFolderList");
const miniaturesEmptyState = document.getElementById("miniaturesEmptyState");
const miniaturesEmbedHint = document.getElementById("miniaturesEmbedHint");
const miniaturesEmbedTitle = document.getElementById("miniaturesEmbedTitle");
const miniaturesEmbedSubtitle = document.getElementById("miniaturesEmbedSubtitle");
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
const shareTitle = document.getElementById("shareTitle");
const shareSubtitle = document.getElementById("shareSubtitle");
const copyShareBtn = document.getElementById("copyShareLink");
const loginWrapper = document.getElementById("loginWrapper");
const clientContainer = document.getElementById("clientContainer");
const adminLayout = document.getElementById("adminLayout");
const clientTableHost = document.getElementById("clientTableHost");
const adminTableHost = document.getElementById("adminTableHost");
const adminTablePlaceholder = document.getElementById("adminTablePlaceholder");
const tableSection = document.getElementById("tableSection");
const adminTopTitle = document.getElementById("adminTopTitle");
const adminTopSubtitle = document.getElementById("adminTopSubtitle");
const adminNavLinks = Array.from(document.querySelectorAll(".sidebar-link[data-admin-view]"));
const adminViews = {
  dashboard: document.getElementById("adminDashboardView"),
  insights: document.getElementById("adminInsightsView"),
  clients: adminPanel,
  miniatures: document.getElementById("adminMiniaturesView"),
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
const adminKpiMonthlyThumbsLabelEl = document.getElementById("adminKpiMonthlyThumbsLabel");
const adminKpiMonthlyThumbsEl = document.getElementById("adminKpiMonthlyThumbs");
const adminKpiClientsEl = document.getElementById("adminKpiClients");
const adminKpiAverageBasketEl = document.getElementById("adminKpiAverageBasket");
const adminKpiNewClientRateEl = document.getElementById("adminKpiNewClientRate");
const adminKpiActiveRateEl = document.getElementById("adminKpiActiveRate");
const adminKpiActiveTooltip = document.getElementById("adminKpiActiveTooltip");
const adminKpiOrdersPerClientEl = document.getElementById("adminKpiOrdersPerClient");
const adminKpiCltvEl = document.getElementById("adminKpiCltv");
const adminKpiRevenueDeltaEl = document.getElementById("adminKpiRevenueDelta");
const adminKpiMonthlyThumbsDeltaEl = document.getElementById("adminKpiMonthlyThumbsDelta");
const adminKpiClientsDeltaEl = document.getElementById("adminKpiClientsDelta");
const adminKpiAverageBasketDeltaEl = document.getElementById("adminKpiAverageBasketDelta");
const adminKpiNewClientRateDeltaEl = document.getElementById("adminKpiNewClientRateDelta");
const adminKpiActiveRateDeltaEl = document.getElementById("adminKpiActiveRateDelta");
const adminKpiOrdersPerClientDeltaEl = document.getElementById("adminKpiOrdersPerClientDelta");
const adminKpiCltvDeltaEl = document.getElementById("adminKpiCltvDelta");
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
const insightsReturningValue = document.getElementById("insightsReturningValue");
const insightsReturningDelta = document.getElementById("insightsReturningDelta");
const insightsAverageBasketValue = document.getElementById("insightsAverageBasketValue");
const insightsAverageBasketDelta = document.getElementById("insightsAverageBasketDelta");
const insightsActiveRateValue = document.getElementById("insightsActiveRateValue");
const insightsActiveRateDelta = document.getElementById("insightsActiveRateDelta");
const insightsNewClientsValue = document.getElementById("insightsNewClientsValue");
const insightsNewClientsMeta = document.getElementById("insightsNewClientsMeta");
const insightsNewClientsDelta = document.getElementById("insightsNewClientsDelta");
const kpiTrendElements = [
  adminKpiRevenueDeltaEl,
  adminKpiMonthlyThumbsDeltaEl,
  adminKpiClientsDeltaEl,
  adminKpiAverageBasketDeltaEl,
  adminKpiNewClientRateDeltaEl,
  adminKpiActiveRateDeltaEl,
  adminKpiOrdersPerClientDeltaEl,
  adminKpiCltvDeltaEl
];
let currentClientLabel = "";
let activeClientView = "dashboard";
let activeDriveFolderIndex = 0;
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
    totalQuantity: 0,
    revenueByClient: new Map(),
    ordersByClient: new Map(),
    quantityByClient: new Map(),
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
configureExtensionCta();

function setClientView(view) {
  if (!clientViewSections.length) return;
  const target = view || "dashboard";
  let matchFound = false;
  clientViewSections.forEach(section => {
    if (!section) return;
    const matches = section.dataset.clientView === target;
    section.classList.toggle("active", matches);
    if (matches) matchFound = true;
  });
  if (!matchFound) return;
  clientNavLinks.forEach(link => {
    if (!link) return;
    const viewName = link.dataset.clientView;
    link.classList.toggle("active", viewName === target);
  });
  activeClientView = target;
  if (topbar) {
    topbar.style.display = target === "extension-miniads" ? "none" : "";
  }
  document.body.classList.toggle("extension-active", target === "extension-miniads");
}

function resetClientView() {
  setClientView("dashboard");
}

function configureClientNavigation() {
  if (clientNavLinks.length) {
    clientNavLinks.forEach(link => {
      link.addEventListener("click", () => {
        const targetView = link.dataset.clientView;
        if (!targetView) return;
        setClientView(targetView);
      });
    });
  }
  if (clientScrollLinks.length) {
    clientScrollLinks.forEach(link => {
      link.addEventListener("click", () => {
        const selector = link.dataset.scrollTarget;
        if (!selector) return;
        const target = document.querySelector(selector);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }
  setClientView(activeClientView);
}

function configureExtensionCta() {
  if (extensionInstallBtn) {
    extensionInstallBtn.addEventListener("click", () => {
      window.open(MINIADS_EXTENSION_INSTALL_URL, "_blank", "noopener,noreferrer");
    });
  }
  if (extensionInstallBtnInline) {
    extensionInstallBtnInline.addEventListener("click", () => {
      window.open(MINIADS_EXTENSION_INSTALL_URL, "_blank", "noopener,noreferrer");
    });
  }
  if (extensionDocBtn && extensionDocBtn.href === "#") {
    extensionDocBtn.href = MINIADS_EXTENSION_INSTALL_URL;
  }
}

function updateMiniaturesLibrary(config) {
  // --- MODE API ---
  // if (MINIADS_API_MODE) {
  //   if (!miniaturesContent || !miniaturesGrid) return;
  //   const url = new URL(window.location.href);
  //   const clientSlug = url.searchParams.get("client") || "";
  //   miniaturesContent.classList.remove("hidden");
  //   miniaturesEmptyState.classList.add("hidden");

  //   if (miniaturesEmbed) miniaturesEmbed.classList.add("miniatures-embed-unavailable");
  //   if (miniaturesDriveFrame) miniaturesDriveFrame.setAttribute("hidden","hidden");
  //   if (miniaturesEmbedHint) miniaturesEmbedHint.classList.add("hidden");
  //   if (miniaturesExternalLink) miniaturesExternalLink.setAttribute("aria-disabled","true");

  //   renderFilesGrid([]);
  //   fetchDriveFilesForClient(clientSlug)
  //     .then(files => renderFilesGrid(files))
  //     .catch(() => {
  //       miniaturesGrid.innerHTML = `<div class="miniatures-empty">Impossible de charger vos miniatures pour le moment.</div>`;
  //     });

  //   return;
  // }
  if (!miniaturesEmptyState || !miniaturesContent) return;
  const folders = config && Array.isArray(config.driveFolders) ? config.driveFolders : [];
  activeDriveFolderIndex = 0;
  if (!folders.length) {
    miniaturesContent.classList.add("hidden");
    miniaturesEmptyState.classList.remove("hidden");
    if (miniaturesFolderList) miniaturesFolderList.innerHTML = "";
    if (miniaturesDriveFrame) {
      miniaturesDriveFrame.src = "about:blank";
      miniaturesDriveFrame.setAttribute("hidden", "hidden");
    }
    if (miniaturesEmbedHint) miniaturesEmbedHint.classList.add("hidden");
    if (miniaturesExternalLink) {
      miniaturesExternalLink.setAttribute("aria-disabled", "true");
      miniaturesExternalLink.removeAttribute("href");
    }
    return;
  }
  miniaturesContent.classList.remove("hidden");
  miniaturesEmptyState.classList.add("hidden");
  renderMiniaturesFolders(folders);
  applyDriveFolderSelection(folders[0], 0);
}

function renderMiniaturesFolders(folders) {
  if (!miniaturesFolderList) return;
  miniaturesFolderList.innerHTML = "";
  folders.forEach((folder, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "miniatures-folder-card";
    if (index === activeDriveFolderIndex) button.classList.add("active");
    const name = document.createElement("span");
    name.className = "miniatures-folder-name";
    name.textContent = folder.label || `Dossier ${index + 1}`;
    button.appendChild(name);
    if (folder.description) {
      const descriptionEl = document.createElement("span");
      descriptionEl.className = "miniatures-folder-description";
      descriptionEl.textContent = folder.description;
      button.appendChild(descriptionEl);
    }
    button.addEventListener("click", () => {
      activeDriveFolderIndex = index;
      applyDriveFolderSelection(folder, index);
    });
    miniaturesFolderList.appendChild(button);
  });
}

function applyDriveFolderSelection(folder, index) {
  if (!folder) return;
  const canEmbed = Boolean(folder.embedUrl && miniaturesDriveFrame);
  if (miniaturesEmbed) {
    miniaturesEmbed.classList.toggle("miniatures-embed-unavailable", !canEmbed);
  }
  if (miniaturesDriveFrame) {
    if (canEmbed) {
      miniaturesDriveFrame.removeAttribute("hidden");
      if (miniaturesDriveFrame.src !== folder.embedUrl) {
        miniaturesDriveFrame.src = folder.embedUrl;
      }
    } else {
      miniaturesDriveFrame.src = "about:blank";
      miniaturesDriveFrame.setAttribute("hidden", "hidden");
    }
  }
  if (miniaturesEmbedHint) {
    miniaturesEmbedHint.classList.toggle("hidden", canEmbed);
  }
  if (miniaturesExternalLink) {
    if (folder.url) {
      miniaturesExternalLink.href = folder.url;
      miniaturesExternalLink.setAttribute("aria-disabled", "false");
    } else {
      miniaturesExternalLink.removeAttribute("href");
      miniaturesExternalLink.setAttribute("aria-disabled", "true");
    }
  }
  if (miniaturesEmbedTitle) {
    miniaturesEmbedTitle.textContent = folder.label || "Dossier Google Drive";
  }
  if (miniaturesEmbedSubtitle) {
    miniaturesEmbedSubtitle.textContent = folder.description || "Centralisation de toutes tes miniatures livrées.";
  }
  if (miniaturesFolderList) {
    Array.from(miniaturesFolderList.children).forEach((card, idx) => {
      card.classList.toggle("active", idx === index);
    });
  }
}

configureClientNavigation();
updateMiniaturesLibrary(currentClientConfig);

if (adminMiniaturesSearchInput) {
  adminMiniaturesSearchInput.addEventListener("input", event => {
    renderAdminMiniaturesDirectory(event.target.value);
  });
}

if (adminMiniaturesRefreshBtn) {
  adminMiniaturesRefreshBtn.addEventListener("click", () => {
    refreshAdminMiniaturesDirectory();
  });
}

const ADMIN_VIEW_COPY = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Suivi en temps réel de l’activité Miniads."
  },
  insights: {
    title: "Insights & Performances",
    subtitle: "Analyse des tendances clés sur la période sélectionnée."
  },
  clients: {
    title: "Mes clients",
    subtitle: "Sélectionne un créateur pour charger ses miniatures et copier son lien sécurisé."
  },
  miniatures: {
    title: "Miniatures réalisées",
    subtitle: "Explore toutes les miniatures livrées par dossier client."
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
  if (view === "dashboard" || view === "insights") {
    initializeAgencyDashboard();
  }
  if (view === "clients") {
    ensureTableInHost(adminTableHost);
  }
  if (view === "miniatures") {
    ensureAdminMiniaturesDirectory();
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
  resetClientView();
  updateMiniaturesLibrary(null);
  if (shareBox) {
    shareBox.classList.remove("visible");
    if (shareLinkInput) shareLinkInput.value = "";
    if (shareHint) shareHint.textContent = "";
    if (shareTitle) shareTitle.textContent = "Sélectionne un client";
    if (shareSubtitle) shareSubtitle.textContent = "Choisis un client dans la liste pour générer le lien sécurisé.";
  }
  if (adminTablePlaceholder) adminTablePlaceholder.classList.remove("hidden");
  if (adminTableHost) adminTableHost.classList.add("hidden");
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

const TREND_VISUALS = {
  positive: { text: "#1f9d5c", bar: "rgba(31,157,92,0.7)", line: "#1f9d5c", fill: "rgba(31,157,92,0.18)" },
  neutral: { text: "#d97706", bar: "rgba(245,154,45,0.75)", line: "#d97706", fill: "rgba(245,154,45,0.2)" },
  negative: { text: "#d04050", bar: "rgba(208,64,80,0.72)", line: "#d04050", fill: "rgba(208,64,80,0.18)" },
  na: { text: "#6e7695", bar: "rgba(57,66,98,0.28)", line: "#394262", fill: "rgba(57,66,98,0.12)" }
};

function computeDeltaPercent(currentValue, previousValue) {
  if (previousValue === null || previousValue === undefined) return null;
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current)) {
    if (current === 0) {
      return previous === 0 ? 0 : null;
    }
    return null;
  }
  if (!Number.isFinite(previous)) {
    if (previous === 0) {
      return current === 0 ? 0 : (current > 0 ? Infinity : -Infinity);
    }
    return null;
  }
  if (previous === 0) {
    if (current === 0) return 0;
    return current > 0 ? Infinity : current < 0 ? -Infinity : null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function resolveTrend(delta) {
  if (delta === null || delta === undefined) return null;
  if (!Number.isFinite(delta)) {
    if (delta === Infinity) return "positive";
    if (delta === -Infinity) return "negative";
    return "neutral";
  }
  if (delta >= 3) return "positive";
  if (delta <= -3) return "negative";
  return "neutral";
}

function formatDeltaPercent(delta) {
  if (delta === null || delta === undefined) return "—";
  if (!Number.isFinite(delta)) {
    if (delta === Infinity) return "+∞%";
    if (delta === -Infinity) return "-∞%";
    return "0%";
  }
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%`;
}

function resetTrendIndicator(element, message = "—") {
  if (!element) return;
  element.classList.remove("trend-positive", "trend-neutral", "trend-negative", "trend-na");
  element.classList.add("trend-na");
  element.innerHTML = `<span class="trend-arrow">—</span><span class="trend-text">${message}</span>`;
}

function applyTrendClass(element, trend) {
  if (!element) return;
  element.classList.remove("trend-positive", "trend-neutral", "trend-negative", "trend-na");
  if (!trend) {
    element.classList.add("trend-na");
    return;
  }
  element.classList.add(`trend-${trend}`);
}

function applyTrendIndicator(element, currentValue, previousValue, { suffix = "vs période précédente", previousFormatter } = {}) {
  if (!element) return { trend: null, delta: null };
  element.classList.remove("trend-positive", "trend-neutral", "trend-negative", "trend-na");
  const hasPrevious = previousValue !== null && previousValue !== undefined;
  if (!hasPrevious) {
    resetTrendIndicator(element, "Pas de comparaison");
    return { trend: null, delta: null };
  }
  const delta = computeDeltaPercent(currentValue, previousValue);
  if (delta === null) {
    resetTrendIndicator(element, "Pas de comparaison");
    return { trend: null, delta: null };
  }
  const trend = resolveTrend(delta);
  const arrow = trend === "positive" ? "▲" : trend === "negative" ? "▼" : "►";
  const formattedDelta = formatDeltaPercent(delta);
  let text = `${formattedDelta} ${suffix}`.trim();
  if (typeof previousFormatter === "function") {
    const formattedPrevious = previousFormatter(previousValue);
    if (formattedPrevious) {
      text += ` (vs ${formattedPrevious})`;
    }
  }
  element.innerHTML = `<span class="trend-arrow">${arrow}</span><span class="trend-text">${text}</span>`;
  if (trend) {
    element.classList.add(`trend-${trend}`);
  } else {
    element.classList.add("trend-na");
  }
  return { trend, delta };
}

function getTrendVisual(trend) {
  return TREND_VISUALS[trend] || TREND_VISUALS.na;
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

function computePreviousPeriodRange(currentStart, currentEnd) {
  if (!currentStart || !currentEnd) return null;
  const startTime = currentStart.getTime();
  const endTime = currentEnd.getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  const duration = Math.max(0, endTime - startTime);
  const previousEnd = endOfDay(new Date(startTime - 1));
  const previousStart = startOfDay(new Date(previousEnd.getTime() - duration));
  return { start: previousStart, end: previousEnd };
}

function computeRangeMetrics(rangeStart, rangeEnd) {
  const startTime = rangeStart ? rangeStart.getTime() : Number.NEGATIVE_INFINITY;
  const endTime = rangeEnd ? rangeEnd.getTime() : Number.POSITIVE_INFINITY;
  const filtered = Array.isArray(agencyState.normalized)
    ? agencyState.normalized.filter(entry => entry.time >= startTime && entry.time <= endTime)
    : [];

  let totalRevenue = 0;
  let totalQuantity = 0;
  let totalOrders = 0;
  let returningRevenue = 0;
  const activeClients = new Set();
  const returningClients = new Set();
  const startBoundary = Number.isFinite(startTime) ? startTime : Number.NEGATIVE_INFINITY;
  const endBoundary = Number.isFinite(endTime) ? endTime : Number.POSITIVE_INFINITY;

  filtered.forEach(entry => {
    const revenue = Number.isFinite(entry.revenue) ? entry.revenue : 0;
    const quantity = Number.isFinite(entry.quantity) ? entry.quantity : 0;
    totalRevenue += revenue;
    totalQuantity += quantity;
    totalOrders += 1;
    if (entry.client) {
      activeClients.add(entry.client);
      const firstDate = agencyState.firstOrderByClient.get(entry.client);
      if (firstDate && firstDate.getTime() < startBoundary) {
        returningRevenue += revenue;
        returningClients.add(entry.client);
      }
    }
  });

  let newClientsCount = 0;
  activeClients.forEach(client => {
    const firstDate = agencyState.firstOrderByClient.get(client);
    if (!firstDate) return;
    const firstTime = firstDate.getTime();
    if (firstTime >= startBoundary && firstTime <= endBoundary) {
      newClientsCount += 1;
    }
  });

  const activeClientsCount = activeClients.size;
  const totalKnownClients = agencyState.firstOrderByClient ? agencyState.firstOrderByClient.size : activeClientsCount;
  const averageBasket = totalOrders ? totalRevenue / totalOrders : 0;
  const newClientsRate = activeClientsCount ? (newClientsCount / activeClientsCount) * 100 : 0;
  const activeRate = totalKnownClients ? (activeClientsCount / totalKnownClients) * 100 : 0;
  const returningRevenueShare = totalRevenue > 0 ? (returningRevenue / totalRevenue) * 100 : 0;
  const ordersPerClientRange = activeClientsCount ? totalOrders / activeClientsCount : 0;
  const cltvRange = activeClientsCount ? totalRevenue / activeClientsCount : 0;

  return {
    start: rangeStart,
    end: rangeEnd,
    filtered,
    revenue: totalRevenue,
    quantity: totalQuantity,
    orders: totalOrders,
    activeClientsCount,
    totalKnownClients,
    newClientsCount,
    newClientsRate,
    averageBasket,
    activeRate,
    returningRevenueShare,
    returningRevenue,
    returningClients: returningClients.size,
    ordersPerClientRange,
    cltvRange
  };
}

function computeLifetimeMetricsUpTo(endDate) {
  const limit = endDate instanceof Date ? endDate.getTime() : Number.POSITIVE_INFINITY;
  let revenueSum = 0;
  let ordersSum = 0;
  const clientSet = new Set();

  if (Array.isArray(agencyState.normalized)) {
    agencyState.normalized.forEach(entry => {
      if (entry.time <= limit) {
        revenueSum += Number.isFinite(entry.revenue) ? entry.revenue : 0;
        ordersSum += 1;
        if (entry.client) clientSet.add(entry.client);
      }
    });
  }

  const clientCount = clientSet.size;
  return {
    ordersPerClient: clientCount ? ordersSum / clientCount : 0,
    cltv: clientCount ? revenueSum / clientCount : 0,
    clientCount
  };
}

function updateChartTrendStyles({ revenueTrend, clientsTrend, ratioTrend, retentionTrend }) {
  applyTrendClass(adminRevenueChartStatus, revenueTrend);
  applyTrendClass(adminClientsChartStatus, clientsTrend);
  applyTrendClass(adminRatioChartStatus, ratioTrend);
  applyTrendClass(adminRetentionChartStatus, retentionTrend);

  const revenueChart = agencyState.charts && agencyState.charts.revenue;
  if (revenueChart) {
    const colors = getTrendVisual(revenueTrend);
    if (revenueChart.data.datasets[0]) {
      revenueChart.data.datasets[0].backgroundColor = colors.bar;
      revenueChart.data.datasets[0].borderColor = colors.line;
    }
    if (revenueChart.data.datasets[1]) {
      revenueChart.data.datasets[1].borderColor = colors.line;
      revenueChart.data.datasets[1].backgroundColor = colors.fill;
    }
    revenueChart.update();
  }

  const clientsChart = agencyState.charts && agencyState.charts.clients;
  if (clientsChart && clientsChart.data.datasets[0]) {
    const colors = getTrendVisual(clientsTrend);
    const dataset = clientsChart.data.datasets[0];
    dataset.borderColor = colors.line;
    dataset.backgroundColor = colors.fill;
    dataset.pointBackgroundColor = colors.line;
    dataset.pointHoverBackgroundColor = colors.line;
    clientsChart.update();
  }

  const ratioChart = agencyState.charts && agencyState.charts.ratio;
  if (ratioChart && ratioChart.data.datasets[0]) {
    const colors = getTrendVisual(ratioTrend);
    const dataset = ratioChart.data.datasets[0];
    dataset.backgroundColor = [colors.bar, "rgba(30,31,36,0.15)"];
    ratioChart.update();
  }
}

function updateInsightsView(currentMetrics, previousMetrics) {
  if (!insightsReturningValue || !insightsReturningDelta || !insightsAverageBasketValue || !insightsActiveRateValue || !insightsNewClientsValue) {
    return;
  }

  const hasData = currentMetrics && Array.isArray(currentMetrics.filtered) && currentMetrics.filtered.length > 0;
  if (!hasData) {
    insightsReturningValue.textContent = "—";
    insightsAverageBasketValue.textContent = "—";
    insightsActiveRateValue.textContent = "—";
    insightsNewClientsValue.textContent = "—";
    if (insightsNewClientsMeta) insightsNewClientsMeta.textContent = "(vs —)";
    resetTrendIndicator(insightsReturningDelta, "Pas de données");
    resetTrendIndicator(insightsAverageBasketDelta, "Pas de données");
    resetTrendIndicator(insightsActiveRateDelta, "Pas de données");
    resetTrendIndicator(insightsNewClientsDelta, "Pas de données");
    return;
  }

  const previousMetricsSafe = previousMetrics || null;
  insightsReturningValue.textContent = formatPercent(currentMetrics.returningRevenueShare, 1);
  applyTrendIndicator(
    insightsReturningDelta,
    currentMetrics.returningRevenueShare,
    previousMetricsSafe ? previousMetricsSafe.returningRevenueShare : null
  );

  insightsAverageBasketValue.textContent = formatCurrency(currentMetrics.averageBasket, { maximumFractionDigits: 2 });
  applyTrendIndicator(
    insightsAverageBasketDelta,
    currentMetrics.averageBasket,
    previousMetricsSafe ? previousMetricsSafe.averageBasket : null
  );

  insightsActiveRateValue.textContent = formatPercent(currentMetrics.activeRate, 1);
  applyTrendIndicator(
    insightsActiveRateDelta,
    currentMetrics.activeRate,
    previousMetricsSafe ? previousMetricsSafe.activeRate : null
  );

  const previousNewClients = previousMetricsSafe ? previousMetricsSafe.newClientsCount : null;
  insightsNewClientsValue.textContent = formatCount(currentMetrics.newClientsCount);
  if (insightsNewClientsMeta) {
    insightsNewClientsMeta.textContent = previousNewClients !== null && previousNewClients !== undefined
      ? `(vs ${formatCount(previousNewClients)})`
      : "(vs —)";
  }
  applyTrendIndicator(
    insightsNewClientsDelta,
    currentMetrics.newClientsCount,
    previousNewClients,
    { previousFormatter: value => formatCount(value) }
  );
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

function resolveMonthlyThumbsLabel(preset = "") {
  switch (preset) {
    case "30d":
      return "Miniatures — 30 derniers jours";
    case "6m":
      return "Miniatures — 6 derniers mois";
    case "12m":
      return "Miniatures — 12 derniers mois";
    case "custom":
      return "Miniatures — période sélectionnée";
    default:
      return "Miniatures — période";
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
  if (!baseId || !tableId) {
    throw new Error("Identifiants Airtable manquants.");
  }

  const allRows = [];
  const fields = Array.isArray(options.fields) ? options.fields.filter(Boolean) : null;

  const response = await fetch("/api/airtable/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({
      baseId,
      tableId,
      view,
      filterByFormula,
      fields,
      pageSize: 100
    })
  });

  const payloadText = await response.text();
  let payload;
  try {
    payload = payloadText ? JSON.parse(payloadText) : null;
  } catch (err) {
    console.error("Réponse proxy Airtable invalide :", payloadText);
    throw new Error("Réponse Airtable illisible. Vérifie les identifiants.");
  }

  if (!response.ok) {
    const errMsg = payload && payload.error ? payload.error : `${response.status} ${response.statusText}`;
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

  return allRows;
}

const rawModeParam = getParam("mode");
const rawClientParam = getParam("client");
const isAdminRoute = rawModeParam === "admin";
const clientParam = rawClientParam;
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
    totalQuantity: 0,
    revenueByClient: new Map(),
    ordersByClient: new Map(),
    quantityByClient: new Map(),
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
    const quantityRaw = agencyState.fieldMap.quantityField ? parseNumber(row[agencyState.fieldMap.quantityField]) : 1;
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.max(1, Math.round(quantityRaw)) : 1;
    const safeRevenue = Number.isFinite(revenue) ? revenue : 0;
    normalized.push({
      row,
      client,
      date,
      time: date.getTime(),
      revenue: safeRevenue,
      quantity
    });
    if (client) {
      const prevRevenue = agencyState.global.revenueByClient.get(client) || 0;
      agencyState.global.revenueByClient.set(client, prevRevenue + safeRevenue);
      const prevOrders = agencyState.global.ordersByClient.get(client) || 0;
      agencyState.global.ordersByClient.set(client, prevOrders + 1);
      const prevQuantity = agencyState.global.quantityByClient.get(client) || 0;
      agencyState.global.quantityByClient.set(client, prevQuantity + quantity);
      const timeline = agencyState.global.timelineByClient.get(client) || [];
      timeline.push(date);
      agencyState.global.timelineByClient.set(client, timeline);
    }
    agencyState.global.totalRevenue += safeRevenue;
    agencyState.global.totalQuantity += quantity;
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

  const activePreset = agencyState.filter ? agencyState.filter.preset : "";
  if (adminKpiMonthlyThumbsLabelEl) {
    adminKpiMonthlyThumbsLabelEl.textContent = resolveMonthlyThumbsLabel(activePreset);
  }

  const hasData = Array.isArray(agencyState.normalized) && agencyState.normalized.length > 0;
  if (!hasData) {
    if (adminPeriodLabel) adminPeriodLabel.textContent = "Aucune donnée disponible";
    if (adminKpiRevenueEl) adminKpiRevenueEl.textContent = "—";
    if (adminKpiMonthlyThumbsEl) adminKpiMonthlyThumbsEl.textContent = "—";
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
    kpiTrendElements.forEach(element => resetTrendIndicator(element, "Pas de données"));
    updateInsightsView(null, null);
    displayDashboardEmptyState(true);
    renderRevenueChart([], [], []);
    renderClientsChart([], []);
    renderRatioChart(0, 0);
    renderRetentionChart([], []);
    updateChartTrendStyles({ revenueTrend: null, clientsTrend: null, ratioTrend: null, retentionTrend: null });
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

  const currentMetrics = computeRangeMetrics(start, end);
  const previousRange = computePreviousPeriodRange(start, end);
  const previousMetrics = previousRange ? computeRangeMetrics(previousRange.start, previousRange.end) : null;

  if (adminKpiMonthlyThumbsEl) {
    adminKpiMonthlyThumbsEl.textContent = formatCount(currentMetrics.quantity);
  }

  const hasFiltered = currentMetrics.filtered.length > 0;
  displayDashboardEmptyState(!hasFiltered);

  updateInsightsView(currentMetrics, previousMetrics);

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
    kpiTrendElements.forEach(element => resetTrendIndicator(element, "Pas de données"));
    renderRevenueChart([], [], []);
    renderClientsChart([], []);
    renderRatioChart(0, 0);
    renderRetentionChart([], []);
    updateChartTrendStyles({ revenueTrend: null, clientsTrend: null, ratioTrend: null, retentionTrend: null });
    return;
  }

  const totalRevenue = currentMetrics.revenue;
  const totalOrders = currentMetrics.orders;
  const activeClientsCount = currentMetrics.activeClientsCount;
  const totalKnownClients = currentMetrics.totalKnownClients;
  const newClientsCount = currentMetrics.newClientsCount;
  const newClientsRate = currentMetrics.newClientsRate;
  const averageBasket = currentMetrics.averageBasket;
  const activeRate = currentMetrics.activeRate;
  const totalExisting = Math.max(activeClientsCount - newClientsCount, 0);

  if (adminKpiRevenueEl) adminKpiRevenueEl.textContent = formatCurrency(totalRevenue, { maximumFractionDigits: 0 });
  if (adminKpiClientsEl) adminKpiClientsEl.textContent = formatCount(activeClientsCount);
  if (adminKpiAverageBasketEl) adminKpiAverageBasketEl.textContent = formatCurrency(averageBasket, { maximumFractionDigits: 2 });
  if (adminKpiNewClientRateEl) adminKpiNewClientRateEl.textContent = formatPercent(newClientsRate);
  if (adminKpiActiveRateEl) adminKpiActiveRateEl.textContent = formatPercent(activeRate, 1);

  const lifetimeCurrent = computeLifetimeMetricsUpTo(null);
  const lifetimePrevious = previousRange ? computeLifetimeMetricsUpTo(previousRange.end) : null;

  if (adminKpiActiveTooltip) {
    adminKpiActiveTooltip.textContent = `${formatCount(activeClientsCount)} actifs / ${formatCount(totalKnownClients)} clients`;
  }
  if (adminKpiOrdersPerClientEl) {
    adminKpiOrdersPerClientEl.textContent = lifetimeCurrent.ordersPerClient.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }
  if (adminKpiCltvEl) {
    adminKpiCltvEl.textContent = formatCurrency(lifetimeCurrent.cltv, { maximumFractionDigits: 0 });
  }

  if (adminRevenueChartStatus) {
    const statusText = lastDirectorySync ? `MAJ ${formatDateTime(lastDirectorySync)}` : `${totalOrders} commandes`;
    adminRevenueChartStatus.textContent = statusText;
  }
  if (adminClientsChartStatus) adminClientsChartStatus.textContent = `${formatCount(totalKnownClients)} clients`;
  if (adminRatioChartStatus) adminRatioChartStatus.textContent = `${formatCount(newClientsCount)} nouveaux`;
  if (adminRetentionChartStatus) adminRetentionChartStatus.textContent = `${formatCount(totalKnownClients)} clients analysés`;

  const startBoundary = start ? start.getTime() : Number.NEGATIVE_INFINITY;
  const endBoundary = end ? end.getTime() : Number.POSITIVE_INFINITY;
  const rangeStart = start || (currentMetrics.filtered[0] ? startOfDay(currentMetrics.filtered[0].date) : null);
  const rangeEnd = end || (currentMetrics.filtered[currentMetrics.filtered.length - 1]
    ? endOfDay(currentMetrics.filtered[currentMetrics.filtered.length - 1].date)
    : null);
  const timeline = buildMonthlyTimeline(rangeStart, rangeEnd);
  const monthKeys = timeline.map(getMonthKey);
  const monthIndex = new Map();
  monthKeys.forEach((key, idx) => monthIndex.set(key, idx));

  const revenuePerMonth = new Array(timeline.length).fill(0);
  currentMetrics.filtered.forEach(entry => {
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

  const revenueDelta = applyTrendIndicator(
    adminKpiRevenueDeltaEl,
    totalRevenue,
    previousMetrics ? previousMetrics.revenue : null
  );
  applyTrendIndicator(
    adminKpiMonthlyThumbsDeltaEl,
    currentMetrics.quantity,
    previousMetrics ? previousMetrics.quantity : null
  );
  const clientsDelta = applyTrendIndicator(
    adminKpiClientsDeltaEl,
    activeClientsCount,
    previousMetrics ? previousMetrics.activeClientsCount : null
  );
  applyTrendIndicator(
    adminKpiAverageBasketDeltaEl,
    averageBasket,
    previousMetrics ? previousMetrics.averageBasket : null
  );
  const newClientRateDelta = applyTrendIndicator(
    adminKpiNewClientRateDeltaEl,
    newClientsRate,
    previousMetrics ? previousMetrics.newClientsRate : null
  );
  const activeRateDelta = applyTrendIndicator(
    adminKpiActiveRateDeltaEl,
    activeRate,
    previousMetrics ? previousMetrics.activeRate : null
  );
  applyTrendIndicator(
    adminKpiOrdersPerClientDeltaEl,
    lifetimeCurrent.ordersPerClient,
    lifetimePrevious ? lifetimePrevious.ordersPerClient : null
  );
  applyTrendIndicator(
    adminKpiCltvDeltaEl,
    lifetimeCurrent.cltv,
    lifetimePrevious ? lifetimePrevious.cltv : null
  );

  renderRevenueChart(timelineLabels, revenuePerMonth, movingAverage);
  renderClientsChart(timelineLabels, clientTotals);
  renderRatioChart(newClientsCount, totalExisting);
  renderRetentionChart(retentionLabels, retentionMatrix);

  updateChartTrendStyles({
    revenueTrend: revenueDelta.trend,
    clientsTrend: clientsDelta.trend,
    ratioTrend: newClientRateDelta.trend,
    retentionTrend: activeRateDelta.trend
  });
}
async function initializeAgencyDashboard(force = false) {
  if (!isAdminRoute) return;
  if (agencyLoading) return;
  if (agencyInitialized && !force) {
    updateAdminDashboard();
    return;
  }
  if (!DEFAULT_BASE_ID || !DEFAULT_TABLE_ID) {
    if (adminTopSubtitle) {
      adminTopSubtitle.textContent = "Renseigne la base Airtable pour activer les indicateurs.";
    }
    return;
  }

  try {
    agencyLoading = true;
    if (adminTopSubtitle) {
      adminTopSubtitle.textContent = "Chargement des indicateurs…";
    }
    const rows = await fetchAirtableRows({
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
  if (shareTitle) shareTitle.textContent = entry ? entry.label : (config.label || slugToName(normalizedSlug));
  if (shareSubtitle) shareSubtitle.textContent = `Identifiant : ${normalizedSlug}`;
  loadAirtable(config);
  updateMiniaturesLibrary(config);
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
  if (adminTablePlaceholder) adminTablePlaceholder.classList.add("hidden");
  if (adminTableHost) adminTableHost.classList.remove("hidden");
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

  if (DEFAULT_BASE_ID && DEFAULT_TABLE_ID && DEFAULT_PSEUDO_FIELD) {
    try {
      const response = await fetch("/api/airtable/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          baseId: DEFAULT_BASE_ID,
          tableId: DEFAULT_TABLE_ID,
          view: DEFAULT_VIEW_ID || undefined,
          fields: [DEFAULT_PSEUDO_FIELD],
          pageSize: 100
        })
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error((payload && payload.error) || `Airtable ${response.status}`);
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
    if (shareTitle) shareTitle.textContent = "Sélectionne un client";
    if (shareSubtitle) shareSubtitle.textContent = "Choisis un client dans la liste pour générer le lien sécurisé.";
  }
  if (adminTablePlaceholder) adminTablePlaceholder.classList.remove("hidden");
  if (adminTableHost) adminTableHost.classList.add("hidden");
  if (clientSearchInput) clientSearchInput.value = "";
  adminDriveDirectory = [];
  adminDriveDirectoryLoaded = false;
  adminDriveDirectoryLoading = false;
  adminDriveActiveSlug = null;
  adminDriveCache.clear();
  if (adminMiniaturesClientList) adminMiniaturesClientList.innerHTML = "";
  if (adminMiniaturesCountEl) adminMiniaturesCountEl.textContent = "— dossiers";
  clearAdminMiniaturesSelection();
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
    if (adminTablePlaceholder) adminTablePlaceholder.classList.remove("hidden");
    if (adminTableHost) adminTableHost.classList.add("hidden");
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
async function checkAdminSession() {
  try {
    const response = await fetch("/api/admin/me", { credentials: "include" });
    return response.ok;
  } catch (_e) {
    return false;
  }
}

async function loadAirtable({ apiKey, baseId, tableId, view, filterByFormula } = {}) {
  if (!baseId || !tableId) {
    alert("Renseigne une base et une table Airtable.");
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

async function initAdminFlow() {
  setClientContext("");
  const hasSession = await checkAdminSession();
  if (!hasSession) {
    const redirectParam = encodeURIComponent(window.location.href);
    window.location.replace(`/admin-login.html?redirect=${redirectParam}`);
    return;
  }

  enterAdminMode(rawClientParam ? rawClientParam.toLowerCase() : null).catch(err => {
    console.error("Erreur lors de l'initialisation admin", err);
  });

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
}

if (isAdminRoute) {
  initAdminFlow();
} else if (clientParam) {
  const clientConfig = applyClientConfig(clientParam);
  if (clientConfig && clientConfig.baseId && clientConfig.tableId) {
    document.body.classList.remove("admin-mode");
    document.body.classList.add("client-mode");
    if (adminLayout) adminLayout.classList.add("admin-hidden");
    if (clientContainer) clientContainer.classList.remove("hidden");
    ensureTableInHost(clientTableHost);
    currentClientConfig = clientConfig;
    setClientContext(clientConfig.label || slugToName(clientParam));
    updateMiniaturesLibrary(clientConfig);
    loadAirtable(clientConfig);
  } else {
    console.warn(`Aucun client configuré ou clé invalide pour le slug « ${clientParam} ».`);
    document.body.classList.remove("admin-mode");
    document.body.classList.add("client-mode");
    if (adminLayout) adminLayout.classList.add("admin-hidden");
    if (clientContainer) clientContainer.classList.add("hidden");
    updateMiniaturesLibrary(null);
    const existingNotice = document.querySelector(".missing-client-notice");
    if (!existingNotice) {
      const notice = document.createElement("div");
      notice.className = "missing-client-notice";
      notice.innerHTML = `
        <div class="missing-client-card">
          <h2>Accès client requis</h2>
          <p>Utilise le lien personnalisé reçu par email ou WhatsApp pour accéder à ton espace.</p>
        </div>
      `;
      document.body.appendChild(notice);
    }
  }
} else {
  document.body.classList.remove("admin-mode");
  document.body.classList.add("client-mode");
  if (adminLayout) adminLayout.classList.add("admin-hidden");
  if (clientContainer) clientContainer.classList.add("hidden");
  const existingNotice = document.querySelector(".missing-client-notice");
  if (!existingNotice) {
    const notice = document.createElement("div");
    notice.className = "missing-client-notice";
    notice.innerHTML = `
      <div class="missing-client-card">
        <h2>Accès client requis</h2>
        <p>Utilise le lien personnalisé reçu par email ou WhatsApp pour accéder à ton espace.</p>
      </div>
    `;
    document.body.appendChild(notice);
  }
}

// --- YouTube & Mistral AI Logic ---

let ytPerformanceChart = null;

function formatCount(num) {
  if (!num) return "0";
  const n = parseInt(num, 10);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function initYoutubeAnalysis() {
  const form = document.getElementById("youtubeAnalyzeForm");
  const input = document.getElementById("youtubeUrlInput");
  const resultsDiv = document.getElementById("youtubeResults");
  const errorMsg = document.getElementById("youtubeError");
  const analyzeBtn = document.getElementById("youtubeAnalyzeBtn");

  if (!form) return;

  // Setup tab switching
  document.querySelectorAll(".yt-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".yt-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const tab = btn.dataset.tab;
      document.getElementById("tabShorts").classList.toggle("hidden", tab !== "shorts");
      document.getElementById("tabLong").classList.toggle("hidden", tab !== "long");
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    // Reset UI
    resultsDiv.classList.add("hidden");
    errorMsg.classList.add("hidden");
    errorMsg.textContent = "";
    analyzeBtn.disabled = true;
    const originalBtnContent = analyzeBtn.innerHTML;
    analyzeBtn.innerHTML = `<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span> Analyse...`;

    try {
      // 1. Get YouTube Stats
      const statsRes = await fetch("/api/youtube/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await statsRes.json();
      if (!statsRes.ok) throw new Error(data.error || "Erreur lors de l'analyse YouTube");

      const { channel, analytics, topShorts, topLongVideos, monthlyPerformance, insights } = data;

      // Update Channel Header
      document.getElementById("channelAvatar").src = channel.thumbnail;
      document.getElementById("channelTitle").textContent = channel.title;
      document.getElementById("channelCustomUrl").textContent = channel.customUrl ? `@${channel.customUrl}` : "";
      document.getElementById("channelSubscribers").textContent = `${formatCount(channel.subscriberCount)} abonnés`;
      document.getElementById("channelDescription").textContent = channel.description?.slice(0, 150) || "Aucune description.";

      // Update KPIs
      document.getElementById("statsSubs").textContent = formatCount(channel.subscriberCount);
      document.getElementById("statsViews").textContent = formatCount(channel.viewCount);
      document.getElementById("statsVideos").textContent = channel.videoCount;
      document.getElementById("statsAvgEngagement").textContent = analytics.global.avgEngagement + "%";

      // Trend indicator
      const trendEl = document.getElementById("statsTrendDirection");
      if (insights.trend.direction === "up") {
        trendEl.textContent = `↑ +${insights.trend.percentage}%`;
        trendEl.className = "yt-kpi-trend yt-trend-up";
      } else {
        trendEl.textContent = `↓ ${insights.trend.percentage}%`;
        trendEl.className = "yt-kpi-trend yt-trend-down";
      }

      // Format Comparison
      document.getElementById("shortsCount").textContent = analytics.shorts.count;
      document.getElementById("shortsEngagement").textContent = analytics.shorts.avgEngagement + "%";
      document.getElementById("shortsAvgViews").textContent = formatCount(analytics.shorts.avgViews);

      document.getElementById("longCount").textContent = analytics.longVideos.count;
      document.getElementById("longEngagement").textContent = analytics.longVideos.avgEngagement + "%";
      document.getElementById("longAvgViews").textContent = formatCount(analytics.longVideos.avgViews);

      // Insights Cards
      if (insights.optimalDuration) {
        document.getElementById("insightDuration").textContent = insights.optimalDuration.label;
        document.getElementById("insightDurationDesc").textContent = `${insights.optimalDuration.avgEngagement}% engagement`;
      }

      if (insights.bestPostingTime) {
        document.getElementById("insightTime").textContent = insights.bestPostingTime.hourFormatted;
        document.getElementById("insightTimeDesc").textContent = `${insights.bestPostingTime.avgEngagement}% engagement`;
      }

      if (insights.bestPostingDay) {
        document.getElementById("insightDay").textContent = insights.bestPostingDay.day;
        document.getElementById("insightDayDesc").textContent = `${insights.bestPostingDay.avgEngagement}% engagement`;
      }

      document.getElementById("trendIcon").textContent = insights.trend.direction === "up" ? "📈" : "📉";
      document.getElementById("insightTrend").textContent = insights.trend.direction === "up" ? "En hausse" : "En baisse";
      document.getElementById("insightTrendDesc").textContent = `${insights.trend.percentage > 0 ? "+" : ""}${insights.trend.percentage}% vs avant`;

      // Render Top Shorts
      const topShortsList = document.getElementById("topShortsList");
      topShortsList.innerHTML = topShorts.length > 0
        ? topShorts.map(video => renderVideoCard(video)).join("")
        : '<p class="yt-no-data">Aucun Short trouvé</p>';

      // Render Top Long Videos
      const topLongList = document.getElementById("topLongList");
      topLongList.innerHTML = topLongVideos.length > 0
        ? topLongVideos.map(video => renderVideoCard(video)).join("")
        : '<p class="yt-no-data">Aucune vidéo longue trouvée</p>';

      // Render Monthly Chart
      renderMonthlyChart(monthlyPerformance);

      resultsDiv.classList.remove("hidden");

      // 2. Get AI Insights
      const aiContentDiv = document.getElementById("aiContent");
      aiContentDiv.innerHTML = `
        <div class="ai-loading">
            <div class="spinner"></div>
            <p>Analyse approfondie en cours...</p>
        </div>
      `;

      const aiRes = await fetch("/api/mistral/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stats: {
            ...channel,
            shortsCount: analytics.shorts.count,
            shortsEngagement: analytics.shorts.avgEngagement,
            shortsAvgViews: analytics.shorts.avgViews,
            longCount: analytics.longVideos.count,
            longEngagement: analytics.longVideos.avgEngagement,
            longAvgViews: analytics.longVideos.avgViews,
          },
          channelName: channel.title,
          insights,
          topShorts: topShorts.slice(0, 3),
          topLongVideos: topLongVideos.slice(0, 3)
        }),
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok) throw new Error(aiData.error || "Erreur lors de l'analyse IA");

      aiContentDiv.innerHTML = aiData.analysis;

      // Store context for chat
      window.ytChannelContext = {
        title: channel.title,
        subscriberCount: channel.subscriberCount,
        viewCount: channel.viewCount,
        videoCount: channel.videoCount,
        shortsCount: analytics.shorts.count,
        shortsEngagement: analytics.shorts.avgEngagement,
        longCount: analytics.longVideos.count,
        longEngagement: analytics.longVideos.avgEngagement,
        optimalDuration: insights.optimalDuration?.label,
        bestPostingTime: insights.bestPostingTime?.hourFormatted,
        trend: insights.trend?.direction === 'up' ? `+${insights.trend.percentage}%` : `${insights.trend.percentage}%`
      };

      // Init chat
      initAiChat();

    } catch (err) {
      console.error(err);
      errorMsg.textContent = err.message;
      errorMsg.classList.remove("hidden");
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = originalBtnContent || `<span>Analyser</span>`;
    }
  });
}

function initAiChat() {
  const chatForm = document.getElementById("aiChatForm");
  const chatInput = document.getElementById("chatInput");
  const chatMessages = document.getElementById("chatMessages");
  const chatSubmitBtn = document.getElementById("chatSubmitBtn");

  if (!chatForm) return;

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = chatInput.value.trim();
    if (!question) return;

    // Add user message
    chatMessages.innerHTML += `<div class="yt-chat-message user"><strong>Vous:</strong> ${question}</div>`;
    chatInput.value = "";
    chatSubmitBtn.disabled = true;
    chatSubmitBtn.textContent = "...";

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const res = await fetch("/api/mistral/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          channelContext: window.ytChannelContext || null
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      chatMessages.innerHTML += `<div class="yt-chat-message ai">${data.answer}</div>`;
    } catch (err) {
      chatMessages.innerHTML += `<div class="yt-chat-message ai" style="color: #ef4444;">Erreur: ${err.message}</div>`;
    } finally {
      chatSubmitBtn.disabled = false;
      chatSubmitBtn.textContent = "Envoyer";
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });
}

function renderVideoCard(video) {
  return `
    <div class="yt-video-item">
      <img src="${video.thumbnail}" alt="${video.title}" class="yt-video-thumb" />
      <div class="yt-video-info">
        <div class="yt-video-title">${video.title}</div>
        <div class="yt-video-stats">
          <span>${formatCount(video.views)} vues</span>
          <span>${formatCount(video.likes)} likes</span>
          <span>${video.durationFormatted}</span>
          <span class="yt-video-engagement">${video.engagementRate}% engagement</span>
        </div>
      </div>
    </div>
  `;
}

function renderMonthlyChart(monthlyData) {
  const ctx = document.getElementById("ytPerformanceChart");
  if (!ctx) return;

  if (ytPerformanceChart) {
    ytPerformanceChart.destroy();
  }

  const labels = monthlyData.map(m => m.month);
  const viewsData = monthlyData.map(m => m.totalViews);
  const engagementData = monthlyData.map(m => m.avgEngagement);

  ytPerformanceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Vues totales",
          data: viewsData,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: "#3b82f6",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          yAxisID: "y",
        },
        {
          label: "Engagement moyen",
          data: engagementData,
          borderColor: "#f59a2d",
          backgroundColor: "transparent",
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: "#f59a2d",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            padding: 16,
            font: { size: 12 },
            color: "#64748b",
          },
        },
        tooltip: {
          backgroundColor: "#fff",
          titleColor: "#111",
          bodyColor: "#666",
          borderColor: "#e5e7eb",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: true,
          callbacks: {
            label: function (context) {
              if (context.datasetIndex === 0) {
                return ` Vues: ${formatCount(context.raw)}`;
              }
              return ` Engagement: ${context.raw}%`;
            }
          }
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
          },
        },
        y: {
          type: "linear",
          display: true,
          position: "left",
          grid: {
            color: "rgba(0, 0, 0, 0.04)",
          },
          ticks: {
            color: "#3b82f6",
            font: { size: 11 },
            callback: function (value) {
              return formatCount(value);
            },
          },
          title: {
            display: true,
            text: "Vues",
            color: "#3b82f6",
            font: { size: 11, weight: 500 },
          },
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            color: "#f59a2d",
            font: { size: 11 },
            callback: function (value) {
              return value + "%";
            },
          },
          title: {
            display: true,
            text: "Engagement",
            color: "#f59a2d",
            font: { size: 11, weight: 500 },
          },
        },
      },
    },
  });
}

// Init when DOM loaded
document.addEventListener("DOMContentLoaded", initYoutubeAnalysis);
