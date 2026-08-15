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

# Product Contract Handoff

- This public repository does not store a product PRD or a synchronized copy. The only cross-end product source of truth is the private `lufie/KnowGrove-Platform` root `PRD.md`.
- Every public plugin feature addition, removal, behavior change, setting change, or release-status change must update the matching capability ID, common contract, Obsidian section, compatibility requirements, and change log in the private total PRD before merge.
- The handoff must retain prerequisites, ordered flow, state/data semantics, invariants, failure recovery, platform differences, and compatibility/acceptance requirements when they change.
- Public implementation and release evidence belongs in `README.md`, `docs/`, tests, and GitHub Release notes. Do not describe a capability as published until its distribution address and clean-machine acceptance evidence are available.
