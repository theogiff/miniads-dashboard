export const config = {
    runtime: "nodejs"
};

export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { stats, channelName } = req.body;
        if (!process.env.MISTRAL_API_KEY) {
            return res.status(500).json({ error: "Clé API Mistral manquante" });
        }

        // Prompt simple
        const prompt = `
    Tu es un expert en stratégie YouTube. Analyse les statistiques suivantes pour la chaîne "${channelName || 'Inconnue'}":
    - Abonnés: ${stats.subscriberCount}
    - Vues totales: ${stats.viewCount}
    - Nombre de vidéos: ${stats.videoCount}
    - Description: ${stats.description ? stats.description.slice(0, 300) + '...' : 'Aucune'}

    Donne-moi 3 conseils courts, percutants et personnalisés pour améliorer cette chaîne, et une courte analyse de son état actuel (en 2 phrases). 
    Format HTML simple (utilise <p>, <ul>, <li>, <strong>). Reste bienveillant mais direct.
    `;

        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
            },
            body: JSON.stringify({
                model: "mistral-tiny",
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
