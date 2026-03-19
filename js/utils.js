// --- Utilitaires simples ---
function getParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
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
    // For attachment arrays, extract image URLs specifically
    const urls = value
      .filter(item => item && typeof item === "object" && typeof item.url === "string")
      .map(item => item.url);
    if (urls.length > 0) return urls.join(", ");
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
