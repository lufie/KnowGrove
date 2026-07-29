# KnowGrove managed runtime

The Obsidian plugin remains a small JavaScript bundle. Desktop media
dependencies are published as individually signed and hashed release assets.

Supported initial targets:

- `darwin-arm64`
- `darwin-x64`
- `win32-x64`

Each platform receives `yt-dlp`, `ffmpeg`, `ffprobe`, and a statically linked
`whisper-cli`. The Whisper model, Skill Pack, and third-party notices are shared
across platforms.

## Release inputs

The release workflow builds `whisper.cpp` from its tagged source, downloads
official yt-dlp release binaries, and uses pinned `ffmpeg-static` /
`ffprobe-static` packages. It then creates:

```text
runtime-dist/
├── darwin-arm64/bin/...
├── darwin-x64/bin/...
├── win32-x64/bin/...
└── shared/
    ├── ggml-small.bin
    ├── skill-pack.json
    └── THIRD_PARTY_NOTICES.md
```

`scripts/build-runtime-manifest.mjs` hashes every artifact and signs the
canonical manifest with an Ed25519 private key supplied by the release
environment. The private key must never be committed.

## Required release secret

`KNOWGROVE_RUNTIME_SIGNING_KEY` must contain the PEM encoded Ed25519 private
key. The matching public key is embedded in the plugin runtime manager.

When a mirror reuses byte-identical artifacts from an earlier release, pass a
JSON object through `KNOWGROVE_ASSET_URL_MAP`. Keys are current artifact file
names and values are the HTTPS URLs that should become their primary download
sources. Unmapped artifacts continue to use `KNOWGROVE_RELEASE_BASE_URL`.
