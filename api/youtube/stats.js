import { google } from "googleapis";

export const config = {
    runtime: "nodejs"
};

// Parse ISO 8601 duration to seconds
function parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || 0, 10);
    const minutes = parseInt(match[2] || 0, 10);
    const seconds = parseInt(match[3] || 0, 10);
    return hours * 3600 + minutes * 60 + seconds;
}

// Format duration in human readable
function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
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

        // Get recent videos (last 50 for better analysis)
        let allVideos = [];
        if (uploadsPlaylistId) {
            const playlistRes = await youtube.playlistItems.list({
                part: "snippet,contentDetails",
                playlistId: uploadsPlaylistId,
                maxResults: 50,
            });

            const videoIds = playlistRes.data.items?.map(item => item.contentDetails.videoId) || [];

            if (videoIds.length > 0) {
                const videosRes = await youtube.videos.list({
                    part: "snippet,statistics,contentDetails",
                    id: videoIds.join(","),
                });

                allVideos = (videosRes.data.items || []).map(video => {
                    const vStats = video.statistics;
                    const views = parseInt(vStats.viewCount || "0", 10);
                    const likes = parseInt(vStats.likeCount || "0", 10);
                    const comments = parseInt(vStats.commentCount || "0", 10);
                    const engagementRate = views > 0 ? ((likes + comments) / views * 100) : 0;
                    const durationSeconds = parseDuration(video.contentDetails?.duration);
                    const publishedAt = new Date(video.snippet.publishedAt);

                    return {
                        id: video.id,
                        title: video.snippet.title,
                        thumbnail: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
                        publishedAt: video.snippet.publishedAt,
                        publishHour: publishedAt.getUTCHours(),
                        publishDay: publishedAt.toLocaleDateString('fr-FR', { weekday: 'long' }),
                        publishMonth: publishedAt.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
                        views,
                        likes,
                        comments,
                        engagementRate: parseFloat(engagementRate.toFixed(2)),
                        durationSeconds,
                        durationFormatted: formatDuration(durationSeconds),
                        isShort: durationSeconds <= 60, // YouTube Shorts are <= 60 seconds
                    };
                });
            }
        }

        // Separate Shorts and Long videos
        const shorts = allVideos.filter(v => v.isShort);
        const longVideos = allVideos.filter(v => !v.isShort);

        // Calculate averages for each format
        const calcStats = (videos) => {
            if (videos.length === 0) return { avgViews: 0, avgEngagement: 0, count: 0 };
            return {
                avgViews: Math.round(videos.reduce((sum, v) => sum + v.views, 0) / videos.length),
                avgEngagement: parseFloat((videos.reduce((sum, v) => sum + v.engagementRate, 0) / videos.length).toFixed(2)),
                count: videos.length,
            };
        };

        const shortsStats = calcStats(shorts);
        const longStats = calcStats(longVideos);
        const globalStats = calcStats(allVideos);

        // Top performers by engagement for each format
        const topShorts = [...shorts].sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5);
        const topLongVideos = [...longVideos].sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5);

        // Monthly performance data
        const monthlyData = {};
        allVideos.forEach(v => {
            if (!monthlyData[v.publishMonth]) {
                monthlyData[v.publishMonth] = { views: 0, engagement: 0, count: 0 };
            }
            monthlyData[v.publishMonth].views += v.views;
            monthlyData[v.publishMonth].engagement += v.engagementRate;
            monthlyData[v.publishMonth].count++;
        });

        const monthlyPerformance = Object.entries(monthlyData)
            .map(([month, data]) => ({
                month,
                totalViews: data.views,
                avgEngagement: parseFloat((data.engagement / data.count).toFixed(2)),
                videoCount: data.count,
            }))
            .reverse(); // Most recent first

        // Optimal duration analysis
        const durationBuckets = {
            "0-1min": { videos: [], label: "Shorts (0-1min)" },
            "1-5min": { videos: [], label: "Court (1-5min)" },
            "5-10min": { videos: [], label: "Moyen (5-10min)" },
            "10-20min": { videos: [], label: "Long (10-20min)" },
            "20min+": { videos: [], label: "Très long (20min+)" },
        };

        allVideos.forEach(v => {
            if (v.durationSeconds <= 60) durationBuckets["0-1min"].videos.push(v);
            else if (v.durationSeconds <= 300) durationBuckets["1-5min"].videos.push(v);
            else if (v.durationSeconds <= 600) durationBuckets["5-10min"].videos.push(v);
            else if (v.durationSeconds <= 1200) durationBuckets["10-20min"].videos.push(v);
            else durationBuckets["20min+"].videos.push(v);
        });

        const durationInsights = Object.entries(durationBuckets)
            .filter(([_, data]) => data.videos.length > 0)
            .map(([key, data]) => ({
                bucket: key,
                label: data.label,
                count: data.videos.length,
                avgEngagement: parseFloat((data.videos.reduce((sum, v) => sum + v.engagementRate, 0) / data.videos.length).toFixed(2)),
                avgViews: Math.round(data.videos.reduce((sum, v) => sum + v.views, 0) / data.videos.length),
            }))
            .sort((a, b) => b.avgEngagement - a.avgEngagement);

        const optimalDuration = durationInsights[0] || null;

        // Best posting time analysis
        const hourBuckets = {};
        allVideos.forEach(v => {
            const hour = v.publishHour;
            if (!hourBuckets[hour]) hourBuckets[hour] = { engagement: 0, count: 0 };
            hourBuckets[hour].engagement += v.engagementRate;
            hourBuckets[hour].count++;
        });

        const postingTimeInsights = Object.entries(hourBuckets)
            .map(([hour, data]) => ({
                hour: parseInt(hour, 10),
                hourFormatted: `${hour}h`,
                avgEngagement: parseFloat((data.engagement / data.count).toFixed(2)),
                videoCount: data.count,
            }))
            .sort((a, b) => b.avgEngagement - a.avgEngagement);

        const bestPostingTime = postingTimeInsights[0] || null;

        // Day of week analysis
        const dayBuckets = {};
        allVideos.forEach(v => {
            if (!dayBuckets[v.publishDay]) dayBuckets[v.publishDay] = { engagement: 0, count: 0 };
            dayBuckets[v.publishDay].engagement += v.engagementRate;
            dayBuckets[v.publishDay].count++;
        });

        const postingDayInsights = Object.entries(dayBuckets)
            .map(([day, data]) => ({
                day,
                avgEngagement: parseFloat((data.engagement / data.count).toFixed(2)),
                videoCount: data.count,
            }))
            .sort((a, b) => b.avgEngagement - a.avgEngagement);

        const bestPostingDay = postingDayInsights[0] || null;

        // Channel trend (comparing recent vs older videos)
        const halfPoint = Math.floor(allVideos.length / 2);
        const recentVideos = allVideos.slice(0, halfPoint);
        const olderVideos = allVideos.slice(halfPoint);

        const recentAvgEngagement = recentVideos.length > 0
            ? recentVideos.reduce((sum, v) => sum + v.engagementRate, 0) / recentVideos.length
            : 0;
        const olderAvgEngagement = olderVideos.length > 0
            ? olderVideos.reduce((sum, v) => sum + v.engagementRate, 0) / olderVideos.length
            : 0;

        const trendDirection = recentAvgEngagement > olderAvgEngagement ? "up" : "down";
        const trendPercentage = olderAvgEngagement > 0
            ? parseFloat((((recentAvgEngagement - olderAvgEngagement) / olderAvgEngagement) * 100).toFixed(1))
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
            analytics: {
                global: globalStats,
                shorts: shortsStats,
                longVideos: longStats,
                totalVideosAnalyzed: allVideos.length,
            },
            recentVideos: allVideos.slice(0, 15).map(v => ({
                title: v.title,
                views: v.views,
                engagementRate: v.engagementRate,
                durationFormatted: v.durationFormatted,
                isShort: v.isShort
            })),
            topShorts,
            topLongVideos,
            monthlyPerformance,
            insights: {
                optimalDuration,
                durationInsights,
                bestPostingTime,
                postingTimeInsights: postingTimeInsights.slice(0, 5),
                bestPostingDay,
                postingDayInsights,
                trend: {
                    direction: trendDirection,
                    percentage: trendPercentage,
                    recentAvgEngagement: parseFloat(recentAvgEngagement.toFixed(2)),
                    olderAvgEngagement: parseFloat(olderAvgEngagement.toFixed(2)),
                },
            },
        });

    } catch (e) {
        console.error("Erreur API YouTube:", e.message);
        res.status(500).json({ error: "Erreur lors de l'analyse YouTube: " + e.message });
    }
}
