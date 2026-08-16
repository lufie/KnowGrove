# KnowGrove privacy and data use

KnowGrove is local-first. Notes, properties, comments, references, generated drafts, and attachment history remain in the user's Obsidian vault unless the user explicitly runs an external AI provider or downloads a public runtime component.

## Network use

KnowGrove may access the network when the user enables or invokes these features:

- downloading signed runtime components from the documented CNB or GitHub release sources;
- extracting public web pages, subtitles, video, or audio selected by the user;
- sending selected note content to a user-configured CLI or API for AI processing;
- receiving a capture from the paired KnowGrove browser extension over `127.0.0.1`.

The plugin does not include client-side analytics or telemetry. It does not upload browser cookies, Obsidian secrets, payment information, or unrelated vault content to the publisher or a KnowGrove server. For protected media, a user may explicitly grant the extension access to the current site. Only cookies applicable to that current tab, its user agent, referer, and visible player URLs are sent to KnowGrove over `127.0.0.1`; they are written to a mode-`0600` temporary file for one task and deleted afterward. They are never persisted in extension storage, plugin settings, job records, logs, or the vault. API keys are stored with Obsidian SecretStorage when supported and are not written to `data.json`.

Some local CLIs and external APIs have their own privacy terms. Users should review the provider they choose before sending sensitive notes.

## Local files

Runtime components are stored in the operating system's application data directory rather than in the vault. Browser capture job state is stored inside the plugin's configuration directory. Uninstalling the plugin does not delete user notes or generated Markdown.

On macOS, users can explicitly install `~/Applications/KnowGrove Markdown Opener.app` and set it as the default handler for `.md` and `.markdown`. Its configuration stores only the selected vault path, import folder, enabled state, source-removal preference, and previous default app path under `~/Library/Application Support/KnowGrove/`. It reads only Markdown files the operating system sends to it and opens the imported note through Obsidian's URI protocol. Source removal is on by default: only after the vault copy has been written and verified is the external source moved to the macOS Trash, where it remains recoverable. Users can turn source removal off, disable the opener, or restore the previous default app from KnowGrove settings. Files already inside the configured vault are never removed by the source-removal setting.

KnowGrove uses direct filesystem access only for user-selected external audio or video, Markdown explicitly opened through the optional Mac opener, and its signed runtime components outside the vault. Normal note, property, reference, and attachment operations use Obsidian's Vault and FileManager APIs. Local AI and media executables are started with an explicit executable and argument list, without a command shell; the Mac opener uses a locally generated, narrowly scoped script only after the user installs it from settings.

Whole-vault enumeration is used only for workflows that inherently require a global result, such as a user-triggered property audit, topic index refresh, or full attachment check. Startup does not rebuild the attachment index. Clipboard reads or writes happen only in response to an explicit paste or copy action. Recording overlay position is kept only for the current Obsidian session and is not stored in browser local storage.

## Contact

Open a privacy or security issue in the KnowGrove GitHub repository. Do not include API keys, private notes, access tokens, or personal recordings in a public issue.
