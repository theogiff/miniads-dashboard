import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { google } from "googleapis";

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
  const [email, expStr, hmac] = token.split(".");
  if (!email || !expStr || !hmac) return null;
  const payload = `${email}.${expStr}`;
  const expected = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("hex");
  const bufExpected = Buffer.from(expected);
  const bufHmac = Buffer.from(hmac);
  if (bufExpected.length !== bufHmac.length) return null;
  if (!crypto.timingSafeEqual(bufExpected, bufHmac)) return null;
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
    res.json({ ok: true });
  } catch (e) {
    console.error("Erreur /api/admin/login:", e.message);
    res.status(500).json({ error: "Erreur login admin" });
  }
});

app.get("/api/admin/me", (req, res) => {
  try {
    const cookies = parseCookies(req);
    const token = cookies[ADMIN_SESSION_COOKIE];
    const email = verifySession(token);
    if (!email) {
      return res.status(401).json({ error: "Session invalide" });
    }
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

// --- Endpoint debug: voir les dossiers racine des clients ---
app.get("/api/client/list-root", async (req, res) => {
  try {
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
