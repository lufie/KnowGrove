# KnowGrove

[English](https://github.com/lufie/KnowGrove/blob/main/README.md) · [简体中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-CN.md) · [繁體中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-TW.md) · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · [한국어](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ko.md) · **Deutsch** · [Français](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.fr.md) · [Español](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.es.md) · [Português (Brasil)](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.pt-BR.md) · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

KnowGrove ist ein lokal ausgerichteter Wissensarbeitsbereich für Obsidian. Er verwandelt verstreute Materialien in verknüpfte Themen, Belege, Recherchen und wiederverwendbares Wissen.

Aktuelle Quellcodeversion: `2.8.29`

## Hauptfunktionen

- **Später lesen:** Gemeinsamer Eingang, Filter für ungelesen/gelesen und optionales Markieren am Dokumentende.
- **Browser- und Mobil-Erfassung:** Artikel, Videos, Links und kurze Sprachnotizen im Vault speichern.
- **Inhaltsverarbeitung:** Artikelbilder bleiben erhalten; bei Videos werden Untertitel bevorzugt und nur ohne Untertitel lokal transkribiert.
- **KI-Bild zu Text:** Einzelne Bilder oder alle Bilder einer Notiz werden umgewandelt; Tabellen und strukturierter Text erscheinen unter dem Originalbild. Der Hintergrundprozess zeigt echte Phasen, lässt sich sicher abbrechen und führt direkt zum Ergebnis.
- **Word-ähnliche Live-Vorschau:** Überschriften, Listen, Aufgaben, Bilder, Codeblöcke und Tabellen bleiben formatiert editierbar. Beim Entfernen leerer Auswahlzeilen werden GFM-Tabellengrenzen erhalten oder repariert, damit Tabellen in Live-Vorschau und Leseansicht weiter gerendert werden.
- **Schnelle, wiederherstellbare Erfassung:** Vor der zeitaufwendigen Warteschlange wird eine sofort öffnbare minimale Markdown-Datei erstellt und zurückgelesen; KI- und Medienverarbeitung laufen im Hintergrund weiter.
- **Navigation in langen Dokumenten:** Anfang und Ende der Überschriftenliste bleiben erreichbar, die Dateiposition bleibt sichtbar und das Scrollen im Dokument wird nicht übernommen.
- **Eigenschaftsverwaltung:** Vorgeschlagene Änderungen vorab prüfen und bestätigt stapelweise anwenden, ohne unbekannte Felder zu überschreiben.
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
