# Architecture decisions — verified 2026-10-21

- TypeScript + React/Ink: terminal-native, no HTML assumptions. Node >=22.19 with built-in SQLite avoids native package compilation on Ubuntu 24.04. Node's SQLite experimental warning is suppressed only by the launcher.
- Herdr installed here: 0.9.3, socket protocol 22. Manifest actions use explicit workspace/pane context and `plugin pane open --placement split --direction right --target-pane`. Split width is adjusted through `pane resize`; popup width is not a split ratio. No agent input, lifecycle override, layout replacement, commit or push API is used.
- Codex installed here: 0.163.0. Read-only polling of existing `CODEX_HOME/sessions` JSONL is least intrusive. Live 0.163.0 records include `event_msg.item_completed` with PascalCase `CommandExecution`, `UserMessage`, and `AgentMessage`; these and legacy records are normalized. Rollout is a versioned internal compatibility surface, not a promised public observer API. Ignore reasoning/encrypted content. App Server is appropriate for sessions an application owns; do not claim it passively attaches to arbitrary CLI processes.
- Exact canonical cwd association, optional Herdr agent_session identity, manual selection on ambiguity. Never guess the latest session when several match. One selected session per observer, persistent byte checkpoints and deduplication, bounded batches.
- Panel lifecycle and learning lifecycle are independent. The TUI starts local session discovery in standby; B explicitly begins capture, D aborts capture/model work, and Q closes only the current verified Academy pane. No active-learning preference is persisted: reopen and onboarding save always stand by. Completion drains one final debrief then returns to standby. A different task without a completion marker also requires another explicit start. G/ASK are explicit requests against recorded evidence and do not resume capture.
- Live capture begins at complete JSONL EOF, preserving partial writes and optionally seeding the latest unfinished task from a bounded 1 MiB tail. Completed paused jobs are skipped. Demo/headless replay is explicit. Capture windows persist a SQLite sequence boundary, task context and capture ID; lessons/reports use that ID, so different learning intervals do not share report context. Older lesson history remains browsable. Generation checks discard late reads/provider answers after Stop or session changes. Completion batching excludes records from the next task even when they arrive in the same read.
- Onboarding stores general learning goals across stacks: debugging, fundamentals, design, performance, validation, reliability and code reading. Legacy technology preferences migrate without resetting provider configuration. Actual framework concepts come from observed evidence and the teaching model.
- SQLite WAL stores redacted normalized evidence, checkpoints, lessons, Q&A and usage. Configuration is separate atomic JSON under XDG config (or Herdr's plugin config directory). Raw transcripts and credentials are not stored. Credentials are environment-variable references.
- Milestone state machine and a coalescing scheduler produce evidence-backed lessons. Root-cause statements from agent messages are attributed observations, not independently proven facts. Test success is an observed command exit, never proof of the whole implementation.
- Offline mode provides honest structured evidence and a debrief; deep dynamic explanations require a configured model. OpenAI-compatible HTTP has no tools; loopback is the default. Remote and Codex consent is bound to provider/model/destination and the selected canonical project.
- Codex teaching reuses the CLI's saved ChatGPT login through `codex exec`; Academy never reads, copies, or refreshes tokens itself. API-key authentication is rejected and API-key environment variables are omitted. An empty canonical temporary cwd, ephemeral sessions, an explicit `agent-academy` thread source, ignored user config/rules, disabled AGENTS loading and host skill discovery, disabled command/MCP/plugin/browser/computer/agent capabilities, and a named permissions profile allowing only minimal runtime/temporary-directory reads separate the teacher from the implementation agent. Command network access and all filesystem writes are denied. No resume/fork/send to the coding thread is used. Any observed tool item aborts the teaching request; reasoning is discarded. Unsupported CLI minors fail closed; initially 0.163.x on Linux/macOS is enabled. These are invocation-local arguments, never edits to the user's config. Administrator policy may reject a profile; Academy does not weaken it or fall back to a paid API.
- Codex's JSONL output provides final messages and actual turn token counts. Each teaching request has bounded parsing, cancellation, a configurable 240-second timeout, and temporary-directory cleanup. No automatic retries occur on quota failure. The HTTP output-token cap does not apply to Codex because this CLI exposes no equivalent supported limit; the UI hides that field for this provider. Full real-model validation remains blocked by this development sandbox, documented in verification.md.
- Diagrams derive from normalized timeline and cited model edges. Bounded source excerpts resolve realpaths within the selected project. No automatic repository writes. Markdown exports live in Academy state.

Primary references:

- https://herdr.dev/docs/plugins/
- https://herdr.dev/docs/cli-reference/
- https://herdr.dev/docs/socket-api/
- https://github.com/persiyanov/herdr-reviewr/blob/main/herdr-plugin.toml
- https://github.com/persiyanov/herdr-reviewr/blob/main/src/actions.rs
- https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs
- https://developers.openai.com/codex/noninteractive/
- https://developers.openai.com/codex/app-server/
- https://developers.openai.com/codex/auth/
- https://learn.chatgpt.com/docs/permissions
- https://docs.ollama.com/api/openai-compatibility
- https://github.com/vadimdemedes/ink

The host is macOS; Ubuntu commands and portability are implemented, but a real Ubuntu desktop/Herdr end-to-end run must be distinguished from tests on this host. No global Herdr/Codex configuration is changed by development.

Pane resize semantics were cross-checked against https://github.com/herdrdev/herdr/blob/master/src/layout.rs (`resize_pane` / `resize_focused`): right/down increases the first-child ratio, and explicit pane resizing restores the previous focus.

Split launch correction: Herdr 0.9.3 rejects `workspace_id` for split/zoomed plugin panes, even when `target_pane_id` is provided. Validate the target's workspace separately, then send the target alone. Pane entrypoints use `scripts/academy.sh` as the executable so the host resolves the launcher against the plugin root; the launcher supplies an absolute Node entrypoint while preserving the selected project cwd.
