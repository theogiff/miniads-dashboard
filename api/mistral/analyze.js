export const config = {
    runtime: "nodejs"
};

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { stats, channelName, topVideos } = req.body;
        if (!process.env.MISTRAL_API_KEY) {
            return res.status(500).json({ error: "Clé API Mistral manquante" });
        }

        const topVideosText = topVideos?.length
            ? `Top vidéos par engagement: ${topVideos.join(", ")}`
            : "";

        const prompt = `
Tu es un expert en stratégie YouTube. Analyse les statistiques suivantes pour la chaîne "${channelName || 'Inconnue'}":

**Statistiques globales:**
- Abonnés: ${stats.subscriberCount}
- Vues totales: ${stats.viewCount}
- Nombre de vidéos: ${stats.videoCount}
- Vues moyennes par vidéo: ${stats.avgViews || 'N/A'}
- Taux d'engagement moyen: ${stats.avgEngagement || 'N/A'}%

${topVideosText}

**Ta mission:**
1. Donne une analyse courte de l'état actuel de la chaîne (2-3 phrases).
2. Identifie les points forts basés sur les statistiques.
3. Donne 3 conseils percutants et personnalisés pour améliorer la chaîne, en tenant compte du taux d'engagement.
4. Si possible, suggère un type de format/contenu qui pourrait mieux fonctionner.

Format ta réponse en HTML simple (utilise <h4>, <p>, <ul>, <li>, <strong>). Sois bienveillant mais direct.
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
