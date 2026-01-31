import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { google } from "googleapis";
import NodeCache from "node-cache";

const app = express();
app.use(cors());
app.use(express.json());

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
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_BASE = process.env.MISTRAL_API_BASE || "https://api.mistral.ai/v1";
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-small-latest";
const YOUTUBE_CACHE_TTL = Number.parseInt(process.env.YOUTUBE_CACHE_TTL || "600", 10);
const youtubeCache = new NodeCache({
  stdTTL: Number.isFinite(YOUTUBE_CACHE_TTL) ? YOUTUBE_CACHE_TTL : 600,
  checkperiod: 120
});

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

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

const toSafeNumber = (value) => {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : 0;
};

const extractYoutubeHint = (input = "") => {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    if (/^UC[a-zA-Z0-9_-]{20,}$/.test(raw)) {
      return { type: "id", value: raw };
    }
    if (raw.startsWith("@")) {
      return { type: "handle", value: raw.slice(1) };
    }
    return { type: "search", value: raw };
  }

  let url;
  try {
    url = new URL(raw);
  } catch (_e) {
    return { type: "search", value: raw };
  }

  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  const videoParam = url.searchParams.get("v");
  if (videoParam) return { type: "video", value: videoParam };
  if (host === "youtu.be") {
    const videoId = path.slice(1);
    if (videoId) return { type: "video", value: videoId };
  }
  if (path.startsWith("/channel/")) {
    return { type: "id", value: path.split("/")[2] };
  }
  if (path.startsWith("/@")) {
    return { type: "handle", value: path.slice(2) };
  }
  if (path.startsWith("/user/")) {
    return { type: "user", value: path.split("/")[2] };
  }
  if (path.startsWith("/c/")) {
    return { type: "search", value: path.split("/")[2] };
  }
  const fallback = path.split("/")[1];
  if (fallback?.startsWith("@")) {
    return { type: "handle", value: fallback.slice(1) };
  }
  if (fallback) {
    return { type: "search", value: fallback };
  }
  return { type: "search", value: raw };
};

const youtubeApiRequest = async (endpoint, params = {}) => {
  if (!YOUTUBE_API_KEY) {
    throw new Error("Clé YouTube manquante");
  }
  const cacheKey = `yt:${endpoint}:${JSON.stringify(params)}`;
  const cached = youtubeCache.get(cacheKey);
  if (cached) return cached;

  const query = new URLSearchParams({ ...params, key: YOUTUBE_API_KEY });
  const response = await fetch(`${YOUTUBE_API_BASE}/${endpoint}?${query.toString()}`);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_e) {
    payload = null;
  }

  if (!response.ok) {
    const errMsg = payload?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(errMsg);
  }
  youtubeCache.set(cacheKey, payload);
  return payload;
};

const fetchChannelById = async (channelId) => {
  if (!channelId) return null;
  const payload = await youtubeApiRequest("channels", {
    part: "snippet,statistics,brandingSettings",
    id: channelId
  });
  return payload?.items?.[0] || null;
};

const fetchChannelByParam = async (paramKey, value) => {
  if (!value) return null;
  const payload = await youtubeApiRequest("channels", {
    part: "snippet,statistics,brandingSettings",
    [paramKey]: value
  });
  return payload?.items?.[0] || null;
};

const fetchChannelIdFromVideo = async (videoId) => {
  if (!videoId) return null;
  const payload = await youtubeApiRequest("videos", {
    part: "snippet",
    id: videoId
  });
  return payload?.items?.[0]?.snippet?.channelId || null;
};

const fetchChannelIdFromSearch = async (query) => {
  if (!query) return null;
  const payload = await youtubeApiRequest("search", {
    part: "snippet",
    type: "channel",
    q: query,
    maxResults: 1
  });
  return (
    payload?.items?.[0]?.snippet?.channelId ||
    payload?.items?.[0]?.id?.channelId ||
    null
  );
};

const resolveChannelFromInput = async (input) => {
  const hint = extractYoutubeHint(input);
  if (!hint) return null;

  if (hint.type === "id") {
    return fetchChannelById(hint.value);
  }

  if (hint.type === "handle") {
    try {
      const channel = await fetchChannelByParam("forHandle", hint.value);
      if (channel) return channel;
    } catch (_e) {
      // Fallback to search.
    }
  }

  if (hint.type === "user") {
    try {
      const channel = await fetchChannelByParam("forUsername", hint.value);
      if (channel) return channel;
    } catch (_e) {
      // Fallback to search.
    }
  }

  if (hint.type === "video") {
    const channelId = await fetchChannelIdFromVideo(hint.value);
    if (channelId) {
      return fetchChannelById(channelId);
    }
  }

  const channelId = await fetchChannelIdFromSearch(hint.value);
  if (channelId) {
    return fetchChannelById(channelId);
  }
  return null;
};

const normalizeChannel = (channel) => {
  if (!channel) return null;
  const snippet = channel.snippet || {};
  const branding = channel.brandingSettings || {};
  const thumbnails = snippet.thumbnails || {};
  const thumbnail =
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    "";
  const customUrl = snippet.customUrl
    ? (snippet.customUrl.startsWith("@") ? snippet.customUrl : `@${snippet.customUrl}`)
    : "";
  const url = channel.id
    ? `https://www.youtube.com/channel/${channel.id}`
    : customUrl
      ? `https://www.youtube.com/${customUrl}`
      : "";
  return {
    id: channel.id || "",
    title: snippet.title || "",
    description: snippet.description || "",
    customUrl,
    publishedAt: snippet.publishedAt || "",
    country: snippet.country || "",
    thumbnail,
    bannerUrl: branding?.image?.bannerExternalUrl || "",
    url
  };
};

const buildMetrics = (stats = {}) => {
  const subscribers = toSafeNumber(stats.subscriberCount);
  const views = toSafeNumber(stats.viewCount);
  const videos = toSafeNumber(stats.videoCount);
  const avgViews = videos ? Math.round(views / videos) : 0;
  return { subscribers, views, videos, avgViews };
};

const normalizeVideos = (items = []) => {
  return items.map((item) => {
    const snippet = item.snippet || {};
    const stats = item.statistics || {};
    const content = item.contentDetails || {};
    const thumbnails = snippet.thumbnails || {};
    const thumbnail =
      thumbnails.high?.url ||
      thumbnails.medium?.url ||
      thumbnails.default?.url ||
      "";
    return {
      id: item.id || "",
      title: snippet.title || "",
      publishedAt: snippet.publishedAt || "",
      thumbnail,
      viewCount: toSafeNumber(stats.viewCount),
      likeCount: toSafeNumber(stats.likeCount),
      commentCount: toSafeNumber(stats.commentCount),
      duration: content.duration || "",
      url: item.id ? `https://www.youtube.com/watch?v=${item.id}` : ""
    };
  });
};

const fetchTopVideos = async (channelId) => {
  if (!channelId) return [];
  const search = await youtubeApiRequest("search", {
    part: "id",
    channelId,
    order: "viewCount",
    maxResults: 6,
    type: "video"
  });
  const ids = (search?.items || [])
    .map((item) => item?.id?.videoId)
    .filter(Boolean);
  if (!ids.length) return [];

  const videosPayload = await youtubeApiRequest("videos", {
    part: "snippet,statistics,contentDetails",
    id: ids.join(",")
  });
  const normalized = normalizeVideos(videosPayload?.items || []);
  return normalized.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
};

const buildFallbackRecommendations = (metrics = {}, videos = []) => {
  const recommendations = [];
  const subscribers = Number(metrics.subscribers) || 0;
  const avgViews = Number(metrics.avgViews) || 0;
  const totalVideos = Number(metrics.videos) || 0;

  if (totalVideos < 20) {
    recommendations.push({
      title: "Renforcer la cadence",
      detail: "Augmente légèrement la fréquence de publication pour installer une routine chez les abonnés."
    });
  }

  if (subscribers && avgViews && avgViews < subscribers * 0.1) {
    recommendations.push({
      title: "Optimiser titres et miniatures",
      detail: "Teste des titres plus précis et des miniatures plus contrastées pour améliorer le taux de clic."
    });
  }

  if (videos.length) {
    const best = videos[0];
    recommendations.push({
      title: "Capitaliser sur le top contenu",
      detail: `Le format "${best.title || "Top vidéo"}" performe bien. Décline-le en série ou en spin-off.`
    });
  }

  recommendations.push({
    title: "Structurer la prochaine série",
    detail: "Planifie 3 à 5 vidéos reliées pour booster le binge et la rétention sur la chaîne."
  });

  return recommendations.slice(0, 4);
};

const requestMistralInsights = async (payload, fallback) => {
  if (!MISTRAL_API_KEY) {
    return {
      recommendations: fallback,
      summary: "Ajoute une clé Mistral pour débloquer les recommandations IA.",
      source: "fallback"
    };
  }

  const safePayload = {
    channel: {
      title: payload?.channel?.title || "",
      description: payload?.channel?.description || "",
      subscribers: payload?.metrics?.subscribers || 0,
      views: payload?.metrics?.views || 0,
      videos: payload?.metrics?.videos || 0,
      avgViews: payload?.metrics?.avgViews || 0
    },
    topVideos: (payload?.topVideos || []).slice(0, 5).map((video) => ({
      title: video.title || "",
      viewCount: video.viewCount || 0,
      likeCount: video.likeCount || 0,
      commentCount: video.commentCount || 0
    }))
  };

  const response = await fetch(`${MISTRAL_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Tu es un analyste croissance YouTube. Donne des recommandations actionnables, courtes et précises."
        },
        {
          role: "user",
          content: `Voici les données : ${JSON.stringify(safePayload)}. Réponds en JSON avec la forme {"summary":"...","recommendations":[{"title":"...","detail":"..."}]}.`
        }
      ]
    })
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_e) {
    data = null;
  }

  if (!response.ok) {
    const errMsg = data?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(errMsg);
  }

  const content = data?.choices?.[0]?.message?.content?.trim() || "";
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  let parsed = null;
  try {
    parsed = cleaned ? JSON.parse(cleaned) : null;
  } catch (_e) {
    parsed = null;
  }

  if (parsed?.recommendations) {
    const list = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    const normalized = list.map((item, index) => {
      if (typeof item === "string") {
        return { title: `Conseil ${index + 1}`, detail: item };
      }
      return item;
    });
    return {
      recommendations: normalized,
      summary: parsed.summary || "Recommandations générées.",
      source: "mistral"
    };
  }

  const lines = content
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 4);

  const recommendations = lines.map((line, index) => ({
    title: `Conseil ${index + 1}`,
    detail: line
  }));

  return {
    recommendations: recommendations.length ? recommendations : fallback,
    summary: "Recommandations générées.",
    source: "mistral"
  };
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

// --- YouTube analytics ---
app.get("/api/youtube/channel", async (req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: "Clé YouTube manquante sur le serveur" });
    }
    const { url } = req.query || {};
    if (!url) {
      return res.status(400).json({ error: "Paramètre url requis" });
    }
    const channel = await resolveChannelFromInput(String(url));
    if (!channel) {
      return res.status(404).json({ error: "Chaîne YouTube introuvable" });
    }
    const metrics = buildMetrics(channel.statistics || {});
    const topVideos = await fetchTopVideos(channel.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      channel: normalizeChannel(channel),
      metrics,
      topVideos
    });
  } catch (e) {
    console.error("Erreur /api/youtube/channel:", e.message);
    res.status(500).json({ error: "Erreur YouTube" });
  }
});

app.post("/api/ai/youtube-insights", async (req, res) => {
  try {
    const { channel, metrics, topVideos } = req.body || {};
    if (!metrics && !channel) {
      return res.status(400).json({ error: "Données insuffisantes pour l’analyse" });
    }
    const fallback = buildFallbackRecommendations(metrics || {}, topVideos || []);
    try {
      const result = await requestMistralInsights({ channel, metrics, topVideos }, fallback);
      res.setHeader("Cache-Control", "no-store");
      return res.json(result);
    } catch (error) {
      console.error("Erreur Mistral:", error.message);
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        recommendations: fallback,
        summary: "Insights IA en mode secours.",
        source: "fallback"
      });
    }
  } catch (e) {
    console.error("Erreur /api/ai/youtube-insights:", e.message);
    res.status(500).json({ error: "Erreur IA" });
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

export default app;
