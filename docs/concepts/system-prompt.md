---
summary: "What the OpenClaw system prompt contains and how it is assembled"
read_when:
  - Editing system prompt text, tools list, or time/heartbeat sections
  - Changing workspace bootstrap or skills injection behavior
title: "System Prompt"
---

# System Prompt

## Template Variables Reference

You can customize the system prompt by placing a `SYSTEM.md` file in your **workspace directory**. OpenClaw uses [Nunjucks](https://mozilla.github.io/nunjucks/) (Jinja2-compatible) templating.

### Available Variables

| Variable             | Type   | Description                       | Example                                                  |
| -------------------- | ------ | --------------------------------- | -------------------------------------------------------- |
| `agentId`            | string | Current agent identifier          | `{{agentId}}` → `"default"`                              |
| `promptMode`         | string | One of: `full`, `minimal`, `none` | `{% if promptMode == "full" %}...{% endif %}`            |
| `tools`              | array  | List of available tools           | `{% for tool in tools %}{{tool.name}}{% endfor %}`       |
| `safety`             | string | Safety guardrail text             | `{{safety}}`                                             |
| `skills`             | array  | Available skills                  | `{% for skill in skills %}{{skill.name}}{% endfor %}`    |
| `openclawSelfUpdate` | string | OpenClaw self-update instructions | `{{openclawSelfUpdate}}`                                 |
| `workspace`          | string | Working directory path            | `{{workspace}}` → `"/home/user/project"`                 |
| `documentation`      | object | Docs paths                        | `{{documentation.local}}` → `"/Users/me/openclaw/docs"`  |
| `contextFiles`       | array  | Injected bootstrap files          | `{{contextFiles[0].path}}`                               |
| `sandbox`            | object | Sandbox config                    | `{% if sandbox.enabled %}...{% endif %}`                 |
| `currentDateTime`    | object | User-local time info              | `{{currentDateTime.timezone}}` → `"America/New_York"`    |
| `replyTags`          | object | Reply tag syntax per provider     | `{{replyTags.telegram}}`                                 |
| `heartbeat`          | object | Heartbeat config                  | `{{heartbeat.intervalSecs}}` → `120`                     |
| `runtimeInfo`        | object | Runtime details                   | `{{runtimeInfo.model}}` → `"claude-sonnet-4-20250514"`   |
| `reasoning`          | object | Reasoning visibility              | `{{reasoning.level}}` → `"show"`                         |
| `identity`           | string | Base identity line                | `{{identity}}`                                           |
| `modelAliases`       | object | Model alias mappings              | `{{modelAliases.sonnet}}` → `"claude-sonnet-4-20250514"` |

## Tool Control in Templates

When a `SYSTEM.md` template is present in your workspace, OpenClaw passes **empty tool arrays** to the Pi SDK, preventing Pi from injecting its own tool definitions. This gives you complete control over how tools are described and presented in your system prompt.

### Available Tool Variables

Your template has access to these tool-related variables:

- `toolList` - Pre-formatted string of all available tools with descriptions (one tool per line)
- `availableTools` - Set of tool names for conditional checks (use `.has('toolname')`)
- `execToolName`, `processToolName`, `readToolName` - Individual tool name strings

### Example: Custom Tool Section

```jinja2
## Available Tools

You have access to the following tools:

{{ toolList }}

{% if availableTools.has('memory_search') %}
**Memory Tool**: Use memory_search to recall past conversations.
{% endif %}
```

### Example: Conditional Tool Documentation

```jinja2
{% if availableTools.has('exec') %}
## Bash Execution

The `{{ execToolName }}` tool runs shell commands. Use it responsibly.
{% endif %}
```

**Note**: When using a template, Pi's built-in tool descriptions are not injected, so you must describe tool usage in your template if needed. The tools are still available for execution—only the automatic system prompt documentation is suppressed.

---

#### Tools Array Items

| Property      | Type   | Example                                                 |
| ------------- | ------ | ------------------------------------------------------- |
| `name`        | string | `{{tools[0].name}}` → `"bash"`                          |
| `description` | string | `{{tools[0].description}}` → `"Execute shell commands"` |
| `schema`      | object | `{{tools[0].schema}}`                                   |

#### Skills Array Items

| Property      | Type   | Example                                                                   |
| ------------- | ------ | ------------------------------------------------------------------------- |
| `name`        | string | `{{skills[0].name}}` → `"docker"`                                         |
| `description` | string | `{{skills[0].description}}` → `"Build and run containers"`                |
| `location`    | string | `{{skills[0].location}}` → `"/Users/me/.openclaw/skills/docker/SKILL.md"` |

#### ContextFiles Array Items

| Property    | Type    | Example                                                       |
| ----------- | ------- | ------------------------------------------------------------- |
| `path`      | string  | `{{contextFiles[0].path}}` → `"AGENTS.md"`                    |
| `content`   | string  | `{{contextFiles[0].content}}`                                 |
| `truncated` | boolean | `{% if contextFiles[0].truncated %}...[truncated]{% endif %}` |
| `maxChars`  | number  | `{{contextFiles[0].maxChars}}` → `20000`                      |

#### Documentation Object

| Property  | Type   | Example                                                                 |
| --------- | ------ | ----------------------------------------------------------------------- |
| `local`   | string | `{{documentation.local}}` → `"/Users/me/openclaw/docs"`                 |
| `npm`     | string | `{{documentation.npm}}` → `"/usr/local/lib/node_modules/openclaw/docs"` |
| `public`  | string | `{{documentation.public}}` → `"https://docs.openclaw.ai"`               |
| `repo`    | string | `{{documentation.repo}}` → `"https://github.com/openclaw/openclaw"`     |
| `discord` | string | `{{documentation.discord}}` → `"https://discord.gg/openclaw"`           |
| `clawhub` | string | `{{documentation.clawhub}}` → `"https://clawhub.com"`                   |

#### Sandbox Object

| Property       | Type    | Example                                                           |
| -------------- | ------- | ----------------------------------------------------------------- |
| `enabled`      | boolean | `{% if sandbox.enabled %}...{% endif %}`                          |
| `paths`        | object  | `{{sandbox.paths.root}}` → `"/tmp/sandbox"`                       |
| `paths.work`   | string  | `{{sandbox.paths.work}}` → `"/tmp/sandbox/work"`                  |
| `elevatedExec` | boolean | `{% if sandbox.elevatedExec %}elevated exec available{% endif %}` |

#### CurrentDateTime Object

| Property   | Type   | Example                                                   |
| ---------- | ------ | --------------------------------------------------------- |
| `iso`      | string | `{{currentDateTime.iso}}` → `"2025-02-03T14:30:00-05:00"` |
| `human`    | string | `{{currentDateTime.human}}` → `"Feb 3, 2025 2:30 PM EST"` |
| `timezone` | string | `{{currentDateTime.timezone}}` → `"America/New_York"`     |
| `format`   | string | `{{currentDateTime.format}}` → `"auto"`                   |

#### ReplyTags Object

| Property   | Type   | Example                                       |
| ---------- | ------ | --------------------------------------------- |
| `whatsapp` | string | `{{replyTags.whatsapp}}` → `"!msg Text here"` |
| `telegram` | string | `{{replyTags.telegram}}` → `"!tg Text here"`  |
| `signal`   | string | `{{replyTags.signal}}` → `"!s Text here"`     |
| `imessage` | string | `{{replyTags.imessage}}` → `"!i Text here"`   |
| `discord`  | string | `{{replyTags.discord}}` → `"!d Text here"`    |
| `slack`    | string | `{{replyTags.slack}}` → `"!sl Text here"`     |

#### Heartbeat Object

| Property       | Type   | Example                              |
| -------------- | ------ | ------------------------------------ |
| `prompt`       | string | `{{heartbeat.prompt}}`               |
| `ack`          | string | `{{heartbeat.ack}}`                  |
| `intervalSecs` | number | `{{heartbeat.intervalSecs}}` → `120` |

#### RuntimeInfo Object

| Property   | Type   | Example                                                            |
| ---------- | ------ | ------------------------------------------------------------------ |
| `host`     | string | `{{runtimeInfo.host}}` → `"MacBook-Pro.local"`                     |
| `os`       | string | `{{runtimeInfo.os}}` → `"macOS 14.4"`                              |
| `node`     | string | `{{runtimeInfo.node}}` → `"v22.3.0"`                               |
| `model`    | string | `{{runtimeInfo.model}}` → `"claude-sonnet-4-20250514"`             |
| `repoRoot` | string | `{{runtimeInfo.repoRoot}}` → `/Users/me/code/openclaw` (or `null`) |
| `thinking` | string | `{{runtimeInfo.thinking}}` → `"low"`                               |

#### Reasoning Object

| Property     | Type   | Example                                                                |
| ------------ | ------ | ---------------------------------------------------------------------- |
| `level`      | string | `{{reasoning.level}}` → `"show"` (one of: `"show"`, `"hide"`, `"off"`) |
| `toggleHint` | string | `{{reasoning.toggleHint}}`                                             |

#### ModelAliases Object

| Property | Type   | Example                                                  |
| -------- | ------ | -------------------------------------------------------- |
| `sonnet` | string | `{{modelAliases.sonnet}}` → `"claude-sonnet-4-20250514"` |
| `opus`   | string | `{{modelAliases.opus}}` → `"claude-opus-4-20250514"`     |
| `haiku`  | string | `{{modelAliases.haiku}}` → `"claude-haiku-4-20250514"`   |

### Nunjucks Quick Guide

**Conditionals:**

```jinja2
{% if promptMode == "full" %}
Full prompt content
{% endif %}

{% if sandbox.enabled %}
Sandbox is active
{% elif sandbox %}
Sandbox configured but disabled
{% endif %}
```

**Loops:**

```jinja2
{% for file in contextFiles %}
- {{file.path}}
{% endfor %}

{% for tool in tools %}
- {{tool.name}}: {{tool.description}}
{% endfor %}
```

**Comparisons:** `==`, `!=`, `<`, `>`, `<=`, `>=`

**Object access:** `{{sandbox.enabled}}`, `{{runtimeInfo.model}}`

**Array access:** `{{contextFiles[0].path}}` (bracket notation for indices)

**Booleans:** Render as `true`/`false` (lowercase)

---

OpenClaw builds a custom system prompt for every agent run. The prompt is **OpenClaw-owned** and does not use the p-coding-agent default prompt.

The prompt is assembled by OpenClaw and injected into each agent run.

## Structure

The prompt is intentionally compact and uses fixed sections:

- **Tooling**: current tool list + short descriptions.
- **Safety**: short guardrail reminder to avoid power-seeking behavior or bypassing oversight.
- **Skills** (when available): tells the model how to load skill instructions on demand.
- **OpenClaw Self-Update**: how to run `config.apply` and `update.run`.
- **Workspace**: working directory (`agents.defaults.workspace`).
- **Documentation**: local path to OpenClaw docs (repo or npm package) and when to read them.
- **Workspace Files (injected)**: indicates bootstrap files are included below.
- **Sandbox** (when enabled): indicates sandboxed runtime, sandbox paths, and whether elevated exec is available.
- **Current Date & Time**: user-local time, timezone, and time format.
- **Reply Tags**: optional reply tag syntax for supported providers.
- **Heartbeats**: heartbeat prompt and ack behavior.
- **Runtime**: host, OS, node, model, repo root (when detected), thinking level (one line).
- **Reasoning**: current visibility level + /reasoning toggle hint.

Safety guardrails in the system prompt are advisory. They guide model behavior but do not enforce policy. Use tool policy, exec approvals, sandboxing, and channel allowlists for hard enforcement; operators can disable these by design.

## Prompt modes

OpenClaw can render smaller system prompts for sub-agents. The runtime sets a
`promptMode` for each run (not a user-facing config):

- `full` (default): includes all sections above.
- `minimal`: used for sub-agents; omits **Skills**, **Memory Recall**, **OpenClaw
  Self-Update**, **Model Aliases**, **User Identity**, **Reply Tags**,
  **Messaging**, **Silent Replies**, and **Heartbeats**. Tooling, **Safety**,
  Workspace, Sandbox, Current Date & Time (when known), Runtime, and injected
  context stay available.
- `none`: returns only the base identity line.

When `promptMode=minimal`, extra injected prompts are labeled **Subagent
Context** instead of **Group Chat Context**.

## Workspace bootstrap injection

Bootstrap files are trimmed and appended under **Project Context** so the model sees identity and profile context without needing explicit reads:

- `AGENTS.md`
- `SOUL.md`
- `TOOLS.md`
- `IDENTITY.md`
- `USER.md`
- `HEARTBEAT.md`
- `BOOTSTRAP.md` (only on brand-new workspaces)

Large files are truncated with a marker. The max per-file size is controlled by
`agents.defaults.bootstrapMaxChars` (default: 20000). Missing files inject a
short missing-file marker.

Internal hooks can intercept this step via `agent:bootstrap` to mutate or replace
the injected bootstrap files (for example swapping `SOUL.md` for an alternate persona).

To inspect how much each injected file contributes (raw vs injected, truncation, plus tool schema overhead), use `/context list` or `/context detail`. See [Context](/concepts/context).

## Time handling

The system prompt includes a dedicated **Current Date & Time** section when the
user timezone is known. To keep the prompt cache-stable, it now only includes
the **time zone** (no dynamic clock or time format).

Use `session_status` when the agent needs the current time; the status card
includes a timestamp line.

Configure with:

- `agents.defaults.userTimezone`
- `agents.defaults.timeFormat` (`auto` | `12` | `24`)

See [Date & Time](/date-time) for full behavior details.

## Skills

When eligible skills exist, OpenClaw injects a compact **available skills list**
(`formatSkillsForPrompt`) that includes the **file path** for each skill. The
prompt instructs the model to use `read` to load the SKILL.md at the listed
location (workspace, managed, or bundled). If no skills are eligible, the
Skills section is omitted.

```
<available_skills>
  <skill>
    <name>...</name>
    <description>...</description>
    <location>...</location>
  </skill>
</available_skills>
```

This keeps the base prompt small while still enabling targeted skill usage.

## Documentation

When available, the system prompt includes a **Documentation** section that points to the
local OpenClaw docs directory (either `docs/` in the repo workspace or the bundled npm
package docs) and also notes the public mirror, source repo, community Discord, and
ClawHub (https://clawhub.com) for skills discovery. The prompt instructs the model to consult local docs first
for OpenClaw behavior, commands, configuration, or architecture, and to run
`openclaw status` itself when possible (asking the user only when it lacks access).
