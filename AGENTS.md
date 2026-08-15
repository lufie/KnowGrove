<claude-mem-context>
# Memory Context

# claude-mem status

This project has no memory yet. The current session will seed it; subsequent sessions will receive auto-injected context for relevant past work.

Memory injection starts on your second session in a project.

`/learn-codebase` is available if the user wants to front-load the entire repo into memory in a single pass (~5 minutes on a typical repo, optional). Otherwise memory builds passively as work happens.

Live activity: http://localhost:37701
How it works: `/how-it-works`

This message disappears once the first observation lands.
</claude-mem-context>

# Product Documentation Policy

- Root `PRD.md` is the public Obsidian plugin delivery contract. The private `KnowGrove-Platform/PRD.md` is the single cross-end product baseline.
- Every public plugin feature addition, removal, behavior change, setting change, or release-status change must update the corresponding section of this public contract.
- A change to recording, transcription, task state, Markdown output, privacy, or bridge protocol must also update the matching capability ID and affected clients in the private total PRD; record that cross-repository handoff before merging.
- Keep this contract compact and current. Detailed evidence belongs in `docs/`, and old chronology belongs in the private archive rather than an indefinitely growing change log.
- Do not describe a capability as published until its distribution address and clean-machine acceptance evidence are available.

# Public Repository Boundary

- This public repository is the source of truth for the KnowGrove Obsidian plugin and its public local-bridge contract.
- Desktop application, browser extension, cloud service, and private runtime implementation source belong in the private `lufie/KnowGrove-Platform` repository.
- Never copy the private repository wholesale into this public repository. Any cross-repository export must use an explicit allow-list and review.
- Obsidian plugin release tags must match `manifest.json` exactly and must not use a product prefix.
- Local plugin candidates keep only the latest fully generated and verified version. Delete an older local candidate only after its replacement passes verification; do not automatically delete Git tags or remote published Releases.
