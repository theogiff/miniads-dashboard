// --- Configuration multi-clients ---
// Clé Airtable côté serveur (laisse vide ici, lue via variable d'environnement).
const DEFAULT_API_KEY = "";
// Paramètres par défaut si tous les clients partagent la même base / table / vue.
const DEFAULT_BASE_ID = "app4xekxY53MuEQvK";
const DEFAULT_TABLE_ID = "tblnA0z8ooGAZYXIp";
const DEFAULT_VIEW_ID = "";
const DEFAULT_PSEUDO_FIELD = "Créateurs";
const PACKS_TABLE_ID = "tbldaOp2rbjxKuLsr";
const CLIENTS_TABLE_ID = "tblwTQ6JgbVv1Krj8";
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
  //   driveFolderUrl: "https://drive.google.com/drive/folders/1AbcXYZ", // idem mais via URL
  //   stripeEmail: "client@email.com" // (optionnel) email Stripe pour charger les factures
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
