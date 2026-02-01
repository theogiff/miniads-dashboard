export const config = {
    runtime: "nodejs"
};

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { stats, channelName, insights, topShorts, topLongVideos, recentVideos } = req.body;
        if (!process.env.MISTRAL_API_KEY) {
            return res.status(500).json({ error: "Clé API Mistral manquante" });
        }

        // --- CALCUL DES MÉTRIQUES AVANCÉES ---

        // 1. Ratio Vues/Abonnés (Viralité potentielle)
        const subCount = parseInt(stats.subscriberCount) || 1;
        const totalViews = parseInt(stats.viewCount) || 0;
        const videoCount = parseInt(stats.videoCount) || 1;

        const avgViewsGlobal = Math.round(totalViews / videoCount);
        const viralRatio = (avgViewsGlobal / subCount * 100).toFixed(1); // % des abonnés qui regardent en moyenne

        // 2. Score de Spécialisation (Shorts vs Longs)
        const shortsCount = stats.shortsCount || 0;
        const longCount = stats.longCount || 0;
        const totalRecent = shortsCount + longCount || 1;
        const shortsRatio = Math.round((shortsCount / totalRecent) * 100);
        const longRatio = Math.round((longCount / totalRecent) * 100);

        // 3. Score d'Engagement Relatif
        const shortsEng = parseFloat(stats.shortsEngagement) || 0;
        const longEng = parseFloat(stats.longEngagement) || 0;

        // Détermination du profil de la chaîne
        let channelProfile = "Hybride";
        if (shortsRatio > 80) channelProfile = "Focus Shorts";
        if (longRatio > 80) channelProfile = "Focus Longues";

        // Construction des listes détaillées pour l'IA
        const topShortsDetails = topShorts?.length
            ? topShorts.map((v, i) => `${i + 1}. "${v.title}" (${v.views} vues, ${v.engagementRate}% eng, ${v.durationFormatted})`).join('\n')
            : "Aucune donnée";

        const topLongDetails = topLongVideos?.length
            ? topLongVideos.map((v, i) => `${i + 1}. "${v.title}" (${v.views} vues, ${v.engagementRate}% eng, ${v.durationFormatted})`).join('\n')
            : "Aucune donnée";

        const recentVideosDetails = recentVideos?.length
            ? recentVideos.map((v, i) => `${i + 1}. "${v.title}" (${v.views} vues, ${v.engagementRate}% eng, ${v.durationFormatted}, ${v.isShort ? 'Short' : 'Long'})`).join('\n')
            : "Aucune donnée récente";

        // --- PROMPT ULTIME ---
        const prompt = `Agis comme le meilleur Consultant YouTube Stratège au monde (niveau MrBeast/Paddy Galloway). Tu es brutalement honnête, analytique et orienté résultats. Ta mission est d'auditer la chaîne "${channelName || 'Inconnue'}" pour exploser sa croissance.

═══════════════════════════════════════
💿 BASE DE DONNÉES ANALYTIQUE
═══════════════════════════════════════

👤 IDENTITÉ:
• Profil: ${channelProfile} (${shortsRatio}% Shorts / ${longRatio}% Longues)
• Abonnés: ${stats.subscriberCount?.toLocaleString()}
• Vues Totales: ${stats.viewCount?.toLocaleString()}
• Ratio Viralité (Vues/Subs): ${viralRatio}% (Moyenne industrielle: 10-20%)

📊 PERFORMANCE:
┌─ SHORTS
│  • Volume: ${shortsCount} vidéos
│  • Engagement: ${shortsEng}% (Moyenne: 3-5%)
│  • Vues Moyennes: ${stats.shortsAvgViews?.toLocaleString()}
└─ LONGUES
   • Volume: ${longCount} vidéos
   • Engagement: ${longEng}% (Moyenne: 2-4%)
   • Vues Moyennes: ${stats.longAvgViews?.toLocaleString()}

⚡ SIGNAUX DE TENDANCE:
• Tendance Actuelle: ${insights?.trend?.direction === 'up' ? '🟢 EN HAUSSE' : '🔴 EN BAISSE'} de ${insights?.trend?.percentage}%
• Durée "Sweet Spot": ${insights?.optimalDuration?.label} (${insights?.optimalDuration?.avgEngagement}% eng)
• Timing Idéal: ${insights?.bestPostingDay?.day} à ${insights?.bestPostingTime?.hourFormatted}

📅 10 DERNIÈRES VIDÉOS (Analyse de la Stratégie Actuelle):
${recentVideosDetails}

⭐ TOP PERFORMERS (Modèles à suivre):
Shorts:
${topShortsDetails}

Longues:
${topLongDetails}

═══════════════════════════════════════
📝 RAPPORT D'AUDIT STRATÉGIQUE (HTML)
═══════════════════════════════════════

Réponds UNIQUEMENT avec ce code HTML structuré. Sois direct. Pas de bla-bla.
NE FAIS PAS DE COMPARAISON DIRECTE ENTRE SHORTS ET FORMAT LONG DANS UNE SECTION DÉDIÉE (type "Bataille des Formats").

<div class="ai-audit-container">

  <h4>🚨 Diagnostic Vital</h4>
  <p>En 2 phrases percutantes : La chaîne est-elle en bonne santé ? Le ratio viralité de <strong>${viralRatio}%</strong> indique-t-il une audience captive ou fantôme ? Quel est le problème N°1 visible ?</p>

  <h4>🧬 Analyse ADN des Top Vidéos</h4>
  <p>Regarde les titres et stats des top vidéos ci-dessus. Décode la psychologie :
  Quels mots-clés ? Quelle émotion (Curiosité, Peur, Utilité) ? Quel type de miniature suggéré ?
  Trouve le "Pattern de Succès" unique de cette chaîne.</p>

  <h4>🎬 Stratégie de Contenu (Basé sur les 10 dernières vidéos)</h4>
  <p>Analyse la tendance des 10 dernières vidéos listées ci-dessus.
  Quels sujets fonctionnent ? Lesquels floppent ? Y a-t-il une cohérence ?
  Donne une critique constructive sur la ligne éditoriale récente et comment la pivoter pour plus de vues.</p>

  <h4>🚀 Plan d'Attaque (Next Steps)</h4>
  <ul class="ai-action-list">
    <li><strong>Le Hack Immédiat :</strong> Une action qui prend 5 min pour booster la prochaine vidéo.</li>
    <li><strong>La Vidéo à Faire Demain :</strong> (Titre précis + Concept) basé sur ce qui marche le mieux actuellement.</li>
    <li><strong>L'Objectif Chiffré :</strong> Viser X vues/video basé sur la tendance actuelle.</li>
  </ul>

</div>

Ton ton doit être : Expert, Datavore, Actionnable. Utilise des mots forts.`;

        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
            },
            body: JSON.stringify({
                model: "mistral-small-latest",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.5,
                max_tokens: 2500,
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
