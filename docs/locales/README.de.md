# KnowGrove

[English](https://github.com/lufie/KnowGrove/blob/main/README.md) · [简体中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-CN.md) · [繁體中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-TW.md) · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · [한국어](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ko.md) · **Deutsch** · [Français](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.fr.md) · [Español](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.es.md) · [Português (Brasil)](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.pt-BR.md) · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

KnowGrove ist ein lokaler Wissensworkflow für alle, die schneller sammeln als ordnen. Originalmaterial bleibt im Obsidian-Vault, wird strukturiert, mit Themen und Belegen verknüpft und in wiederverwendbare Ergebnisse verwandelt.

Aktuelle Quellcodeversion: `2.8.32`

## Ein Workflow von der Quelle zum Ergebnis

| Erfassen | Verarbeiten | Ordnen | Erstellen |
| --- | --- | --- | --- |
| Artikel, Links, lokale Audio-/Videodateien, Aufnahmen und Bilder speichern. | Webseiteninhalte extrahieren, Bilder in strukturiertes Markdown umwandeln und Audio/Video transkribieren. | Später lesen, Eigenschaften verwalten und Themen, Kommentare, Blockverweise und Belege verbinden. | Aus ausgewählten Quellen Gliederungen, Berichte, Langtexte und kanalbezogene Fassungen erstellen. |

Der Vault bleibt die maßgebliche Datenquelle. KnowGrove erfasst keine Client-Telemetrie; nur die von Ihnen gewählten lokalen Werkzeuge oder kompatiblen Anbieter verarbeiten die jeweiligen Inhalte.

## Hauptfunktionen

- **Später lesen:** Gemeinsamer Eingang, Filter für ungelesen/gelesen und optionales Markieren am Dokumentende.
- **Browser- und Mobil-Erfassung:** Artikel, Videos, Links und kurze Sprachnotizen im Vault speichern.
- **Inhaltsverarbeitung:** Artikelbilder bleiben erhalten; bei Videos werden Untertitel bevorzugt und nur ohne Untertitel lokal transkribiert.
- **KI-Bild zu Text:** Einzelne Bilder oder alle Bilder einer Notiz werden umgewandelt; Tabellen und strukturierter Text erscheinen unter dem Originalbild. Der Hintergrundprozess zeigt echte Phasen, lässt sich sicher abbrechen und führt direkt zum Ergebnis.
- **Word-ähnliche Live-Vorschau:** Überschriften, Listen, Aufgaben, Bilder, Codeblöcke und Tabellen bleiben formatiert editierbar. Beim Entfernen leerer Auswahlzeilen werden GFM-Tabellengrenzen erhalten oder repariert, damit Tabellen in Live-Vorschau und Leseansicht weiter gerendert werden.
- **Schnelle, wiederherstellbare Erfassung:** Vor der zeitaufwendigen Warteschlange wird eine sofort öffnbare minimale Markdown-Datei erstellt und zurückgelesen; KI- und Medienverarbeitung laufen im Hintergrund weiter.
- **Navigation in langen Dokumenten:** Anfang und Ende der Überschriftenliste bleiben erreichbar, die Dateiposition bleibt sichtbar und das Scrollen im Dokument wird nicht übernommen.
- **Eigenschaftsverwaltung:** Notizen folgen einem kompakten Standard aus Typ, Lebenszyklusstatus, Bereich, Thema und nachvollziehbaren Quelldaten; Migrationen werden geprüft, in der Vorschau bestätigt und überschreiben weder unbekannte Felder noch Benutzerinhalte.
- **Themen und Recherche:** Alle Themen und zugehörigen Quellen durchsuchen sowie Bereiche, Themen und Forschungsfragen strukturieren.
- **Kommentare und Blockverweise:** Markierten Text kommentieren und mit nativen Obsidian-Blockeinbettungen wiederverwenden.
- **Belegbasiertes Schreiben:** Aus ausgewählten Quellen Gliederungen, Berichte, Langtexte und kanalspezifische Fassungen erstellen.
- **Sichere Anlagenbereinigung:** Nur früher referenzierte Anlagen verfolgen und nach Bestätigung in den Obsidian-Papierkorb verschieben.

## Sprache und Daten

KnowGrove folgt der in Obsidian gewählten Sprache. Notiztitel, Pfade, Kommentare, Bereiche, Themen, Eigenschaftswerte, Frontmatter, Bases und Markdown-Inhalte werden weder übersetzt noch verändert.

## Installation

KnowGrove kann unter **Einstellungen → Community-Erweiterungen → Durchsuchen** gesucht und installiert werden.

Für die manuelle Installation laden Sie `main.js`, `manifest.json` und `styles.css` aus dem neuesten GitHub Release herunter und kopieren sie nach `<Vault>/.obsidian/plugins/knowgrove/`. Laden Sie Obsidian neu und aktivieren Sie KnowGrove. Kopieren Sie niemals die `data.json` einer anderen Person.

Weitere Informationen: [Datenschutz](../../PRIVACY.md), [Sicherheit](../../SECURITY.md), [MIT-Lizenz](../../LICENSE).
