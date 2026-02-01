export const config = {
    runtime: "nodejs"
};

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { stats, channelName, insights, topShorts, topLongVideos } = req.body;
        if (!process.env.MISTRAL_API_KEY) {
            return res.status(500).json({ error: "Clé API Mistral manquante" });
        }

        const topShortsText = topShorts?.length
            ? `Top Shorts: ${topShorts.map(v => `"${v.title}" (${v.engagementRate}%)`).join(", ")}`
            : "Pas de Shorts analysés";

        const topLongText = topLongVideos?.length
            ? `Top Vidéos longues: ${topLongVideos.map(v => `"${v.title}" (${v.engagementRate}%)`).join(", ")}`
            : "Pas de vidéos longues analysées";

        const prompt = `
Tu es un expert en stratégie YouTube et créateur de contenu. Analyse en profondeur les statistiques suivantes pour la chaîne "${channelName || 'Inconnue'}":

## STATISTIQUES GLOBALES
- Abonnés: ${stats.subscriberCount}
- Vues totales: ${stats.viewCount}
- Nombre total de vidéos: ${stats.videoCount}

## PERFORMANCE PAR FORMAT
- Shorts (≤60s): ${stats.shortsCount || 0} vidéos, engagement moyen: ${stats.shortsEngagement || 'N/A'}%, vues moyennes: ${stats.shortsAvgViews || 'N/A'}
- Vidéos longues: ${stats.longCount || 0} vidéos, engagement moyen: ${stats.longEngagement || 'N/A'}%, vues moyennes: ${stats.longAvgViews || 'N/A'}

## INSIGHTS CLÉS
- Durée optimale identifiée: ${insights?.optimalDuration?.label || 'N/A'} (${insights?.optimalDuration?.avgEngagement || 'N/A'}% engagement)
- Meilleur horaire de publication: ${insights?.bestPostingTime?.hourFormatted || 'N/A'} (${insights?.bestPostingTime?.avgEngagement || 'N/A'}% engagement)
- Meilleur jour: ${insights?.bestPostingDay?.day || 'N/A'}
- Tendance de la chaîne: ${insights?.trend?.direction === 'up' ? '📈 En hausse' : '📉 En baisse'} (${insights?.trend?.percentage > 0 ? '+' : ''}${insights?.trend?.percentage || 0}%)

## TOP CONTENUS
${topShortsText}
${topLongText}

---

## TA MISSION (réponds en HTML):

<h4>📊 Analyse de la chaîne</h4>
Donne une analyse détaillée de l'état actuel de la chaîne en 3-4 phrases. Quels sont ses points forts ? Ses faiblesses ?

<h4>🎬 Stratégie de format</h4>
Compare la performance des Shorts vs Vidéos longues. Lequel fonctionne le mieux ? Doit-il se concentrer sur un format particulier ?

<h4>⏱️ Durée optimale</h4>
Basé sur les données de durée, quelle est la durée idéale de vidéo pour cette chaîne ? Pourquoi ?

<h4>📅 Meilleurs moments pour poster</h4>
Analyse les horaires et jours qui performent le mieux. Donne des recommandations précises.

<h4>📈 Tendance et prédictions</h4>
La chaîne est-elle en croissance ou déclin ? Que doit faire le créateur pour inverser ou maintenir la tendance ?

<h4>💡 3 Actions concrètes</h4>
Donne 3 conseils TRÈS SPÉCIFIQUES et actionnables que le créateur peut appliquer immédiatement.

Format ta réponse en HTML simple (h4, p, ul, li, strong). Sois direct, percutant, et basé sur les données.
`;

        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
            },
            body: JSON.stringify({
                model: "mistral-small-latest",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 2000,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Mistral API Error:", errText);
            throw new Error("Erreur Mistral API");
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "Pas de réponse générée.";

        res.status(200).json({ analysis: content });

    } catch (e) {
        console.error("Erreur API Mistral:", e.message);
        res.status(500).json({ error: "Erreur lors de l'analyse IA" });
    }
}
