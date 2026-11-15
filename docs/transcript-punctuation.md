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

## Plugin-wide integration

All new audio/video processing uses `prepareCaptureReadability` after safe raw writeback and before summary/body generation. This is automatic, not a separate opt-in or something users must remember to run.

| Entry | Existing route to shared processing |
| --- | --- |
| Browser/mobile lightweight capture, standalone media links and batches | Capture request / enqueueLinkNote -> processJob |
| Desktop recording | finalizeDesktopRecording -> processDesktopRecordingInBackground -> enqueueLinkNote -> processJob |
| Imported local audio/video | importLocalMediaFiles -> enqueueLinkNote -> processJob |
| Saved raw-note resume | detectInterruptedCapture -> processJob; reuse saved transcript without media download/ASR |
| Web-page embedded audio/video | appendEmbeddedMediaTranscripts -> raw article save -> same readability pipeline, embedded ranges only |
| Existing full / managed embedded transcript | Same restoration/validation and final atomic manual repair |

Embedded transcripts have collector-created UUID/hash start/end bounds. The immutable prose fingerprint is verified against the raw text or its verified original backup. Ordinary article headings/URLs and old unmarked embedded articles are not used to guess ownership. Protected examples are ignored; malformed, mismatched or duplicate bounds stop processing. Text outside the owned bounds, including subsequent H1/H4 user notes, is not sent for punctuation or changed. Legacy unmarked embedded items require recapture to establish safe ownership; there is no automatic bulk rewrite of old notes.

The task UI has a distinct punctuation phase, aggregated monotonic progress and truthful partial state. A successfully stored partial punctuation result offers a repair action; it is not labelled completed. Settings describe the automatic shared behavior. There are no new provider defaults or paid services. Explicit one-off repair execution may select an available provider with a fresh in-memory configuration, without changing the persisted default, endpoint, model or executable configuration.

## Verification

Local regression coverage includes insertion-only Unicode fidelity, repeated speech, foreign scripts, numeric subtitle content, technical terms, provider errors, safe chunk limits, nested/protected headings, structural-injection rejection, escaped verified backups, cancellation, concurrency, full-length media retention and manual write/readback. Local tests are not a claim of hosted CI, successful provider authentication, marketplace distribution or user-device acceptance.
