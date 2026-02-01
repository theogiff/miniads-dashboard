import { google } from "googleapis";

export const config = {
    runtime: "nodejs"
};

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

        // Find channel ID if not direct
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

        // Get channel stats
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

        // Get recent videos (last 20)
        let recentVideos = [];
        if (uploadsPlaylistId) {
            const playlistRes = await youtube.playlistItems.list({
                part: "snippet,contentDetails",
                playlistId: uploadsPlaylistId,
                maxResults: 20,
            });

            const videoIds = playlistRes.data.items?.map(item => item.contentDetails.videoId) || [];

            if (videoIds.length > 0) {
                const videosRes = await youtube.videos.list({
                    part: "snippet,statistics,contentDetails",
                    id: videoIds.join(","),
                });

                recentVideos = (videosRes.data.items || []).map(video => {
                    const vStats = video.statistics;
                    const views = parseInt(vStats.viewCount || "0", 10);
                    const likes = parseInt(vStats.likeCount || "0", 10);
                    const comments = parseInt(vStats.commentCount || "0", 10);
                    const engagementRate = views > 0 ? ((likes + comments) / views * 100).toFixed(2) : 0;

                    return {
                        id: video.id,
                        title: video.snippet.title,
                        thumbnail: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
                        publishedAt: video.snippet.publishedAt,
                        views,
                        likes,
                        comments,
                        engagementRate: parseFloat(engagementRate),
                        duration: video.contentDetails?.duration,
                    };
                });
            }
        }

        // Calculate averages
        const totalVideos = recentVideos.length;
        const avgViews = totalVideos > 0
            ? Math.round(recentVideos.reduce((sum, v) => sum + v.views, 0) / totalVideos)
            : 0;
        const avgEngagement = totalVideos > 0
            ? (recentVideos.reduce((sum, v) => sum + v.engagementRate, 0) / totalVideos).toFixed(2)
            : 0;

        // Top performers by engagement
        const topByEngagement = [...recentVideos]
            .sort((a, b) => b.engagementRate - a.engagementRate)
            .slice(0, 5);

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
            analytics: {
                avgViews,
                avgEngagement: parseFloat(avgEngagement),
                totalVideosAnalyzed: totalVideos,
            },
            recentVideos,
            topByEngagement,
        });

    } catch (e) {
        console.error("Erreur API YouTube:", e.message);
        res.status(500).json({ error: "Erreur lors de l'analyse YouTube: " + e.message });
    }
}
