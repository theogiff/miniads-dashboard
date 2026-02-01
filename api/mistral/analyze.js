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

        // Calculate derived metrics
        const viewsPerVideo = stats.videoCount > 0 ? Math.round(stats.viewCount / stats.videoCount) : 0;
        const viewsPerSub = stats.subscriberCount > 0 ? (stats.viewCount / stats.subscriberCount).toFixed(1) : 0;

        const shortsVsLongEngagementDiff = stats.shortsEngagement && stats.longEngagement
            ? (stats.shortsEngagement - stats.longEngagement).toFixed(1)
            : null;

        const formatWinner = shortsVsLongEngagementDiff !== null
            ? (parseFloat(shortsVsLongEngagementDiff) > 0 ? 'Shorts' : 'Vidéos longues')
            : 'Inconnu';

        const topShortsDetails = topShorts?.length
            ? topShorts.map(v => `- "${v.title}" : ${v.views} vues, ${v.engagementRate}% engagement, durée: ${v.durationFormatted}`).join('\n')
            : "Aucun Short analysé";

        const topLongDetails = topLongVideos?.length
            ? topLongVideos.map(v => `- "${v.title}" : ${v.views} vues, ${v.engagementRate}% engagement, durée: ${v.durationFormatted}`).join('\n')
            : "Aucune vidéo longue analysée";

        const prompt = `Tu es un consultant expert en croissance YouTube avec 10 ans d'expérience. Tu dois fournir une analyse TRÈS DÉTAILLÉE et SPÉCIFIQUE basée uniquement sur les données fournies. Évite les conseils génériques.

═══════════════════════════════════════
DONNÉES DE LA CHAÎNE: ${channelName || 'Inconnue'}
═══════════════════════════════════════

📊 MÉTRIQUES PRINCIPALES:
• Abonnés: ${stats.subscriberCount?.toLocaleString() || 0}
• Vues totales: ${stats.viewCount?.toLocaleString() || 0}
• Vidéos publiées: ${stats.videoCount || 0}
• Vues moyennes par vidéo: ${viewsPerVideo?.toLocaleString() || 0}
• Ratio vues/abonnés: ${viewsPerSub}x

📹 PERFORMANCE PAR FORMAT:
┌─ SHORTS (≤60s)
│  • Quantité: ${stats.shortsCount || 0} vidéos
│  • Engagement moyen: ${stats.shortsEngagement || 'N/A'}%
│  • Vues moyennes: ${stats.shortsAvgViews?.toLocaleString() || 'N/A'}
└─ VIDÉOS LONGUES
   • Quantité: ${stats.longCount || 0} vidéos
   • Engagement moyen: ${stats.longEngagement || 'N/A'}%
   • Vues moyennes: ${stats.longAvgViews?.toLocaleString() || 'N/A'}

🏆 FORMAT GAGNANT: ${formatWinner} (${shortsVsLongEngagementDiff !== null ? `différence de ${Math.abs(shortsVsLongEngagementDiff)}% d'engagement` : 'données insuffisantes'})

⏱️ ANALYSE DE DURÉE OPTIMALE:
• Durée la plus performante: ${insights?.optimalDuration?.label || 'Non déterminé'}
• Engagement pour cette durée: ${insights?.optimalDuration?.avgEngagement || 'N/A'}%
• Nombre de vidéos analysées: ${insights?.optimalDuration?.count || 0}

📅 TIMING DE PUBLICATION:
• Meilleur horaire: ${insights?.bestPostingTime?.hourFormatted || 'Non déterminé'} (${insights?.bestPostingTime?.avgEngagement || 'N/A'}% engagement)
• Meilleur jour: ${insights?.bestPostingDay?.day || 'Non déterminé'} (${insights?.bestPostingDay?.avgEngagement || 'N/A'}% engagement)

📈 TENDANCE DE CROISSANCE:
• Direction: ${insights?.trend?.direction === 'up' ? 'HAUSSE' : 'BAISSE'}
• Variation: ${insights?.trend?.percentage > 0 ? '+' : ''}${insights?.trend?.percentage || 0}%
• Basé sur: Comparaison des 10 dernières vidéos vs les 10 précédentes

🎯 TOP SHORTS ANALYSÉS:
${topShortsDetails}

🎬 TOP VIDÉOS LONGUES ANALYSÉES:
${topLongDetails}

═══════════════════════════════════════
INSTRUCTIONS D'ANALYSE
═══════════════════════════════════════

Réponds en HTML avec les sections suivantes. Sois TRÈS PRÉCIS avec des chiffres et des comparaisons. PAS de conseils vagues ou génériques.

<h4>Diagnostic de la chaîne</h4>
<p>Analyse l'état de santé de la chaîne en 4-5 phrases. Mentionne:
- Le ratio vues/abonnés (${viewsPerSub}x) et ce que ça signifie (bon: >30x, moyen: 10-30x, faible: <10x)
- La croissance actuelle (${insights?.trend?.percentage}%)
- Les forces et faiblesses spécifiques basées sur les données</p>

<h4>Analyse Shorts vs Vidéos longues</h4>
<p>Compare en détail les deux formats avec les chiffres exacts. Explique pourquoi ${formatWinner} performe mieux. Donne une recommandation de ratio (ex: "70% Shorts, 30% Long" avec justification basée sur les données).</p>

<h4>Optimisation de la durée</h4>
<p>Basé sur la durée optimale de ${insights?.optimalDuration?.label || 'N/A'}, explique pourquoi cette durée fonctionne. Donne des conseils concrets pour structurer les vidéos de cette durée (hook, contenu, call-to-action).</p>

<h4>Stratégie de publication</h4>
<p>Basé sur les données (meilleur horaire: ${insights?.bestPostingTime?.hourFormatted || 'N/A'}, meilleur jour: ${insights?.bestPostingDay?.day || 'N/A'}), crée un calendrier de publication précis. Explique pourquoi ces moments fonctionnent (lié au type d'audience probable).</p>

<h4>Analyse des top vidéos</h4>
<p>Analyse les points communs des vidéos les plus performantes. Qu'est-ce qui fait leur succès ? Titre, format, durée, sujet ? Identifie les patterns à reproduire.</p>

<h4>Plan d'action immédiat</h4>
<p>Donne exactement 5 actions ULTRA-SPÉCIFIQUES avec des chiffres:
<ul>
<li><strong>Cette semaine:</strong> [action spécifique basée sur les données]</li>
<li><strong>Ce mois:</strong> [objectif chiffré réaliste basé sur la tendance actuelle]</li>
<li><strong>Format à prioriser:</strong> [avec ratio précis]</li>
<li><strong>Durée cible:</strong> [durée exacte]</li>
<li><strong>Expérimentation:</strong> [test A/B suggéré basé sur les patterns observés]</li>
</ul>
</p>

Utilise <strong> pour les données importantes. Sois direct et professionnel.`;

        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
            },
            body: JSON.stringify({
                model: "mistral-small-latest",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.6,
                max_tokens: 3000,
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

