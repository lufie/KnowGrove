# KnowGrove

> Grow scattered notes into connected topics, evidence, research, and reusable knowledge inside Obsidian.

[简体中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-CN.md) · [繁體中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-TW.md) · **English** · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · [한국어](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ko.md) · [Deutsch](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.de.md) · [Français](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.fr.md) · [Español](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.es.md) · [Português (Brasil)](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.pt-BR.md) · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

KnowGrove (言序 in Chinese) is a local-first knowledge workspace for Obsidian. It brings capture, reading, property management, topic research, block references, comments, and evidence-based writing into one workflow.

Current source version: `2.7.6`

## What KnowGrove does

- **Read it later:** collect notes in one inbox, switch between unread and read, and optionally mark a note as read when you reach the end.
- **Browser and mobile capture:** send articles, videos, links, and lightweight voice notes to your vault.
- **Content processing:** preserve article images, prefer video subtitles, and fall back to local audio transcription when subtitles are unavailable.
- **Property management:** audit note properties, preview suggested changes, and apply confirmed fixes in bulk without overwriting unknown fields.
- **Topics and research:** browse all topics, find related source notes, and organize domains, topics, and research questions.
- **Comments and block references:** comment on selected text and reuse a complete source block through native Obsidian block embeds.
- **Evidence-based creation:** turn selected source material into outlines, reports, long-form drafts, and channel-specific versions.
- **Safe attachment cleanup:** track attachments that were previously referenced and ask before moving an orphaned file to the Obsidian trash.

## Language support

KnowGrove follows the language selected in Obsidian. It supports Simplified Chinese, Traditional Chinese, English, Japanese, Korean, German, French, Spanish, Brazilian Portuguese, and Russian.

User content is never translated. Note titles, paths, comments, domains, topics, property values, frontmatter, Base files, and Markdown content stay exactly as stored in the vault. Text that has not yet completed native-language review falls back to English instead of Chinese.

## Installation

### Community plugins

KnowGrove is available in the Obsidian community directory:

1. Open **Settings → Community plugins** in Obsidian.
2. Select **Browse**, search for **KnowGrove**, and choose **Install**.
3. Enable KnowGrove and confirm the inbox folder in its settings.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release.
2. Create `<vault>/.obsidian/plugins/knowgrove/`.
3. Copy the three files into that folder.
4. Reload Obsidian and enable **KnowGrove** under Community plugins.

Never copy another user's `data.json` into your vault.

## First-run setup

1. Confirm the **Inbox folder** used by the reading list and capture workflows.
2. Choose a local CLI or compatible API if you want AI-assisted organization.
3. Use **Content processing components → Set up automatically** for local article, video, and audio processing.
4. Open **Reading list**, **Topics**, or **Workspace** from the Obsidian ribbon.

KnowGrove prefers compatible tools already installed on the computer. Missing signed runtime components can be installed for macOS Apple Silicon, macOS Intel, and Windows x64. Desktop-only processing features are guarded so the plugin can still load on mobile.

## Browser capture

The browser extension submits the current page to the local KnowGrove receiver:

```text
Chrome / Safari
  → KnowGrove local receiver
  → article extraction or subtitle / local transcription
  → the AI provider selected by the user
  → Obsidian vault
```

The local receiver listens only on `127.0.0.1:47831` and requires confirmation in Obsidian before pairing. Browser extension source and setup notes are in [言序浏览器一键入库](言序浏览器一键入库/README.md).

## Privacy and safety

- The vault remains the source of truth.
- Existing note values and unknown properties are preserved by default.
- Batch property changes require preview and confirmation.
- The plugin has no client telemetry or usage analytics.
- API keys use Obsidian SecretStorage when available.
- Local CLIs run without a shell and in isolated temporary directories.
- KnowGrove does not bypass paywalls, login restrictions, DRM, or platform permissions.
- Attachment cleanup moves confirmed candidates to the Obsidian trash; it does not permanently delete them.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for the complete boundaries.

## Development

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

The production build creates `main.js` in the repository root. Release tags must match `manifest.json` exactly and must not use a `v` prefix.

## Release status

The source code is public, and version `2.7.5` is available through GitHub Releases and the Obsidian community directory. The directory entry has not yet been manually reviewed by Obsidian staff. Current review status is tracked in [docs/COMMUNITY_PLUGIN_RELEASE.md](https://github.com/lufie/KnowGrove/blob/main/docs/COMMUNITY_PLUGIN_RELEASE.md).

## License

[MIT](LICENSE)
