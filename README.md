<div align="center">
  <img src="docs/assets/hero.svg" alt="Agent Academy — Your agent ships code. You build understanding." width="1200" />

  <p><strong>The senior engineer beside your coding agent.</strong></p>
  <p>Problems. Root causes. Framework internals. Real code. Actual test results.<br />Learn the engineering behind the changes, inside your terminal.</p>

  <p>
    <a href="https://nodejs.org/en/download"><img src="https://img.shields.io/badge/Node.js-%E2%89%A522.19-61D6C5?style=flat-square&amp;labelColor=172133" alt="Node.js 22.19 or later" /></a>
    <a href="https://herdr.dev"><img src="https://img.shields.io/badge/Herdr-%E2%89%A50.9.3-8DAEFF?style=flat-square&amp;labelColor=172133" alt="Herdr 0.9.3 or later" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-61D6C5?style=flat-square&amp;labelColor=172133" alt="MIT license" /></a>
    <a href="docs/verification.md"><img src="https://img.shields.io/badge/status-MVP-E6BD75?style=flat-square&amp;labelColor=172133" alt="MVP status" /></a>
  </p>

  <p><a href="#quick-start">Quick start</a> · <a href="#try-it-without-an-api-key">Try the demo</a> · <a href="#what-you-can-explore">Explore the experience</a> · <a href="docs/usage.tr.md">Türkçe kullanım rehberi</a></p>
</div>

---

## The agent fixed it. Can you explain why it broke?

AI coding agents can investigate a bug, change the implementation, run tests, and finish the task before you have built a mental model of the problem.

**Agent Academy turns that work into something you can understand, question, and remember.**

It opens beside Codex in Herdr, observes the existing session, and connects the investigation to engineering concepts: the error that mattered, the mechanism behind it, the code that changed, the alternatives, and the tests that support the result.

> **Codex implements the solution. Academy helps you understand the engineering.**

Start Codex the way you already do. Academy reads local session records independently; it does not send instructions to the coding agent or edit your application.

## What you can explore

Six focused views, with scrolling, lesson navigation, and a wider reading mode:

| View          | What you learn                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| **LIVE**      | What the agent is investigating, changing, and validating right now.                                              |
| **WHY**       | The problem, suspected cause, underlying mechanism, design decisions, alternatives, and trade-offs.               |
| **CODE**      | Observed patches, Git HEAD → worktree differences, and relevant source excerpts with line numbers.                |
| **VISUALIZE** | Terminal-native diagrams derived from cited relationships or the observed event timeline.                         |
| **ASK**       | Follow-up explanations grounded in the selected lesson and its actual evidence.                                   |
| **REPORT**    | A local Markdown engineering debrief covering the task, investigation, changes, tests, and remaining uncertainty. |

### Go deeper than “we moved the method”

Suppose Codex investigates a Spring `@Transactional` self-invocation bug. A useful explanation should connect the actual `this.persist()` call to proxy interception, transaction boundaries, repository behavior, propagation, alternative designs, and a focused rollback test.

That is the teaching engine's brief. With an explanation model configured, deep mode asks for the mechanisms, real code, alternatives, edge cases, and verification strategy. It has no fixed paragraph limit; context, output budget, and analysis frequency are configurable.

Every significant lesson uses eleven structured sections and evidence references. Confidence is visible as **Confirmed**, **Strongly supported**, **Hypothesis**, or **Unknown**. An agent's root-cause claim remains an attributed observation; a passing command is evidence of that command's result.

## Quick start

**Requires Node.js ≥22.19, npm, Git, and Herdr ≥0.9.3.** The primary target is Ubuntu 24.04. The interface and teaching prompts default to Turkish.

Install the plugin:

```bash
herdr plugin install ozaimoglu/agent-academy
```

From the Codex pane inside Herdr, open Academy:

```bash
herdr plugin action invoke local.agent-academy.open
```

Academy opens in a **right-side split**, approximately **38%** wide by default. Installation registers a Herdr plugin; it does not change your Codex configuration or require a different launch command.

<details>
<summary><strong>Install from a local checkout</strong></summary>

```bash
git clone https://github.com/ozaimoglu/agent-academy.git
cd agent-academy
./scripts/install.sh
herdr plugin link "$PWD"
```

The script installs dependencies and builds the app. `plugin link` registers the local checkout in Herdr. Then invoke the open action from your Codex pane.

```bash
herdr plugin action invoke local.agent-academy.toggle
herdr plugin action invoke local.agent-academy.close
```

</details>

### Your first minute

The onboarding runs **inside the product**:

| Step               | Choose                                                                      | Default                                            |
| ------------------ | --------------------------------------------------------------------------- | -------------------------------------------------- |
| **1 · Depth**      | Quick summary, balanced, or deep explanations                               | Deep                                               |
| **2 · Style**      | Visuals, real code, fundamentals, senior engineering, interaction           | Visuals + code + fundamentals + senior engineering |
| **3 · Priorities** | Debugging, Spring, architecture, concurrency, testing, security, TypeScript | Everything                                         |
| **4 · Model**      | Offline, local, or remote explanation provider                              | Offline                                            |

Use arrow keys, Space, and Enter. Advanced provider settings are expandable. Press **S** later to revisit your preferences.

If Herdr provides a reliable native session identity, Academy uses it. Otherwise it matches the exact project directory. When several sessions match, press **C** to choose one.

## Try it without an API key

Run a complete local demo from a checkout:

```bash
git clone https://github.com/ozaimoglu/agent-academy.git
cd agent-academy
./scripts/install.sh
npm run demo
```

The demo runs the **same JSONL adapter, evidence collector, lesson pipeline, SQLite store, and report exporter** used by live mode, against an isolated deterministic Spring transaction fixture. It never calls a remote model. Its recorded Java test results are synthetic fixture data; Academy does not execute those Java tests.

Already built? Export a demo report without an interactive terminal:

```bash
node --disable-warning=ExperimentalWarning dist/cli.js --demo --headless > demo-report.md
```

Observe a real project without Herdr:

```bash
npm start -- --project /absolute/path/to/project
```

## Bring your explanation model

| Provider                               | Behavior                                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Offline**                            | Local observation, structured evidence, code views, timeline diagrams, and reports. No generated framework tutorial or model Q&A.                               |
| **Ollama / local compatible endpoint** | Detailed lessons and Q&A through a loopback OpenAI-compatible HTTP endpoint. Use an actually local model; a server can still forward requests to a cloud model. |
| **Remote compatible endpoint**         | Detailed lessons and Q&A over HTTPS, after explicit consent for the project, endpoint, and model.                                                               |
| **Existing Codex CLI**                 | Unavailable in this MVP: a tool-free teacher restricted to selected context has not been verified. Academy does not start a second Codex session.               |

No API key is assumed. Credentials are referenced by **environment variable name**, rather than saved in the settings. Available token usage is recorded; estimates are labeled. Automatic explanations are coalesced around engineering milestones, with a default minimum interval of 60 seconds.

**Offline mode gets you started. A configured explanation model enables the deeper teaching experience.** [Provider setup →](docs/usage.tr.md#açıklama-modeli-yapılandırma)

### Ask the questions a summary never answers

- “Bunu daha temelden anlat.”
- “Bu sınıftaki gerçek kod üzerinden açıkla.”
- “Alternatif çözüm ne olurdu?”
- “Bu kod production’da hangi problemleri doğurabilir?”
- “Bu davranışı testle nasıl kanıtlarız?”

Choose a lesson and concept, ask your question, and keep the answer attached to that lesson. The implementation session continues independently.

## Built around evidence

```text
Existing Codex JSONL + observable messages + commands + diffs + source
                                  │
                                  ▼
                 Normalize → Deduplicate → Collect evidence
                                  │
                                  ▼
         Investigating → Hypothesis → Root-cause observation
                                  │
                                  ▼
                  Implementing → Validating → Completed
                                  │
                                  ▼
                 Lessons · Code · Diagrams · Q&A · Debrief
```

- **Incremental observation.** Partial JSONL writes, UTF-8 byte offsets, duplicate records, file replacement, and restart checkpoints are handled explicitly.
- **Session isolation.** Canonical project paths and scoped persistence keep workspaces separate. Ambiguous session matches require selection.
- **Relevant context.** Bounded evidence selection and source excerpts keep model requests focused. Entire raw transcripts are not sent with every question.
- **Traceable claims.** Generated references must exist in the selected evidence set. Citation validation checks reference integrity; it cannot independently prove technical correctness.
- **Honest uncertainty.** Missing tests, unknown causes, unsupported formats, and failed providers are exposed.

## Local first, by design

Lessons, reports, Q&A, usage, and checkpoints live in local SQLite and Academy state directories. Source reads resolve real paths inside the selected project, with common sensitive files excluded. Obvious secrets and terminal control sequences are redacted before captured context is persisted or sent to a model; automated redaction cannot catch every secret.

Remote source sharing requires explicit project-specific opt-in. HTTP explanation providers receive no executable tools. Academy does not commit, push, modify application code, or send prompts to the implementation agent.

[Storage locations, privacy boundaries, and retention →](docs/usage.tr.md#yerel-veri-ve-gizlilik)

## Project status

**v0.1.0 MVP.** The application is implemented; validation scope is documented openly.

- **57 automated tests** cover onboarding, live-format parsing, partial writes, deduplication, session matching, reconnection, milestones, evidence, providers, privacy, Q&A, reports, and TUI navigation.
- Build, lint, deterministic demo, and actual project-matching **Codex 0.163.0** command/result parsing were verified during development.
- Herdr pane open/close actions were exercised on the installed macOS server after fixing split targeting; the launcher is tested from another project directory. Direct socket inspection and real loopback HTTP tests were restricted by the development sandbox. End-to-end validation on Ubuntu and real-model explanation quality remain to be completed.
- Codex rollout JSONL is an internal compatibility surface, so future format changes may require adapter updates. Claude Code/OpenCode adapters, semantic call graphs, browser rendering, and automatic documentation retrieval are outside this MVP.

[Full verification record →](docs/verification.md)

## Develop

```bash
npm ci
npm run check
```

`check` runs ESLint, strict TypeScript checks, the test suite, and the application build.

```bash
npm run smoke:provider       # Real loopback HTTP smoke test; no model or API key needed
npm start -- --doctor       # Local diagnostics
npm start -- --help         # CLI options
```

## Documentation

- [Türkçe kullanım rehberi](docs/usage.tr.md) — installation, keyboard controls, provider settings, storage, troubleshooting, and limits.
- [Architecture decisions](docs/architecture.md) — integration research, boundaries, and implementation choices.
- [Verification record](docs/verification.md) — what was exercised and what remains unverified.
- [MIT license](LICENSE).

Built with TypeScript, React/Ink, and SQLite. Designed for engineers who want the code to work **and** want to understand why.
