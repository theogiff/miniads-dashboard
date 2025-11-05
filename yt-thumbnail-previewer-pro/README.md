# YT Thumbnail Previewer Pro

YT Thumbnail Previewer Pro est une extension Chrome (Manifest V3) permettant de prévisualiser une miniature personnalisée directement sur YouTube. Le panneau latéral vous aide à cibler les tuiles (home, recherche, chaîne, watch "Up next") sans toucher à l'API YouTube.

## Installation (mode développeur)

1. Téléchargez ou clonez ce dépôt sur votre machine.
2. Ouvrez `chrome://extensions` dans Chrome.
3. Activez le **Mode développeur**.
4. Cliquez sur **Charger l'extension non empaquetée**.
5. Sélectionnez le dossier `yt-thumbnail-previewer-pro`.

## Ouvrir YouTube en popup

- Cliquez sur l'icône de l'extension dans la barre d'outils.
- Utilisez le menu contextuel « Ouvrir le Visualisateur YouTube » de l'icône.
- Pressez le raccourci **Ctrl+Shift+Y**. Une fenêtre popup YouTube (1280×800) s'ouvre avec le Visualisateur actif.

## Utilisation du sidebar

- **Thumbnails** : Chargez une image locale (DataURL) ou indiquez une URL HTTPS. Une preview 16:9 s'affiche.
- **Modes Replace / Overlay** : remplacez totalement la vignette ou superposez-la avec réglage d'opacité.
- **Scope** : appliquez vos miniatures à toutes les tuiles éligibles ou uniquement à la première rangée.
- **Ciblage** : localisez une tuile visible au hasard, passez à la suivante, sélectionnez-la manuellement (un contour bleu apparaît 1 s) ou épinglez-la pour la retrouver après navigation.
- **Titles** : ajoutez des titres factices et choisissez celui à afficher dans un bloc metadata factice.
- **Chaîne mock** : saisissez un nom de chaîne, automatiquement affiché avec un avatar et des stats fictives.
- **Competition pills** : alternez entre « Your Video » et « Tendances » pour ajuster le style visuel.
- **Switch ON/OFF** : désactivez toutes les injections/observers instantanément.
- **Reset** : nettoie l'image, les titres, le canal mock, la portée, le pin et les métriques.

## Permissions & limites

- L'extension n'utilise aucune API YouTube : elle agit uniquement sur le DOM réel.
- Les miniatures natives ne sont jamais écrasées durablement (seules des superpositions sont utilisées).
- Chrome demande uniquement les permissions `storage`, `tabs` et l'accès à `https://www.youtube.com/*`.

## Tests manuels recommandés

- Vérifier que le sidebar apparaît automatiquement sur `youtube.com/*`, se réduit et mémorise son état.
- Importer une image locale et vérifier la preview 16:9.
- Tester l'URL HTTPS pour charger une miniature externe.
- Alterner Replace / Overlay et régler l'opacité (Overlay).
- Basculer le Scope sur « First row only » et observer que seules les premières tuiles changent.
- Utiliser Random localisation, Next random, Select manually (contour bleu) et Pin this tile.
- Ajouter plusieurs titres, définir un titre actif et vérifier le bloc metadata fictif.
- Changer le nom de chaîne et les pills « Your Video / Tendances ».
- Désactiver l'extension (Switch OFF) puis la réactiver.
- Cliquer sur l'icône, le menu ou utiliser Ctrl+Shift+Y pour ouvrir la popup YouTube avec le Visualisateur.
