import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { google } from "googleapis";

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the parent directory (frontend)
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendPath = path.join(__dirname, "..");
app.use(express.static(frontendPath));

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

// --- Auth Google Drive ---
function getAuth() {
  const privateKey = process.env.GSA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!process.env.GSA_CLIENT_EMAIL || !privateKey) {
    throw new Error("GSA creds manquants");
  }
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GSA_CLIENT_EMAIL,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

function driveClient(auth) {
  return google.drive({ version: "v3", auth });
}

async function listFolderChildren(drive, folderId) {
  const results = [];
  let pageToken;
  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields:
        "nextPageToken, files(id,name,mimeType,modifiedTime,thumbnailLink,webViewLink,webContentLink)",
      orderBy: "modifiedTime desc",
      pageSize: 200,
      pageToken,
    });
    if (response.data.files?.length) {
      results.push(...response.data.files);
    }
    pageToken = response.data.nextPageToken || null;
  } while (pageToken);
  return results;
}

// --- Helpers ---
const norm = (s = "") =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const extractClientNameFromFolder = (folderName = "") => {
  // "Miniatures - Yomi Denzel" -> "Yomi Denzel"
  return folderName.replace(/^miniatures\s*-\s*/i, "").trim();
};

// --- Admin session helpers ---
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;

const signSession = (email) => {
  const exp = Date.now() + ADMIN_SESSION_TTL_MS;
  const payload = `${email}.${exp}`;
  const hmac = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET || "")
    .update(payload)
    .digest("hex");
  return `${payload}.${hmac}`;
};

const parseCookies = (req) => {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, part) => {
    const [k, v] = part.trim().split("=");
    if (k && v) acc[k] = decodeURIComponent(v);
    return acc;
  }, {});
};

const verifySession = (token) => {
  if (!token || !ADMIN_SESSION_SECRET) return null;
  const parts = token.split(".");
  const hmac = parts.pop();
  const expStr = parts.pop();
  const email = parts.join(".");
  if (!email || !expStr || !hmac) return null;
  const payload = `${email}.${expStr}`;
  const expected = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("hex");
  if (expected !== hmac) {
    console.warn("Session HMAC mismatch", {
      email,
      expStr,
      expectedHead: expected.slice(0, 8),
      receivedHead: hmac.slice(0, 8),
      expectedLen: expected.length,
      receivedLen: hmac.length
    });
    return null;
  }
  const exp = Number.parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return email;
};

const setSessionCookie = (res, token) => {
  const maxAge = Math.floor(ADMIN_SESSION_TTL_MS / 1000);
  const cookie = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    isProduction ? "Secure" : null
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", cookie);
};

const clearSessionCookie = (res) => {
  const cookie = [
    `${ADMIN_SESSION_COOKIE}=deleted`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    isProduction ? "Secure" : null
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", cookie);
};

// --- Admin endpoints ---
app.post("/api/admin/login", (req, res) => {
  try {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) {
      console.error("Admin config manquante", {
        hasEmail: !!ADMIN_EMAIL,
        hasPassword: !!ADMIN_PASSWORD,
        hasSecret: !!ADMIN_SESSION_SECRET,
      });
      return res.status(500).json({ error: "Configuration admin manquante" });
    }
    const { email = "", password = "" } = req.body || {};
    const normalized = String(email).trim().toLowerCase();
    if (
      normalized !== ADMIN_EMAIL.trim().toLowerCase() ||
      String(password) !== ADMIN_PASSWORD
    ) {
      return res.status(401).json({ error: "Identifiants incorrects" });
    }
    const token = signSession(ADMIN_EMAIL.trim().toLowerCase());
    setSessionCookie(res, token);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  } catch (e) {
    console.error("Erreur /api/admin/login:", e.message);
    res.status(500).json({ error: "Erreur login admin" });
  }
});

app.get("/api/admin/me", (req, res) => {
  try {
    if (!ADMIN_SESSION_SECRET || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
      console.error("Admin config manquante sur /me", {
        hasEmail: !!ADMIN_EMAIL,
        hasPassword: !!ADMIN_PASSWORD,
        hasSecret: !!ADMIN_SESSION_SECRET,
      });
      return res.status(500).json({ error: "Configuration admin manquante" });
    }
    const cookies = parseCookies(req);
    const token = cookies[ADMIN_SESSION_COOKIE];
    if (!token) {
      return res.status(401).json({ error: "Session manquante" });
    }
    const email = verifySession(token);
    if (!email) {
      console.warn("Session invalide (signature/expiration)", {
        tokenLength: token.length,
        tokenHead: token.slice(0, 24)
      });
      clearSessionCookie(res);
      res.setHeader("Cache-Control", "no-store");
      return res.status(401).json({ error: "Session invalide" });
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ email });
  } catch (e) {
    console.error("Erreur /api/admin/me:", e.message);
    res.status(500).json({ error: "Erreur session admin" });
  }
});

app.post("/api/admin/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// --- Helpers ---
const isAdminRequest = (req) => {
  try {
    if (!ADMIN_SESSION_SECRET || !ADMIN_EMAIL || !ADMIN_PASSWORD) return false;
    const cookies = parseCookies(req);
    const token = cookies[ADMIN_SESSION_COOKIE];
    if (!token) return false;
    const email = verifySession(token);
    return !!email;
  } catch (_e) {
    return false;
  }
};

// --- Airtable proxy ---
app.post("/api/airtable/query", async (req, res) => {
  try {
    if (!AIRTABLE_API_KEY) {
      return res.status(500).json({ error: "Clé Airtable manquante sur le serveur" });
    }
    const { baseId, tableId, view, filterByFormula, fields, pageSize = 100, maxRecords } = req.body || {};
    if (!baseId || !tableId) {
      return res.status(400).json({ error: "baseId et tableId requis" });
    }

    const safeBase = encodeURIComponent(String(baseId).trim());
    const safeTable = encodeURIComponent(String(tableId).trim());
    const baseUrl = `https://api.airtable.com/v0/${safeBase}/${safeTable}`;
    const allRecords = [];
    let offset;
    let page = 0;

    do {
      const params = new URLSearchParams();
      params.set("pageSize", String(pageSize || 100));
      if (view) params.set("view", String(view).trim());
      if (filterByFormula) params.set("filterByFormula", String(filterByFormula));
      if (offset) params.set("offset", offset);
      if (Array.isArray(fields)) {
        fields.filter(Boolean).forEach((f) => params.append("fields[]", f));
      }

      const response = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      if (!response.ok) {
        const errMsg = payload?.error?.message || `${response.status} ${response.statusText}`;
        throw new Error(errMsg);
      }

      const records = payload?.records || [];
      allRecords.push(...records);
      offset = payload?.offset || null;
      page += 1;
      const reachedMax = maxRecords && allRecords.length >= maxRecords;
      if (reachedMax) break;
    } while (offset);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      records: maxRecords ? allRecords.slice(0, maxRecords) : allRecords
    });
  } catch (e) {
    console.error("Erreur /api/airtable/query:", e.message);
    res.status(500).json({ error: "Erreur Airtable" });
  }
});

// --- Endpoint debug: voir les dossiers racine des clients ---
app.get("/api/client/list-root", async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(401).json({ error: "Non autorisé" });
    }

    if (!process.env.CLIENT_MAIN_FOLDER) {
      return res
        .status(500)
        .json({ error: "CLIENT_MAIN_FOLDER non défini dans .env" });
    }

    const auth = getAuth();
    const drive = driveClient(auth);

    const r = await drive.files.list({
      q: `'${process.env.CLIENT_MAIN_FOLDER}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 500,
      orderBy: "name",
    });

    res.json(r.data.files || []);
  } catch (e) {
    console.error("Erreur list-root:", e.message);
    res.status(500).json({ error: "Erreur list-root" });
  }
});

// --- Endpoint principal : par slug client (?client=yomi-denzel) ---
app.get("/api/client/bySlug/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const providedKey = req.query.key;

    // Clé d'accès obligatoire pour les clients (hors admin)
    if (!providedKey && !isAdminRequest(req)) {
      return res.status(401).json({ error: "Clé d'accès requise" });
    }

    if (!process.env.CLIENT_MAIN_FOLDER) {
      return res
        .status(500)
        .json({ error: "CLIENT_MAIN_FOLDER non défini dans .env" });
    }

    const auth = getAuth();
    const drive = driveClient(auth);

    const slugNorm = norm(slug.replace(/-/g, " ")); // "yomi-denzel" -> "yomi denzel"

    // 1) Liste les dossiers du root "Miniatures - XXX"
    const r = await drive.files.list({
      q: `'${process.env.CLIENT_MAIN_FOLDER}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name,webViewLink,modifiedTime)",
      pageSize: 500,
    });

    const folders = r.data.files || [];

    // 2) Trouve le bon client
    const clientFolder = folders.find((f) => {
      const clientName = extractClientNameFromFolder(f.name); // ex: Yomi Denzel
      return norm(clientName) === slugNorm;
    });

    if (!clientFolder) {
      return res.status(404).json({
        error: `Dossier client introuvable pour le slug "${slug}"`,
      });
    }

    // 3) Parcourt récursivement tous les sous-dossiers pour remonter les images
    const basePath = clientFolder.name;
    const basePrefix = `${basePath} / `;
    const foldersQueue = [
      {
        id: clientFolder.id,
        name: clientFolder.name,
        path: clientFolder.name,
        relativePath: "",
      },
    ];
    const visited = new Set();
    const allFiles = [];

    while (foldersQueue.length) {
      const current = foldersQueue.shift();
      if (!current || visited.has(current.id)) continue;
      visited.add(current.id);

      const children = await listFolderChildren(drive, current.id);
      if (!children.length) continue;

      children.forEach((entry) => {
        if (entry.mimeType === DRIVE_FOLDER_MIME) {
          const childPath = `${current.path} / ${entry.name}`;
          const relativePath = childPath.startsWith(basePrefix)
            ? childPath.slice(basePrefix.length)
            : entry.name;
          foldersQueue.push({
            id: entry.id,
            name: entry.name,
            path: childPath,
            relativePath,
          });
          return;
        }

        if (entry.mimeType?.startsWith("image/")) {
          const relativeLabel = (current.relativePath || "").trim();
          const folderDisplayName =
            relativeLabel || current.name || clientFolder.name;
          allFiles.push({
            ...entry,
            folderName: folderDisplayName,
            folderPath: relativeLabel || current.path || current.name,
          });
        }
      });
    }

    // 4) Tri par date
    allFiles.sort((a, b) => {
      const aDate = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
      const bDate = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
      return bDate - aDate;
    });

    res.json({
      folderId: clientFolder.id,
      folderName: clientFolder.name,
      files: allFiles,
    });
  } catch (e) {
    console.error("Erreur Drive /bySlug:", e.message);
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération des miniatures." });
  }
});

// --- Integrations YouTube & Mistral ---

app.post("/api/youtube/stats", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL requise" });

    // 1. Extraire l'ID ou le maintainer handle
    // Formats: youtube.com/@Handle, youtube.com/channel/ID, youtube.com/user/USER
    let channelId = null;
    let username = null;

    const u = new URL(url);
    const path = u.pathname;

    if (path.startsWith("/channel/")) {
      channelId = path.split("/")[2];
    } else if (path.startsWith("/user/")) {
      username = path.split("/")[2];
    } else if (path.startsWith("/@")) {
      // On doit utiliser search pour trouver l'ID via le handle
      // Mais l'API v3 search n'est pas toujours directe pour @handle -> ID sans cout
      // On va utiliser search list avec q=@handle type=channel
      username = path.slice(1); // remove @
    } else {
      // Tenter via search genéral si pas de format connu
      username = path.replace("/", "");
    }

    const youtube = google.youtube({
      version: "v3",
      auth: process.env.YOUTUBE_API_KEY,
    });

    if (!channelId) {
      // Recherche l'ID
      const q = path.startsWith("/@") ? path : url;
      const searchRes = await youtube.search.list({
        part: "snippet",
        q: q,
        type: "channel",
        maxResults: 1,
      });
      if (!searchRes.data.items?.length) {
        return res.status(404).json({ error: "Chaîne introuvable" });
      }
      channelId = searchRes.data.items[0].snippet.channelId;
    }

    // 2. Récupérer les stats
    const statsRes = await youtube.channels.list({
      part: "snippet,statistics,contentDetails",
      id: channelId,
    });

    if (!statsRes.data.items?.length) {
      return res.status(404).json({ error: "Détails de la chaîne introuvables" });
    }

    const item = statsRes.data.items[0];
    const snippet = item.snippet;
    const stats = item.statistics;

    res.json({
      title: snippet.title,
      description: snippet.description,
      customUrl: snippet.customUrl,
      thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
      subscriberCount: stats.subscriberCount,
      viewCount: stats.viewCount,
      videoCount: stats.videoCount,
    });

  } catch (e) {
    console.error("Erreur API YouTube:", e.message);
    // Gestion spécifique si quota dépassé etc
    res.status(500).json({ error: "Erreur lors de l'analyse YouTube" });
  }
});

app.post("/api/mistral/analyze", async (req, res) => {
  try {
    const { stats, channelName } = req.body;
    if (!process.env.MISTRAL_API_KEY) {
      return res.status(500).json({ error: "Clé API Mistral manquante" });
    }

    // Prompt simple
    const prompt = `
    Tu es un expert en stratégie YouTube. Analyse les statistiques suivantes pour la chaîne "${channelName || 'Inconnue'}":
    - Abonnés: ${stats.subscriberCount}
    - Vues totales: ${stats.viewCount}
    - Nombre de vidéos: ${stats.videoCount}
    - Description: ${stats.description ? stats.description.slice(0, 300) + '...' : 'Aucune'}

    Donne-moi 3 conseils courts, percutants et personnalisés pour améliorer cette chaîne, et une courte analyse de son état actuel (en 2 phrases). 
    Format HTML simple (utilise <p>, <ul>, <li>, <strong>). Reste bienveillant mais direct.
    `;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-tiny", // ou mistral-small selon dispo
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Mistral API Error:", errText);
      throw new Error("Erreur Mistral API");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "Pas de réponse générée.";

    res.json({ analysis: content });

  } catch (e) {
    console.error("Erreur API Mistral:", e.message);
    res.status(500).json({ error: "Erreur lors de l'analyse IA" });
  }
});

// --- Exports ---
export default app;
