# KnowGrove Runtime third-party notices

KnowGrove Runtime redistributes or invokes the following upstream components.
Every published runtime manifest records exact file hashes; release notes must
also record the exact upstream versions used.

## yt-dlp

- Project: https://github.com/yt-dlp/yt-dlp
- License and bundled third-party notices: distributed with the selected
  upstream release asset.

## FFmpeg and FFprobe

- Project: https://ffmpeg.org/
- Static distribution source used by the release workflow:
  https://github.com/eugeneware/ffmpeg-static
- The selected static binaries are distributed under GPL-3.0-or-later. The
  KnowGrove release must preserve the corresponding source and license links.

## whisper.cpp

- Project: https://github.com/ggml-org/whisper.cpp
- License: MIT
- Runtime 1.0.2 version: v1.9.3
- Source commit: 371b5a7561823ab2bb32142d2751e35e7534727b

## Whisper model

- Distribution repository:
  https://huggingface.co/ggerganov/whisper.cpp
- The model is published as a separate shared artifact so runtime upgrades do
  not download it again.
