import { google } from "googleapis";

export const config = {
    runtime: "nodejs"
};

export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: "URL requise" });

        // 1. Extraire l'ID ou le handle
        let channelId = null;

        const u = new URL(url);
        const path = u.pathname;

        if (path.startsWith("/channel/")) {
            channelId = path.split("/")[2];
        }

        const youtube = google.youtube({
            version: "v3",
            auth: process.env.YOUTUBE_API_KEY,
        });

        if (!channelId) {
            // Recherche l'ID via search
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

        res.status(200).json({
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
        res.status(500).json({ error: "Erreur lors de l'analyse YouTube" });
    }
}
