# Transcript punctuation repair

Requirement: PR-01 readable transcript paragraphs; PR-02 / OUT-01 immutable original material and separate rebuildable AI output. This corrects the existing transcript presentation path; it does not change transcription models, defaults, providers or settings.

## Processing and fidelity

- Save the complete media transcript before AI processing. Browser-supplied and extracted media transcripts are not subject to the article/summary input character limit.
- Restore punctuation and paragraph breaks in bounded prose chunks through the already selected provider. Do not translate, summarize, correct ASR terms, remove repetition or change existing words/punctuation.
- Accept only insertion-only punctuation and whitespace adjustments. Verify the complete original Unicode character sequence, existing punctuation, technical tokens (including C++, C#, .NET), numbers, versions, URLs, email and Latin word boundaries.
- Markdown structures, inline/fenced/indented code, HTML/Obsidian comments, nested folded blocks, recording protocols and machine timelines are not sent to the model or reserialized. Over-limit technical tokens are retained without an unbounded model call. Reject paragraph changes that promote inline text into Markdown structure.
- Retry invalid model text once. A provider/auth/network error stops immediately, without retrying the same provider for every remaining chunk. Partial automatic repairs retain the original wording for failed chunks and mark the task partial. No successful-looking claim for unprocessed text.
- Show restored transcript text as derived readability output. Keep an HTML-escaped, SHA-256-verified folded original-prose backup. Keep machine blocks exactly once, outside this prose backup. Summary input excludes protected machine blocks.

## Existing notes

The desktop command `Repair current transcript punctuation` processes only the unique, unprotected full-transcript section. Headings inside protected blocks are ignored; duplicate real transcript sections or malformed/hash-mismatched backups stop processing.

Manual repair is all-or-nothing. It preserves the rest of the note, backs up the full original note in the plugin configuration directory, then performs a Vault.process compare-and-swap. Concurrent edits, moves, cancellation, failed fidelity checks and provider errors cannot silently overwrite the note. Closing the repair modal cancels pending work. Already-readable or short text is a no-op, not an AI-success report.

## Verification

Local regression coverage includes insertion-only Unicode fidelity, repeated speech, foreign scripts, numeric subtitle content, technical terms, provider errors, safe chunk limits, nested/protected headings, structural-injection rejection, escaped verified backups, cancellation, concurrency, full-length media retention and manual write/readback. Local tests are not a claim of hosted CI, successful provider authentication, marketplace distribution or user-device acceptance.
