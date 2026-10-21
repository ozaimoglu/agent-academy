# Verification record

Date: 2026-10-21. Host: macOS. Target: Ubuntu 24.04.

## Executed

- Node v22.19.0, Herdr 0.9.3 (installed schema protocol 22), Codex CLI 0.163.0.
- `npm ci --offline`: clean lockfile installation succeeded using cached packages.
- `npm run check`: ESLint + TypeScript strict checking, **55 passing tests across 6 files**, emitted application build.
- Manifest parsed with Python TOML parser; required metadata, pane placement, argv arrays and open/close/toggle entrypoints validated.
- `node --disable-warning=ExperimentalWarning dist/cli.js --demo --headless`: full discovery → normalization → evidence/source collection → milestone classification → offline lesson → SQLite → Markdown export.
- A real project-matching Codex 0.163.0 rollout was discovered read-only. Inspection of record _shapes_, without reading or printing reasoning content, revealed structured `event_msg.item_completed` CommandExecution records. Adapter support was added and covered by a regression test. A subsequent live read normalized 27 command/result pairs with 27 actual exit codes (counts increase as the task continues).
- TUI rendered in an actual PTY; automated keyboard tests exercise all four onboarding screens, multi-select, back navigation, remote opt-in, and a narrow 38-column layout. Terminal resize subscription, alternate-screen restoration, and Herdr zoom are implemented.
- Tests create a real temporary Git repository to verify HEAD diffs and source line references without modifying the observed application checkout.
- Provider tests verify request URL/body/authentication, tools absent, local/remote token parameter choice, usage vs estimates, unavailable credentials, malformed/truncated responses, cancellation and response size bounds using native Fetch Response objects.

## Restricted by this environment

- Live `herdr pane current --current` returned `Operation not permitted` for the inherited Herdr socket. We did not link the plugin, alter global registration, manipulate the user's panes, or change Codex config. Herdr action integration is tested through a recording CLI boundary against the installed schema and published API.
- Opening a loopback HTTP listener returned `listen EPERM 127.0.0.1`. The attempted escalation was rejected by the environment's approval policy. Default tests therefore use an in-memory Fetch transport. `npm run smoke:provider` is provided for a real local HTTP integration test in an unrestricted environment.
- No remote model credentials were assumed and no source was sent to a remote service. No real Ollama/model inference quality evaluation was performed. Dynamic deep lessons and Q&A are implemented through the verified HTTP contract and schema/citation validation, but their educational quality depends on the configured model and deserves manual evaluation.
- Ubuntu-specific end-to-end Herdr acceptance remains to be run on the target machine. This is a validation limit, not an assertion that the GUI/server integration was exercised here.

## Deliberate MVP limits

Read the README limits before relying on history completeness. Rollout JSONL is not a stable public observer API. Unsupported formats are ignored rather than invented. CLI explanation sessions are unavailable until selected-context-only, tool-free isolation can be verified. The fixture's Spring test results are explicitly synthetic records; Academy does not execute the example Java tests.

The development environment also blocked manual PTY keyboard input and process cleanup. The PTY preview used isolated temporary demo data and did not send model requests.
