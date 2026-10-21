# Verification record

Date: 2026-10-21. Host: macOS. Target: Ubuntu 24.04.

## Optional concept questions · 2026-10-22

- A real Codex/ChatGPT teaching request with synthetic Spring code produced a Turkish transaction-familiarity question, a short definition and an evidence-cited connection to the observed self-call/separate-bean change. All eleven lesson sections and concept references passed normal validation. Recorded usage: 9,431 input / 1,864 output tokens. This checks one synthetic lesson, not broad educational quality; no actual project source was sent.

- `npm run check`: **150 tests across 13 files**, lint, strict TypeScript and build passed. The real offline PTY smoke passed. Actual Ubuntu 24.04 arm64 container acceptance passed the same 150 tests, production-host installation and receipt verification, loopback HTTP and real PTY checks.
- New coverage exercises cited Spring and Angular concept payloads, unsupported citations, sanitized prompts, one pending check, spacing between questions, project familiarity, introduction-before-code ordering, all three keyboard choices, natural replies, stable input targeting as new lessons arrive, duplicate/stale response rejection, persistence/project isolation, skip scope and continued observation/task completion while a question is unanswered.
- Configured-provider tests verify the three quick responses make no additional model request. Custom questions follow the normal Q&A path and are retained with the concept response in the report.

## English interface and conversation language

- `npm run check`: **130 tests across 12 files**, lint, strict TypeScript and build passed. The real PTY smoke passed on macOS. Actual Ubuntu 24.04 arm64 container acceptance passed all 130 tests, production-host installation, receipt verification, real loopback HTTP and PTY checks.

- Product chrome, onboarding/consent, plugin action titles, CLI diagnostics, installer output and report structure use English.
- Local language regressions cover Turkish (including ASCII chat spelling), English, Spanish, French, German, Chinese and Japanese. Later clear requests switch languages; neutral commands retain the prior language. Code, quoted logs, assistant messages and injected instructions are excluded as signals.
- Teaching/Q&A provider-contract tests validate language context and localized failure fallback without real inference or extra model requests. Completed-turn language is inherited at explicit Start without ingesting the previous tasks. Legacy configuration migration preserves all provider consent and preferences.
- Offline narration includes English and Turkish. Other languages require the configured model; real-model multilingual quality has not been evaluated.

## One continuous teaching conversation

- Replaced the six content views with one chronological conversation. Actual code comparisons and useful cited diagrams appear alongside the explanation. Follow-up questions and answers use the same surface. The structured lesson and automatic Markdown export remain available to the backend.
- `npm run check`: **113 tests across 11 files**, lint, strict TypeScript and build passed on macOS. The updated real PTY smoke covers the single conversation, Home/End history navigation, stopping, quitting and alternate-screen restoration.
- Component tests verify removed tab keys do not change views, current code stays inside the explanation, scrolling into history preserves the reading position as new activity arrives, End resumes following, and Enter submits a question whose answer appears in the conversation.
- Narrative tests retain earlier explanations and associated questions, exclude another capture's history, render cited diagrams inline within a narrow pane, reject unsupported edges, and remove terminal control sequences from diagram labels. No unrelated timeline is rendered as an architecture diagram.

The sections below record the earlier interface and its validation history.

## Conversational LIVE walkthrough

- `npm run check`: **109 tests across 11 files**, lint, strict TypeScript and build passed on macOS. `npm run smoke:terminal` passed with the updated LIVE screen.
- Tests cover a useful explanation before any lesson/model response, the reported source/diff-only case with a real before/after excerpt, hidden raw IDs and logs, uncertain vs failed/passing checks, grounded model narration, immediate newer activity and exclusion of another capture's old explanation.
- Integration tests verify the ongoing task starts an explanation immediately, new Git changes trigger teaching without a new Codex event, unchanged code does not repeat it, and the rendered TUI keeps full raw patches accessible in CODE.
- Structured Codex `FileChange.changes` maps now become individual real file patches, rather than an opaque JSON object. A regression uses the observed `type`, `unified_diff`, `move_path` record shape.
- Provider fixture tests validate citations and confidence in the new `walkthrough` field and reject fabricated references there. These checks do not claim real-model teaching quality was evaluated.
- A live Codex probe exposed two startup diagnostics emitted as `item.completed` / `error`: the unstable `skip_host_skill_discovery` notice and the intentionally disabled Code Mode host notice. The provider now ignores only these known informational prefixes instead of misclassifying them as tool calls. Other item errors fail with a redacted diagnostic; actual tool items are still rejected. Regression tests cover both cases. Invocation permissions and disabled capabilities are unchanged. JSONL transport was checked against [official non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode).
- A subsequent real Codex/ChatGPT teaching request succeeded with synthetic TypeScript evidence only: three Turkish LIVE explanations tied mutation to the actual `values[index]` assignment, contrasted it with the observed `map` change, and correctly distinguished the synthetic result record from an executed test. All eleven lesson sections and evidence references passed the normal decoder. Recorded usage: 9,026 input / 1,595 output tokens. This validates one synthetic lesson, not broad real-project teaching quality. No project source or private reasoning was inspected by this check.

## Ubuntu 24.04 acceptance

Executed on 2026-10-21 using Docker Desktop's Linux kernel and an **Ubuntu 24.04.5 LTS arm64** userspace, Node **v22.23.4**, npm **10.9.9**, Git **2.43.0**, running Academy as UID **10001**. This is container validation; native Ubuntu desktop/Herdr pane integration and real-model quality remain separate.

- `docker build --target check --tag agent-academy:ubuntu-check .`: clean lockfile install, ESLint, strict TypeScript, **98 passing tests across 10 files**, and emitted application build.
- The real installer succeeded with both `NODE_ENV=production` and `npm_config_omit=dev`. It explicitly includes development dependencies for the TypeScript build, then stages, validates and promotes the output.
- `./scripts/install.sh --check` and `./scripts/academy.sh --verify-install`: real SQLite, CLI help, synthetic JSONL observation, lesson persistence and Markdown report acceptance succeeded.
- Real loopback HTTP smoke passed inside Ubuntu, using a local fixture server with no model or credentials.
- Real PTY smoke passed inside Ubuntu: demo opens in standby, B starts learning, all six views render, D stops, Q exits with code 0, and the alternate screen is restored. Demo files are isolated in a temporary directory.
- `docker build --tag agent-academy:ubuntu .`, `docker run --rm agent-academy:ubuntu` and the image's `--verify-install` action succeeded. The runtime image uses Ubuntu 24.04, includes its own Node runtime, runs as the regular `academy` user, and works after TypeScript, Vitest and ESLint are removed.
- A new subprocess regression verifies a launcher started with only `/usr/bin:/bin` on PATH makes its recorded Node available to child CLIs. The macOS suite also passed all 98 tests and the real PTY smoke.
- `.github/workflows/ci.yml` defines Ubuntu 24.04 jobs for Node `22.19.0` and `24`, plus actual Ubuntu container acceptance and production-image validation on the hosted x64 runner. Local acceptance above was arm64; the workflow's execution status is reported separately.

The following sections preserve the initial macOS verification and its historical environment restrictions.

## Executed

- Node v22.19.0, Herdr 0.9.3 (installed schema protocol 22), Codex CLI 0.163.0.
- `npm ci --offline`: clean lockfile installation succeeded using cached packages.
- `npm run check`: ESLint + TypeScript strict checking, **97 passing tests across 10 files**, emitted application build.
- Manifest parsed with Python TOML parser; required metadata, pane placement, argv arrays and open/close/toggle entrypoints validated.
- `node --disable-warning=ExperimentalWarning dist/cli.js --demo --headless`: full discovery → normalization → evidence/source collection → milestone classification → offline lesson → SQLite → Markdown export.
- A real project-matching Codex 0.163.0 rollout was discovered read-only. Inspection of record _shapes_, without reading or printing reasoning content, revealed structured `event_msg.item_completed` CommandExecution records. Adapter support was added and covered by a regression test. A subsequent live read normalized 27 command/result pairs with 27 actual exit codes (counts increase as the task continues).
- TUI rendered in an actual PTY; automated keyboard tests exercise all four onboarding screens, multi-select, back navigation, remote opt-in, and a narrow 38-column layout. Terminal resize subscription, alternate-screen restoration, and Herdr zoom are implemented.
- Tests create a real temporary Git repository to verify HEAD diffs and source line references without modifying the observed application checkout.
- Provider tests verify request URL/body/authentication, tools absent, local/remote token parameter choice, usage vs estimates, unavailable credentials, malformed/truncated responses, cancellation and response size bounds using native Fetch Response objects.

## Restricted by this environment

- Initial live `herdr pane current --current` returned `Operation not permitted` for the inherited Herdr socket. Direct socket inspection remains restricted. Subsequent user-authorized plugin registration and action execution succeeded through the Herdr CLI, as recorded below. No Codex configuration was changed.
- Opening a loopback HTTP listener returned `listen EPERM 127.0.0.1`. The attempted escalation was rejected by the environment's approval policy. Default tests therefore use an in-memory Fetch transport. `npm run smoke:provider` is provided for a real local HTTP integration test in an unrestricted environment.
- No remote model credentials were assumed and no source was sent to a remote service. No real Ollama/model inference quality evaluation was performed. Dynamic deep lessons and Q&A are implemented through the verified HTTP contract and schema/citation validation, but their educational quality depends on the configured model and deserves manual evaluation.
- Ubuntu-specific end-to-end Herdr acceptance remains to be run on the target machine. This is a validation limit, not an assertion that the GUI/server integration was exercised here.

## Deliberate MVP limits

Read the README limits before relying on history completeness. Rollout JSONL is not a stable public observer API. Unsupported formats are ignored rather than invented. Codex teaching currently supports only the reviewed 0.163.x CLI minor; real-model validation is limited as described below. The fixture's Spring test results are explicitly synthetic records; Academy does not execute the example Java tests.

The development environment also blocked manual PTY keyboard input and process cleanup. The PTY preview used isolated temporary demo data and did not send model requests.

## Herdr launch regression fix

The installed Herdr 0.9.3 server rejected the original split request because it contained both `target_pane_id` and `workspace_id`. Split and zoomed placement forbid `workspace_id`; the target already supplies the workspace. The open action now validates workspace ownership through `pane get` and sends only `--target-pane` for the split. A regression assertion covers the invalid combination, and CLI errors retain the server message with redaction.

The manifest also uses an executable launcher resolved relative to the plugin root. The launcher passes an absolute path to `dist/cli.js`, so opening Academy from another application's cwd does not make Node search that project for Academy's files. A test exercises the launcher from an unrelated temporary directory.

After rebuilding and relinking, the actual server recorded the corrected open action as `succeeded` with exit code 0 (`plugin-log-5`), and the Academy `--pane` process was running. The corresponding close action also succeeded with exit code 0 (`plugin-log-6`). This verifies live pane creation and close on this Mac; Ubuntu and real-model quality validation remain separate. CLI 0.9.5 and server 0.9.3 were protocol-compatible, so no Herdr server restart was needed.

Primary validation rule: https://github.com/herdrdev/herdr/blob/v0.9.3/src/app/api/plugins/mod.rs

## Codex quota provider

- Installed `codex login status` confirmed ChatGPT authentication without reading credential files. `codex exec --help` verified ephemeral, ignored config/rules, JSONL, thread source and strict-config flags. CLI-generated app-server bindings were inspected for compatibility; the implementation uses documented noninteractive `exec`, not private service endpoints.
- Running `codex features list` with the invocation-local overrides confirmed shell, apps, plugins, computer use, hooks, multi-agent and image viewing were disabled. The permissions profile follows the official named-profile schema: minimal runtime reads, empty temporary cwd reads, no filesystem write grants and command networking disabled. It does not extend the broadly readable built-in read-only profile.
- Subprocess tests use a temporary executable implementing the documented exec JSONL contract. They exercise preflight version/login checks, environment filtering, exact CLI arguments, redacted stdin, split UTF-8 output, reasoning exclusion, actual usage/estimates, quota errors, unexpected tools, malformed/oversized/incomplete output, cancellation and cleanup. UI coverage verifies selection, advanced fields and explicit project consent. A rollout with the teacher marker is excluded from discovery.
- `npm run smoke:codex` attempted a real request using synthetic TypeScript evidence only. It failed before inference: `failed to initialize in-process app-server client: Operation not permitted (os error 1)`. No sandbox bypass or API-key fallback was attempted. A successful live lesson and Q&A via this provider remain unverified here. The script is included for a normal host terminal and explicitly warns that it consumes quota.

## User-controlled learning

Automated integration tests verify idle discovery without source/Git/model activity, explicit start, skipping old paused work, completion boundaries within one JSONL batch, separate persisted capture reports, standby on restart, cancellation of a pending provider, rejection of late source results and stopping on a new distinct task. Adapter tests preserve a partial UTF-8 row at the initial EOF boundary and check session identity before tailing. Keyboard tests cover B/D/Q and generic onboarding; Herdr tests ensure the panel-close request targets only a pane whose workspace and executable identity match Academy. Legacy preference migration preserves provider settings. These tests do not claim a live keyboard press in the native Herdr pane was exercised.

## Installation lifecycle

- Official Herdr installation/build/update/uninstall behavior and the installed CLI help were rechecked. The manifest now runs one installer and exposes `doctor` / `verify` actions alongside panel controls. The manifest parses with Python's TOML parser; both shell scripts pass `bash -n`.
- Twelve installation tests run the real Bash installer, preflight, verifier and launcher in temporary checkouts with spaces in their paths. npm/Git/Herdr are isolated executable doubles, while Node and SQLite are real. Cases include prerequisite rejection, no-write preview, successful/repeated installation, dependency/build/acceptance failures, registration rollback, artifact changes rejected before execution, concurrent lock ownership and saved Node selection with an unusable `node` on PATH. They validate installer behavior, not remote GitHub availability or the doubles' synthetic CLI content as an educational lesson.
- `npm_config_offline=true ./scripts/install.sh --build-only` succeeded on this Mac with cached packages: 215 dependencies installed, real TypeScript output staged, actual offline demo accepted, receipt created and verified output promoted. No remote explanation request or user project observation occurred.
- `./scripts/install.sh --check`, `./scripts/academy.sh --verify-install` and `./scripts/academy.sh --doctor` succeeded. Doctor reported the installed source revision, dirty checkout status, absolute Node executable and validation time without starting inference.
- The existing user-authorized local Herdr link was refreshed, preserving its installation type. Invoking `local.agent-academy.verify` through the actual Herdr server produced a log with **`status: succeeded`, `exit_code: 0`**, and the offline acceptance result. The panel was not automatically opened.
- A fresh managed GitHub install, native managed update/reinstall/rollback, and Ubuntu 24.04 acceptance were not executed here. Those lifecycle instructions follow official Herdr documentation; automated failure/rollback tests cover the source installer. Source rollback restores `dist`, not `node_modules`. The checksum receipt is not a publisher signature.
