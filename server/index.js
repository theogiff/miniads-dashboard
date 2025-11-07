const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const dotenv = require("dotenv");

dotenv.config();

const PORT = process.env.PORT || 3000;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function normalizeClientId(value = "") {
  return String(value || "").trim().toLowerCase();
}

function buildClientFolderMap() {
  const map = new Map();
  const rawMap = process.env.CLIENT_FOLDER_MAP;
  if (rawMap) {
    try {
      const parsed = JSON.parse(rawMap);
      Object.entries(parsed).forEach(([key, folderId]) => {
        if (typeof folderId === "string" && folderId.trim()) {
          map.set(normalizeClientId(key), folderId.trim());
        }
      });
    } catch (error) {
      console.warn("CLIENT_FOLDER_MAP invalide :", error.message);
    }
  }

  const prefix = "CLIENT_FOLDER_";
  Object.keys(process.env).forEach(envKey => {
    if (!envKey.startsWith(prefix)) return;
    const folderId = process.env[envKey];
    if (typeof folderId !== "string" || !folderId.trim()) return;
    const slug = envKey.slice(prefix.length);
    if (!slug) return;
    map.set(normalizeClientId(slug), folderId.trim());
  });

  return map;
}

const CLIENT_FOLDERS = buildClientFolderMap();

function resolveClientFolder(clientId) {
  if (!clientId) return null;
  const normalized = normalizeClientId(clientId);
  return CLIENT_FOLDERS.get(normalized) || null;
}

let driveClientPromise = null;

async function getDriveClient() {
  if (driveClientPromise) {
    return driveClientPromise;
  }

  const clientEmail = process.env.GSA_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GSA_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) {
    throw new Error("Identifiants de service account manquants (GSA_CLIENT_EMAIL / GSA_PRIVATE_KEY).");
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey
    },
    scopes: [DRIVE_SCOPE]
  });

  driveClientPromise = auth
    .getClient()
    .then(authClient => google.drive({
      version: "v3",
      auth: authClient
    }))
    .catch(error => {
      driveClientPromise = null;
      throw error;
    });

  return driveClientPromise;
}

const app = express();
app.use(cors());

app.get("/api/client/:clientId/files", async (req, res) => {
  const { clientId } = req.params;
  const folderId = resolveClientFolder(clientId);

  if (!folderId) {
    return res.status(404).json({
      error: "Client introuvable ou non configuré.",
      clientId
    });
  }

  let drive;
  try {
    drive = await getDriveClient();
  } catch (error) {
    console.error("Erreur d'initialisation Drive :", error);
    return res.status(500).json({
      error: "Configuration Drive invalide.",
      details: error.message
    });
  }

  let folderInfo = null;
  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: "id,name,webViewLink",
      supportsAllDrives: true
    });
    folderInfo = response.data || null;
  } catch (error) {
    console.warn("Impossible de récupérer les métadonnées du dossier :", error.message);
  }

  try {
    const listResponse = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id,name,mimeType,modifiedTime,webViewLink,webContentLink,thumbnailLink)",
      orderBy: "modifiedTime desc",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 100
    });

    const files = (listResponse.data.files || []).map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      thumbnailLink: file.thumbnailLink
    }));

    return res.json({
      folder: folderInfo
        ? {
            id: folderInfo.id,
            name: folderInfo.name,
            webViewLink: folderInfo.webViewLink
          }
        : null,
      files
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des fichiers Drive :", error);
    return res.status(500).json({
      error: "Impossible de récupérer les fichiers Drive.",
      details: error.message,
      folder: folderInfo
        ? {
            id: folderInfo.id,
            webViewLink: folderInfo.webViewLink
          }
        : undefined
    });
  }
});

app.listen(PORT, () => {
  const clients = Array.from(CLIENT_FOLDERS.keys());
  console.log(`Miniads API prête sur le port ${PORT}`);
  if (clients.length) {
    console.log(`Clients configurés : ${clients.join(", ")}`);
  } else {
    console.warn("Aucun client configuré pour Drive (CLIENT_FOLDER_MAP ou CLIENT_FOLDER_*)");
  }
});
