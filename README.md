# KnowGrove

> Grow scattered notes into connected topics, evidence, research, and reusable knowledge inside Obsidian.

[简体中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-CN.md) · [繁體中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-TW.md) · **English** · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · [한국어](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ko.md) · [Deutsch](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.de.md) · [Français](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.fr.md) · [Español](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.es.md) · [Português (Brasil)](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.pt-BR.md) · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

KnowGrove (言续 in Chinese) is a local-first knowledge workspace for Obsidian. It brings capture, reading, property management, topic research, block references, comments, and evidence-based writing into one workflow.

Current source release candidate: `2.8.28`. Obsidian community updates follow the matching GitHub release.

## What KnowGrove does

- **Read it later:** collect notes in one inbox, switch between unread and read, and optionally mark a note as read when you reach the end.
- **Browser and mobile capture:** send articles, videos, links, and lightweight voice notes to your vault.
- **Mac link capture and recording:** use separate ribbon actions to save one or many links as individual notes, record audio into crash-recoverable local segments, or drop existing local audio and video files into the recorder workspace for background transcription and processing; every saved result includes a direct note shortcut.
- **Open external Markdown on Mac:** enabled by default with a configurable vault import folder. After installing the KnowGrove Markdown opener and completing macOS's one-time **Get Info → Open with → Change All** confirmation, double-clicking `.md` or `.markdown` imports it and opens the note in Obsidian. By default, the external source moves to the macOS Trash only after the vault copy is written and verified; turn off source removal to keep both copies. Files already inside the vault are never removed by this setting, and the previous default app can be restored through the same system flow.
- **Content processing:** preserve article images, prefer video subtitles, and fall back to local audio transcription when subtitles are unavailable. Audio and video transcripts keep the language actually spoken, while generated summaries and analysis follow the local system language.
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
4. Open **Capture**, **Reading list**, **Topics**, or **Workspace** from the Obsidian ribbon.

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

The local receiver listens only on `127.0.0.1:47831` and requires confirmation in Obsidian before pairing. The companion browser extension is distributed and versioned separately; its closed-source implementation is maintained outside this public Obsidian plugin repository.

## Privacy and safety

- The vault remains the source of truth.
- Existing note values and unknown properties are preserved by default.
- Batch property changes require preview and confirmation.
- The plugin has no client telemetry or usage analytics.
- API keys use Obsidian SecretStorage when available.
- Local CLIs run without a shell and in isolated temporary directories.
- Local process execution is limited to the provider or media tools selected by the user; executable arguments are passed directly rather than through a command shell.
- Direct filesystem access is limited to user-selected external media, external Markdown explicitly opened with the optional Mac opener, and KnowGrove runtime files outside the vault. Normal note writes use Obsidian's Vault APIs.
- Whole-vault enumeration is reserved for explicit property, topic, or attachment checks. Attachment checks do not rebuild the vault index at startup.
- Clipboard access occurs only after a user clicks a copy action.
- KnowGrove does not bypass paywalls, login restrictions, DRM, or platform permissions.
- The separately distributed browser extension and desktop application are closed-source companion products. This public release mirror contains the complete reviewed source for each published Obsidian Plugin version and its local bridge contract, but not those companion implementations or the private total PRD.
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

The source code is public, and version `2.8.28` is the current local release candidate. Distribution requires the matching reviewed export and [GitHub Release](https://github.com/lufie/KnowGrove/releases); Obsidian community updates follow only after the catalog refreshes. Current review status is tracked in [docs/COMMUNITY_PLUGIN_RELEASE.md](https://github.com/lufie/KnowGrove/blob/main/docs/COMMUNITY_PLUGIN_RELEASE.md).

## License

[MIT](LICENSE)
