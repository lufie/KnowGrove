# KnowGrove

[English](https://github.com/lufie/KnowGrove/blob/main/README.md) · [简体中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-CN.md) · [繁體中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-TW.md) · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · [한국어](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ko.md) · [Deutsch](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.de.md) · **Français** · [Español](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.es.md) · [Português (Brasil)](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.pt-BR.md) · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

KnowGrove est un flux de connaissances local pour celles et ceux qui collectent plus vite qu’ils n’organisent. Les sources restent dans le coffre Obsidian, sont structurées, reliées aux sujets et aux preuves, puis transformées en résultats réutilisables.

Version actuelle du code source : `2.8.30`

## Un seul flux, de la source au résultat

| Capturer | Traiter | Organiser | Créer |
| --- | --- | --- | --- |
| Enregistrer articles, liens, fichiers audio/vidéo locaux, enregistrements et images. | Extraire le contenu Web, convertir les images en Markdown structuré et transcrire l’audio ou la vidéo. | Lire plus tard, gérer les propriétés et relier sujets, commentaires, blocs et preuves. | Produire plans, rapports, textes longs et variantes par canal à partir des sources choisies. |

Le coffre reste la source de vérité. KnowGrove ne collecte aucune télémétrie cliente ; seuls les outils locaux ou fournisseurs compatibles que vous choisissez traitent le contenu concerné.

## Fonctions principales

- **À lire plus tard :** une seule boîte de réception, filtres non lu/lu et marquage facultatif à la fin de la note.
- **Capture navigateur et mobile :** enregistrez articles, vidéos, liens et courtes notes vocales dans le coffre.
- **Traitement du contenu :** conserve les images des articles, privilégie les sous-titres vidéo et utilise la transcription locale seulement si nécessaire.
- **Image vers texte par IA :** convertissez une image ou toutes les images d’une note ; les tableaux et le texte structuré sont ajoutés sous l’image d’origine. Le traitement en arrière-plan affiche les étapes réelles, peut être annulé en toute sécurité et permet de localiser le résultat.
- **Édition en aperçu instantané comme dans Word :** conservez la mise en forme des titres, listes, tâches, images, blocs de code et tableaux. La suppression des lignes vides sélectionnées préserve ou répare les limites des tableaux GFM afin qu’ils restent rendus dans l’aperçu instantané et le mode lecture.
- **Capture rapide et récupérable :** une note Markdown minimale et ouvrable est créée puis relue avant l’entrée dans la file de traitement ; l’IA et les médias continuent en arrière-plan.
- **Navigation dans les longs documents :** le début et la fin de l’index restent accessibles, l’action de localisation du fichier reste visible et le défilement du document n’est pas intercepté.
- **Gestion des propriétés :** prévisualisez les propositions avant de les appliquer en lot, sans écraser les champs inconnus.
- **Sujets et recherche :** parcourez tous les sujets et leurs sources, puis organisez domaines, sujets et questions de recherche.
- **Commentaires et références de blocs :** commentez une sélection et réutilisez-la avec les inclusions de blocs natives d’Obsidian.
- **Rédaction fondée sur les sources :** créez plans, rapports, articles longs et variantes par canal.
- **Nettoyage sûr des pièces jointes :** suit uniquement les fichiers déjà référencés et demande confirmation avant leur déplacement dans la corbeille Obsidian.

## Langue et données

KnowGrove suit la langue d’Obsidian. Les titres, chemins, commentaires, domaines, sujets, valeurs de propriétés, frontmatter, Bases et contenus Markdown ne sont jamais traduits ni modifiés.

## Installation

Recherchez et installez KnowGrove dans **Réglages → Modules complémentaires → Parcourir**.

Pour une installation manuelle, téléchargez `main.js`, `manifest.json` et `styles.css` depuis la dernière version GitHub, copiez-les dans `<coffre>/.obsidian/plugins/knowgrove/`, rechargez Obsidian puis activez KnowGrove. Ne copiez jamais le fichier `data.json` d’une autre personne.

Consultez la [confidentialité](../../PRIVACY.md), la [sécurité](../../SECURITY.md) et la [licence MIT](../../LICENSE).
