export const config = {
    runtime: "nodejs"
};

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { question, channelContext } = req.body;

        if (!question) {
            return res.status(400).json({ error: "Question requise" });
        }

        if (!process.env.MISTRAL_API_KEY) {
            return res.status(500).json({ error: "Clé API Mistral manquante" });
        }

        const contextText = channelContext ? `
Contexte de la chaîne YouTube analysée:
- Nom: ${channelContext.title}
- Abonnés: ${channelContext.subscriberCount}
- Vues totales: ${channelContext.viewCount}
- Vidéos: ${channelContext.videoCount}
- Shorts: ${channelContext.shortsCount} vidéos (${channelContext.shortsEngagement}% engagement)
- Vidéos longues: ${channelContext.longCount} vidéos (${channelContext.longEngagement}% engagement)
- Durée optimale: ${channelContext.optimalDuration || 'N/A'}
- Meilleur horaire: ${channelContext.bestPostingTime || 'N/A'}
- Tendance: ${channelContext.trend || 'N/A'}
` : "";

        const prompt = `Tu es un expert en stratégie YouTube. ${contextText}

L'utilisateur te pose cette question: "${question}"

Réponds de manière concise, directe et personnalisée. Donne des conseils actionnables. 
Formate ta réponse en HTML simple (p, ul, li, strong) sans utiliser de titres h1/h2/h3.
Maximum 3-4 phrases.`;

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
                max_tokens: 500,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Mistral API Error:", errText);
            throw new Error("Erreur Mistral API");
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "Pas de réponse générée.";

        res.status(200).json({ answer: content });

    } catch (e) {
        console.error("Erreur API Chat:", e.message);
        res.status(500).json({ error: "Erreur lors de la réponse" });
    }
}
