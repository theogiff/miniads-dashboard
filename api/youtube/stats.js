import { google } from "googleapis";

export const config = {
    runtime: "nodejs"
};

function parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    return parseInt(match[1] || 0, 10) * 3600 + parseInt(match[2] || 0, 10) * 60 + parseInt(match[3] || 0, 10);
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function median(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: "URL requise" });

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

        const channelRes = await youtube.channels.list({
            part: "snippet,statistics,contentDetails",
            id: channelId,
        });

        if (!channelRes.data.items?.length) {
            return res.status(404).json({ error: "Détails de la chaîne introuvables" });
        }

        const channel = channelRes.data.items[0];
        const snippet = channel.snippet;
        const stats = channel.statistics;
        const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;

        // Paginate to get all videos (max 500 = 10 pages)
        let allVideoIds = [];
        if (uploadsPlaylistId) {
            let nextPageToken = undefined;
            for (let page = 0; page < 3; page++) {
                const playlistRes = await youtube.playlistItems.list({
                    part: "contentDetails",
                    playlistId: uploadsPlaylistId,
                    maxResults: 50,
                    pageToken: nextPageToken,
                });
                const ids = playlistRes.data.items?.map(item => item.contentDetails.videoId) || [];
                allVideoIds.push(...ids);
                nextPageToken = playlistRes.data.nextPageToken;
                if (!nextPageToken) break;
            }
        }

        // Fetch video details in batches of 50
        let allVideos = [];
        for (let i = 0; i < allVideoIds.length; i += 50) {
            const batch = allVideoIds.slice(i, i + 50);
            const videosRes = await youtube.videos.list({
                part: "snippet,statistics,contentDetails",
                id: batch.join(","),
            });

            const videos = (videosRes.data.items || []).map(video => {
                const vStats = video.statistics;
                const views = parseInt(vStats.viewCount || "0", 10);
                const likes = parseInt(vStats.likeCount || "0", 10);
                const comments = parseInt(vStats.commentCount || "0", 10);
                const engagementRate = views > 0 ? ((likes + comments) / views * 100) : 0;
                const durationSeconds = parseDuration(video.contentDetails?.duration);

                return {
                    id: video.id,
                    title: video.snippet.title,
                    thumbnail: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
                    publishedAt: video.snippet.publishedAt,
                    views,
                    likes,
                    comments,
                    engagementRate: parseFloat(engagementRate.toFixed(2)),
                    durationSeconds,
                    durationFormatted: formatDuration(durationSeconds),
                    isShort: durationSeconds <= 60,
                };
            });
            allVideos.push(...videos);
        }

        const longVideos = allVideos.filter(v => !v.isShort);
        const longViews = longVideos.map(v => v.views);
        const totalLongViews = longViews.reduce((s, v) => s + v, 0);
        const avgViews = longVideos.length > 0 ? Math.round(totalLongViews / longVideos.length) : 0;
        const medianViews = median(longViews);
        const avgEngagement = longVideos.length > 0
            ? parseFloat((longVideos.reduce((s, v) => s + v.engagementRate, 0) / longVideos.length).toFixed(2))
            : 0;

        res.status(200).json({
            channel: {
                title: snippet.title,
                description: snippet.description,
                customUrl: snippet.customUrl,
                thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
                subscriberCount: parseInt(stats.subscriberCount || "0", 10),
                viewCount: parseInt(stats.viewCount || "0", 10),
                videoCount: parseInt(stats.videoCount || "0", 10),
            },
            kpis: {
                subscribers: parseInt(stats.subscriberCount || "0", 10),
                videoCountLong: longVideos.length,
                totalViews: totalLongViews,
                avgViews,
                avgEngagement,
                medianViews,
            },
            allVideos: longVideos.map(v => ({
                id: v.id,
                title: v.title,
                thumbnail: v.thumbnail,
                publishedAt: v.publishedAt,
                views: v.views,
                likes: v.likes,
                comments: v.comments,
                engagementRate: v.engagementRate,
                durationSeconds: v.durationSeconds,
                durationFormatted: v.durationFormatted,
            })),
        });

    } catch (e) {
        console.error("Erreur API YouTube:", e.message);
        res.status(500).json({ error: "Erreur lors de l'analyse YouTube: " + e.message });
    }
}
