# Miniads Dashboard

Dashboard client Miniads avec intégration sécurisée de Google Drive via Service Account.

## Prérequis
- Node.js 18+
- Un compte de service Google Drive avec accès lecture aux dossiers clients

## Installation
1. Copier `.env.example` vers `.env` et renseigner :
   - `GSA_CLIENT_EMAIL`
   - `GSA_PRIVATE_KEY` (conserver les `\n`)
   - Les dossiers Drive des clients via `CLIENT_FOLDER_MAP` ou `CLIENT_FOLDER_<SLUG>`
2. Installer les dépendances :
   ```bash
   npm install
   ```

## Démarrer l’API locale
```bash
npm run dev
```
L’API écoute par défaut sur `http://localhost:3000`.

### Endpoint
`GET /api/client/:clientId/files`

Retourne les fichiers Drive d’un client ordonnés par date de modification décroissante.

```json
{
  "folder": {
    "id": "...",
    "name": "...",
    "webViewLink": "https://drive.google.com/..."
  },
  "files": [
    {
      "id": "...",
      "name": "...",
      "mimeType": "image/png",
      "modifiedTime": "2024-05-01T10:24:00.000Z",
      "webViewLink": "https://drive.google.com/...",
      "webContentLink": "https://drive.google.com/...",
      "thumbnailLink": "https://lh3.googleusercontent.com/..."
    }
  ]
}
```

## Ajouter un nouveau client
1. Récupérer l’identifiant du dossier Drive.
2. Ajouter l’entrée correspondante :
   - soit dans `CLIENT_FOLDER_MAP` (JSON) :
     ```env
     CLIENT_FOLDER_MAP={"OSEILLETV":"drive-folder-id","NOUVEAUCLIENT":"autre-id"}
     ```
   - soit via une variable dédiée :
     ```env
     CLIENT_FOLDER_NOUVEAUCLIENT=drive-folder-id
     ```
3. Redémarrer le serveur si nécessaire.

Le paramètre d’URL `?client=<slug>` doit correspondre au slug configuré (`OSEILLETV`, `nouveauclient`, etc.).
