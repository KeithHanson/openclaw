import * as fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import type { ReasoningLevel, ThinkLevel } from "../auto-reply/thinking.js";
import type { MemoryCitationsMode } from "../config/types.memory.js";
import type { ResolvedTimeFormat } from "./date-time.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import { SILENT_REPLY_TOKEN } from "../auto-reply/tokens.js";
import { listDeliverableMessageChannels } from "../utils/message-channel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TemplateContext {
  workspaceDir: string;
  docsPath?: string;
  sandboxEnabled?: boolean;
  sandboxWorkspaceDir?: string;
  sandboxAgentWorkspaceMount?: string;
  hasGateway?: boolean;
  isMinimal: boolean;
  promptMode: string;
  ownerLine?: string;
  userTimezone?: string;
  heartbeatPrompt?: string;
  reasoningLevel?: string;
  defaultThinkLevel?: string;
  modelAliasLines?: string[];
  workspaceNotes?: string[];
  extraSystemPrompt?: string;
  reactionGuidance?: { level: string; channel: string } | null;
  runtimeInfo?: {
    agentId?: string;
    host?: string;
    os?: string;
    arch?: string;
    node?: string;
    model?: string;
    defaultModel?: string;
    repoRoot?: string;
    channel?: string;
    capabilities?: string[];
  };
  contextFiles?: { path: string; content: string }[];
  messageChannelOptions?: string;
  inlineButtonsEnabled?: boolean;
  runtimeChannel?: string;
  ttsHint?: string;
  messageToolHints?: string[];
  toolList?: string;
  execToolName?: string;
  processToolName?: string;
  readToolName?: string;
  availableTools?: Set<string>;
}

function readSystemTemplateSync(agentDir: string): string | null {
  const templatePath = path.join(agentDir, "SYSTEM.md");
  try {
    return fsSync.readFileSync(templatePath, "utf-8");
  } catch {
    return null;
  }
}

function renderTemplate(template: string, context: TemplateContext): string {
  nunjucks.configure({ autoescape: false });
  return nunjucks.renderString(template, context);
}

/**
 * Controls which hardcoded sections are included in the system prompt.
 * - "full": All sections (default, for main agent)
 * - "minimal": Reduced sections (Tooling, Workspace, Runtime) - used for subagents
 * - "none": Just basic identity line, no sections
 */
export type PromptMode = "full" | "minimal" | "none";

function buildSkillsSection(params: {
  skillsPrompt?: string;
  isMinimal: boolean;
  readToolName: string;
}) {
  if (params.isMinimal) {
    return [];
  }
  const trimmed = params.skillsPrompt?.trim();
  if (!trimmed) {
    return [];
  }
  return [
    "## Skills (mandatory)",
    "Before replying: scan <available_skills> <description> entries.",
    `- If exactly one skill clearly applies: read its SKILL.md at <location> with \`${params.readToolName}\`, then follow it.`,
    "- If multiple could apply: choose the most specific one, then read/follow it.",
    "- If none clearly apply: do not read any SKILL.md.",
    "Constraints: never read more than one skill up front; only read after selecting.",
    trimmed,
    "",
  ];
}

function buildMemorySection(params: {
  isMinimal: boolean;
  availableTools: Set<string>;
  citationsMode?: MemoryCitationsMode;
}) {
  if (params.isMinimal) {
    return [];
  }
  if (!params.availableTools.has("memory_search") && !params.availableTools.has("memory_get")) {
    return [];
  }
  const lines = [
    "## Memory Recall",
    "Before answering anything about prior work, decisions, dates, people, preferences, or todos: run memory_search on MEMORY.md + memory/*.md; then use memory_get to pull only the needed lines. If low confidence after search, say you checked.",
  ];
  if (params.citationsMode === "off") {
    lines.push(
      "Citations are disabled: do not mention file paths or line numbers in replies unless the user explicitly asks.",
    );
  } else {
    lines.push(
      "Citations: include Source: <path#line> when it helps the user verify memory snippets.",
    );
  }
  lines.push("");
  return lines;
}

function buildUserIdentitySection(ownerLine: string | undefined, isMinimal: boolean) {
  if (!ownerLine || isMinimal) {
    return [];
  }
  return ["## User Identity", ownerLine, ""];
}

function buildTimeSection(params: { userTimezone?: string }) {
  if (!params.userTimezone) {
    return [];
  }
  return [
    "## Current Date & Time",
    `Time zone: ${params.userTimezone}`,
    "If you need the current date, time, or day of week, run session_status (📊 session_status).",
    "",
  ];
}

function buildReplyTagsSection(isMinimal: boolean) {
  if (isMinimal) {
    return [];
  }
  return [
    "## Reply Tags",
    "To request a native reply/quote on supported surfaces, include one tag in your reply:",
    "- [[reply_to_current]] replies to the triggering message.",
    "- [[reply_to:<id>]] replies to a specific message id when you have it.",
    "Whitespace inside the tag is allowed (e.g. [[ reply_to_current ]] / [[ reply_to: 123 ]]).",
    "Tags are stripped before sending; support depends on the current channel config.",
    "",
  ];
}

function buildMessagingSection(params: {
  isMinimal: boolean;
  availableTools: Set<string>;
  messageChannelOptions: string;
  inlineButtonsEnabled: boolean;
  runtimeChannel?: string;
  messageToolHints?: string[];
}) {
  if (params.isMinimal) {
    return [];
  }
  return [
    "## Messaging",
    "- Reply in current session → automatically routes to the source channel (Signal, Telegram, etc.)",
    "- Cross-session messaging → use sessions_send(sessionKey, message)",
    "- Never use exec/curl for provider messaging; OpenClaw handles all routing internally.",
    params.availableTools.has("message")
      ? [
          "",
          "### message tool",
          "- Use `message` for proactive sends + channel actions (polls, reactions, etc.).",
          "- For `action=send`, include `to` and `message`.",
          `- If multiple channels are configured, pass \`channel\` (${params.messageChannelOptions}).`,
          `- If you use \`message\` (\`action=send\`) to deliver your user-visible reply, respond with ONLY: ${SILENT_REPLY_TOKEN} (avoid duplicate replies).`,
          params.inlineButtonsEnabled
            ? "- Inline buttons supported. Use `action=send` with `buttons=[[{text,callback_data}]]` (callback_data routes back as a user message)."
            : params.runtimeChannel
              ? `- Inline buttons not enabled for ${params.runtimeChannel}. If you need them, ask to set ${params.runtimeChannel}.capabilities.inlineButtons ("dm"|"group"|"all"|"allowlist").`
              : "",
          ...(params.messageToolHints ?? []),
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    "",
  ];
}

function buildVoiceSection(params: { isMinimal: boolean; ttsHint?: string }) {
  if (params.isMinimal) {
    return [];
  }
  const hint = params.ttsHint?.trim();
  if (!hint) {
    return [];
  }
  return ["## Voice (TTS)", hint, ""];
}

function buildDocsSection(params: { docsPath?: string; isMinimal: boolean; readToolName: string }) {
  const docsPath = params.docsPath?.trim();
  if (!docsPath || params.isMinimal) {
    return [];
  }
  return [
    "## Documentation",
    `OpenClaw docs: ${docsPath}`,
    "Mirror: https://docs.molt.bot",
    "Source: https://github.com/moltbot/moltbot",
    "Community: https://discord.com/invite/clawd",
    "Find new skills: https://clawdhub.com",
    "For OpenClaw behavior, commands, config, or architecture: consult local docs first.",
    "When diagnosing issues, run `moltbot status` yourself when possible; only ask the user if you lack access (e.g., sandboxed).",
    "",
  ];
}

function buildBasicIdentitySection() {
  return ["You are a personal assistant running inside OpenClaw.", ""];
}

function buildToolingSection(params: {
  toolLines: string[];
  execToolName: string;
  processToolName: string;
  isMinimal: boolean;
}) {
  if (params.isMinimal) {
    return [];
  }
  const toolContent =
    params.toolLines.length > 0
      ? params.toolLines.join("\n")
      : [
          "Pi lists the standard tools above. This runtime enables:",
          "- grep: search file contents for patterns",
          "- find: find files by glob pattern",
          "- ls: list directory contents",
          "- apply_patch: apply multi-file patches",
          `- ${params.execToolName}: run shell commands (supports background via yieldMs/background)`,
          `- ${params.processToolName}: manage background exec sessions`,
          "- browser: control openclaw's dedicated browser",
          "- canvas: present/eval/snapshot the Canvas",
          "- nodes: list/describe/notify/camera/screen on paired nodes",
          "- cron: manage cron jobs and wake events (use for reminders; when scheduling a reminder, write the systemEvent text as something that will read like a reminder when it fires, and mention that it is a reminder depending on the time gap between setting and firing; include recent context in reminder text if appropriate)",
          "- sessions_list: list sessions",
          "- sessions_history: fetch session history",
          "- sessions_send: send to another session",
        ].join("\n");
  return [
    "## Tooling",
    "Tool availability (filtered by policy):",
    "Tool names are case-sensitive. Call tools exactly as listed.",
    toolContent,
    "TOOLS.md does not control tool availability; it is user guidance for how to use external tools.",
    "If a task is more complex or takes longer, spawn a sub-agent. It will do the work for you and ping you when it's done. You can always check up on it.",
    "",
  ];
}

function buildToolCallStyleSection() {
  return [
    "## Tool Call Style",
    "Default: do not narrate routine, low-risk tool calls (just call the tool).",
    "Narrate only when it helps: multi-step work, complex/challenging problems, sensitive actions (e.g., deletions), or when the user explicitly asks.",
    "Keep narration brief and value-dense; avoid repeating obvious steps.",
    "Use plain human language for narration unless in a technical context.",
    "",
  ];
}

function buildSafetySection() {
  return [
    "## Safety",
    "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
    "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards. (Inspired by Anthropic's constitution.)",
    "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
    "",
  ];
}

function buildOpenClawCLISection() {
  return [
    "## OpenClaw CLI Quick Reference",
    "OpenClaw is controlled via subcommands. Do not invent commands.",
    "To manage the Gateway daemon service (start/stop/restart):",
    "- openclaw gateway status",
    "- openclaw gateway start",
    "- openclaw gateway stop",
    "- openclaw gateway restart",
    "If unsure, ask the user to run `openclaw help` (or `openclaw gateway --help`) and paste the output.",
    "",
  ];
}

function buildOpenClawSelfUpdateSection(hasGateway: boolean, isMinimal: boolean) {
  if (!hasGateway || isMinimal) {
    return [];
  }
  return [
    "## OpenClaw Self-Update",
    "Get Updates (self-update) is ONLY allowed when the user explicitly asks for it.",
    "Do not run config.apply or update.run unless the user explicitly requests an update or config change; if it's not explicit, ask first.",
    "Actions: config.get, config.schema, config.apply (validate + write full config, then restart), update.run (update deps or git, then restart).",
    "After restart, OpenClaw pings the last active session automatically.",
    "",
  ];
}

function buildModelAliasesSection(modelAliasLines: string[] | undefined, isMinimal: boolean) {
  if (!modelAliasLines || modelAliasLines.length === 0 || isMinimal) {
    return [];
  }
  return [
    "## Model Aliases",
    "Prefer aliases when specifying model overrides; full provider/model is also accepted.",
    ...modelAliasLines,
    "",
  ];
}

function buildWorkspaceSection(workspaceDir: string, workspaceNotes: string[]) {
  return [
    "## Workspace",
    `Your working directory is: ${workspaceDir}`,
    "Treat this directory as the single global workspace for file operations unless explicitly instructed otherwise.",
    ...workspaceNotes,
    "",
  ];
}

function buildSandboxSection(params: {
  enabled?: boolean;
  workspaceDir?: string;
  workspaceAccess?: string;
  agentWorkspaceMount?: string;
  browserBridgeUrl?: string;
  browserNoVncUrl?: string;
  hostBrowserAllowed?: boolean;
  elevated?: { allowed?: boolean; defaultLevel?: string };
}) {
  if (!params.enabled) {
    return [];
  }
  const lines: string[] = ["## Sandbox"];
  lines.push("You are running in a sandboxed runtime (tools execute in Docker).");
  lines.push("Some tools may be unavailable due to sandbox policy.");
  lines.push(
    "Sub-agents stay sandboxed (no elevated/host access). Need outside-sandbox read/write? Don't spawn; ask first.",
  );
  if (params.workspaceDir) {
    lines.push(`Sandbox workspace: ${params.workspaceDir}`);
  }
  if (params.workspaceAccess) {
    lines.push(
      `Agent workspace access: ${params.workspaceAccess}${
        params.agentWorkspaceMount ? ` (mounted at ${params.agentWorkspaceMount})` : ""
      }`,
    );
  }
  if (params.browserBridgeUrl) {
    lines.push("Sandbox browser: enabled.");
  }
  if (params.browserNoVncUrl) {
    lines.push(`Sandbox browser observer (noVNC): ${params.browserNoVncUrl}`);
  }
  if (params.hostBrowserAllowed === true) {
    lines.push("Host browser control: allowed.");
  } else if (params.hostBrowserAllowed === false) {
    lines.push("Host browser control: blocked.");
  }
  if (params.elevated?.allowed) {
    lines.push("Elevated exec is available for this session.");
    lines.push("User can toggle with /elevated on|off|ask|full.");
    lines.push("You may also send /elevated on|off|ask|full when needed.");
    lines.push(
      `Current elevated level: ${params.elevated.defaultLevel} (ask runs exec on host with approvals; full auto-approves).`,
    );
  }
  return lines.filter(Boolean).concat("");
}

function buildReactionsSection(
  reactionGuidance: { level: string; channel: string } | null | undefined,
) {
  if (!reactionGuidance) {
    return [];
  }
  const { level, channel } = reactionGuidance;
  const guidanceText =
    level === "minimal"
      ? [
          `Reactions are enabled for ${channel} in MINIMAL mode.`,
          "React ONLY when truly relevant:",
          "- Acknowledge important user requests or confirmations",
          "- Express genuine sentiment (humor, appreciation) sparingly",
          "- Avoid reacting to routine messages or your own replies",
          "Guideline: at most 1 reaction per 5-10 exchanges.",
        ].join("\n")
      : [
          `Reactions are enabled for ${channel} in EXTENSIVE mode.`,
          "Feel free to react liberally:",
          "- Acknowledge messages with appropriate emojis",
          "- Express sentiment and personality through reactions",
          "- React to interesting content, humor, or notable events",
          "- Use reactions to confirm understanding or agreement",
          "Guideline: react whenever it feels natural.",
        ].join("\n");
  return ["## Reactions", guidanceText, ""];
}

function buildReasoningFormatSection(reasoningHint: string | undefined) {
  if (!reasoningHint) {
    return [];
  }
  return ["## Reasoning Format", reasoningHint, ""];
}

function buildProjectContextSection(contextFiles: { path: string; content: string }[] | undefined) {
  if (!contextFiles || contextFiles.length === 0) {
    return [];
  }
  const hasSoulFile = contextFiles.some((file) => {
    const normalizedPath = file.path.trim().replace(/\\/g, "/");
    const baseName = normalizedPath.split("/").pop() ?? normalizedPath;
    return baseName.toLowerCase() === "soul.md";
  });
  const lines: string[] = [
    "# Project Context",
    "",
    "The following project context files have been loaded:",
  ];
  if (hasSoulFile) {
    lines.push(
      "If SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it.",
    );
  }
  lines.push("");
  for (const file of contextFiles) {
    lines.push(`## ${file.path}`, "", file.content, "");
  }
  return lines;
}

function buildSilentRepliesSection(isMinimal: boolean) {
  if (isMinimal) {
    return [];
  }
  return [
    "## Silent Replies",
    `When you have nothing to say, respond with ONLY: ${SILENT_REPLY_TOKEN}`,
    "",
    "⚠️ Rules:",
    "- It must be your ENTIRE message — nothing else",
    `- Never append it to an actual response (never include "${SILENT_REPLY_TOKEN}" in real replies)`,
    "- Never wrap it in markdown or code blocks",
    "",
    `❌ Wrong: "Here's help... ${SILENT_REPLY_TOKEN}"`,
    `❌ Wrong: "${SILENT_REPLY_TOKEN}"`,
    `✅ Right: ${SILENT_REPLY_TOKEN}`,
    "",
  ];
}

function buildHeartbeatsSection(heartbeatPrompt: string | undefined, isMinimal: boolean) {
  if (isMinimal) {
    return [];
  }
  const promptLine = heartbeatPrompt
    ? `Heartbeat prompt: ${heartbeatPrompt}`
    : "Heartbeat prompt: (configured)";
  return [
    "## Heartbeats",
    promptLine,
    "If you receive a heartbeat poll (a user message matching the heartbeat prompt above), and there is nothing that needs attention, reply exactly:",
    "HEARTBEAT_OK",
    'OpenClaw treats a leading/trailing "HEARTBEAT_OK" as a heartbeat ack (and may discard it).',
    'If something needs attention, do NOT include "HEARTBEAT_OK"; reply with the alert text instead.',
    "",
  ];
}

function buildRuntimeSection(
  runtimeLine: string,
  reasoningLevel: string,
  _defaultThinkLevel: ThinkLevel | undefined,
) {
  return [
    "## Runtime",
    runtimeLine,
    `Reasoning: ${reasoningLevel} (hidden unless on/stream). Toggle /reasoning; /status shows Reasoning when enabled.`,
  ];
}

function buildExtraSystemPromptSection(extraSystemPrompt: string | undefined, promptMode: string) {
  if (!extraSystemPrompt) {
    return [];
  }
  const contextHeader = promptMode === "minimal" ? "## Subagent Context" : "## Group Chat Context";
  return [contextHeader, extraSystemPrompt, ""];
}

export function buildAgentSystemPrompt(params: {
  workspaceDir: string;
  defaultThinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  reasoningTagHint?: boolean;
  toolNames?: string[];
  toolSummaries?: Record<string, string>;
  modelAliasLines?: string[];
  userTimezone?: string;
  userTime?: string;
  userTimeFormat?: ResolvedTimeFormat;
  contextFiles?: EmbeddedContextFile[];
  skillsPrompt?: string;
  heartbeatPrompt?: string;
  docsPath?: string;
  workspaceNotes?: string[];
  ttsHint?: string;
  /** Controls which hardcoded sections to include. Defaults to "full". */
  promptMode?: PromptMode;
  runtimeInfo?: {
    agentId?: string;
    host?: string;
    os?: string;
    arch?: string;
    node?: string;
    model?: string;
    defaultModel?: string;
    channel?: string;
    capabilities?: string[];
    repoRoot?: string;
  };
  messageToolHints?: string[];
  sandboxInfo?: {
    enabled: boolean;
    workspaceDir?: string;
    workspaceAccess?: "none" | "ro" | "rw";
    agentWorkspaceMount?: string;
    browserBridgeUrl?: string;
    browserNoVncUrl?: string;
    hostBrowserAllowed?: boolean;
    elevated?: {
      allowed: boolean;
      defaultLevel: "on" | "off" | "ask" | "full";
    };
  };
  /** Reaction guidance for the agent (for Telegram minimal/extensive modes). */
  reactionGuidance?: {
    level: "minimal" | "extensive";
    channel: string;
  };
  memoryCitationsMode?: MemoryCitationsMode;
}) {
  const coreToolSummaries: Record<string, string> = {
    read: "Read file contents",
    write: "Create or overwrite files",
    edit: "Make precise edits to files",
    apply_patch: "Apply multi-file patches",
    grep: "Search file contents for patterns",
    find: "Find files by glob pattern",
    ls: "List directory contents",
    exec: "Run shell commands (pty available for TTY-required CLIs)",
    process: "Manage background exec sessions",
    web_search: "Search the web (Brave API)",
    web_fetch: "Fetch and extract readable content from a URL",
    // Channel docking: add login tools here when a channel needs interactive linking.
    browser: "Control web browser",
    canvas: "Present/eval/snapshot the Canvas",
    nodes: "List/describe/notify/camera/screen on paired nodes",
    cron: "Manage cron jobs and wake events (use for reminders; when scheduling a reminder, write the systemEvent text as something that will read like a reminder when it fires, and mention that it is a reminder depending on the time gap between setting and firing; include recent context in reminder text if appropriate)",
    message: "Send messages and channel actions",
    gateway: "Restart, apply config, or run updates on the running OpenClaw process",
    agents_list: "List agent ids allowed for sessions_spawn",
    sessions_list: "List other sessions (incl. sub-agents) with filters/last",
    sessions_history: "Fetch history for another session/sub-agent",
    sessions_send: "Send a message to another session/sub-agent",
    sessions_spawn: "Spawn a sub-agent session",
    session_status:
      "Show a /status-equivalent status card (usage + time + Reasoning/Verbose/Elevated); use for model-use questions (📊 session_status); optional per-session model override",
    image: "Analyze an image with the configured image model",
  };

  const toolOrder = [
    "read",
    "write",
    "edit",
    "apply_patch",
    "grep",
    "find",
    "ls",
    "exec",
    "process",
    "web_search",
    "web_fetch",
    "browser",
    "canvas",
    "nodes",
    "cron",
    "message",
    "gateway",
    "agents_list",
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "session_status",
    "image",
  ];

  const rawToolNames = (params.toolNames ?? []).map((tool) => tool.trim());
  const canonicalToolNames = rawToolNames.filter(Boolean);
  // Preserve caller casing while deduping tool names by lowercase.
  const canonicalByNormalized = new Map<string, string>();
  for (const name of canonicalToolNames) {
    const normalized = name.toLowerCase();
    if (!canonicalByNormalized.has(normalized)) {
      canonicalByNormalized.set(normalized, name);
    }
  }
  const resolveToolName = (normalized: string) =>
    canonicalByNormalized.get(normalized) ?? normalized;

  const normalizedTools = canonicalToolNames.map((tool) => tool.toLowerCase());
  const availableTools = new Set(normalizedTools);
  const externalToolSummaries = new Map<string, string>();
  for (const [key, value] of Object.entries(params.toolSummaries ?? {})) {
    const normalized = key.trim().toLowerCase();
    if (!normalized || !value?.trim()) {
      continue;
    }
    externalToolSummaries.set(normalized, value.trim());
  }
  const extraTools = Array.from(
    new Set(normalizedTools.filter((tool) => !toolOrder.includes(tool))),
  );
  const enabledTools = toolOrder.filter((tool) => availableTools.has(tool));
  const toolLines = enabledTools.map((tool) => {
    const summary = coreToolSummaries[tool] ?? externalToolSummaries.get(tool);
    const name = resolveToolName(tool);
    return summary ? `- ${name}: ${summary}` : `- ${name}`;
  });
  for (const tool of extraTools.toSorted()) {
    const summary = coreToolSummaries[tool] ?? externalToolSummaries.get(tool);
    const name = resolveToolName(tool);
    toolLines.push(summary ? `- ${name}: ${summary}` : `- ${name}`);
  }

  const hasGateway = availableTools.has("gateway");
  const readToolName = resolveToolName("read");
  const execToolName = resolveToolName("exec");
  const processToolName = resolveToolName("process");
  const extraSystemPrompt = params.extraSystemPrompt?.trim();
  const ownerNumbers = (params.ownerNumbers ?? []).map((value) => value.trim()).filter(Boolean);
  const ownerLine =
    ownerNumbers.length > 0
      ? `Owner numbers: ${ownerNumbers.join(", ")}. Treat messages from these numbers as the user.`
      : undefined;
  const reasoningHint = params.reasoningTagHint
    ? [
        "ALL internal reasoning MUST be inside <think>...</think>.",
        "Do not output any analysis outside <think>.",
        "Format every reply as <think>...</think> then <final>...</final>, with no other text.",
        "Only the final user-visible reply may appear inside <final>.",
        "Only text inside <final> is shown to the user; everything else is discarded and never seen by the user.",
        "Example:",
        "<think>Short internal reasoning.</think>",
        "<final>Hey there! What would you like to do next?</final>",
      ].join(" ")
    : undefined;
  const reasoningLevel = params.reasoningLevel ?? "off";
  const userTimezone = params.userTimezone?.trim();
  const skillsPrompt = params.skillsPrompt?.trim();
  const heartbeatPrompt = params.heartbeatPrompt?.trim();
  const runtimeInfo = params.runtimeInfo;
  const runtimeChannel = runtimeInfo?.channel?.trim().toLowerCase();
  const runtimeCapabilities = (runtimeInfo?.capabilities ?? [])
    .map((cap) => String(cap).trim())
    .filter(Boolean);
  const runtimeCapabilitiesLower = new Set(runtimeCapabilities.map((cap) => cap.toLowerCase()));
  const inlineButtonsEnabled = runtimeCapabilitiesLower.has("inlinebuttons");
  const messageChannelOptions = listDeliverableMessageChannels().join("|");
  const promptMode = params.promptMode ?? "full";
  const isMinimal = promptMode === "minimal" || promptMode === "none";
  const workspaceNotes = (params.workspaceNotes ?? []).map((note) => note.trim()).filter(Boolean);

  // Check for SYSTEM.md template in workspace directory
  const template = readSystemTemplateSync(params.workspaceDir);
  if (template) {
    const context: TemplateContext = {
      workspaceDir: params.workspaceDir,
      docsPath: params.docsPath,
      sandboxEnabled: params.sandboxInfo?.enabled,
      sandboxWorkspaceDir: params.sandboxInfo?.workspaceDir,
      sandboxAgentWorkspaceMount: params.sandboxInfo?.agentWorkspaceMount,
      hasGateway,
      isMinimal,
      promptMode,
      ownerLine,
      userTimezone,
      heartbeatPrompt,
      reasoningLevel: params.reasoningLevel,
      defaultThinkLevel: params.defaultThinkLevel,
      modelAliasLines: params.modelAliasLines,
      workspaceNotes,
      extraSystemPrompt: params.extraSystemPrompt,
      reactionGuidance: params.reactionGuidance ?? null,
      runtimeInfo: params.runtimeInfo,
      contextFiles: params.contextFiles,
      messageChannelOptions,
      inlineButtonsEnabled,
      runtimeChannel,
      ttsHint: params.ttsHint,
      messageToolHints: params.messageToolHints,
      toolList: toolLines.join("\n"),
      execToolName,
      processToolName,
      readToolName,
      availableTools,
    };
    return renderTemplate(template, context);
  }

  // For "none" mode, return just the basic identity line
  if (promptMode === "none") {
    return "You are a personal assistant running inside OpenClaw.";
  }

  const lines = [
    "You are a personal assistant running inside OpenClaw.",
    "",
    ...buildToolingSection({
      toolLines,
      execToolName,
      processToolName,
      isMinimal,
    }),
    ...buildToolCallStyleSection(),
    ...buildSafetySection(),
    ...buildOpenClawCLISection(),
    ...buildOpenClawSelfUpdateSection(hasGateway, isMinimal),
    ...buildModelAliasesSection(params.modelAliasLines, isMinimal),
    ...buildSkillsSection({
      skillsPrompt,
      isMinimal,
      readToolName,
    }),
    ...buildMemorySection({
      isMinimal,
      availableTools,
      citationsMode: params.memoryCitationsMode,
    }),
    ...buildWorkspaceSection(params.workspaceDir, workspaceNotes),
    ...buildDocsSection({
      docsPath: params.docsPath,
      isMinimal,
      readToolName,
    }),
    ...buildSandboxSection(params.sandboxInfo ?? { enabled: false }),
    ...buildUserIdentitySection(ownerLine, isMinimal),
    ...buildTimeSection({
      userTimezone,
    }),
    "## Workspace Files (injected)",
    "These user-editable files are loaded by OpenClaw and included below in Project Context.",
    "",
    ...buildReplyTagsSection(isMinimal),
    ...buildMessagingSection({
      isMinimal,
      availableTools,
      messageChannelOptions,
      inlineButtonsEnabled,
      runtimeChannel,
      messageToolHints: params.messageToolHints,
    }),
    ...buildVoiceSection({ isMinimal, ttsHint: params.ttsHint }),
    ...buildProjectContextSection(params.contextFiles),
    ...buildExtraSystemPromptSection(extraSystemPrompt, promptMode),
  ];

  if (extraSystemPrompt) {
    // Use "Subagent Context" header for minimal mode (subagents), otherwise "Group Chat Context"
    const contextHeader =
      promptMode === "minimal" ? "## Subagent Context" : "## Group Chat Context";
    lines.push(contextHeader, extraSystemPrompt, "");
  }
  lines.push(...buildReactionsSection(params.reactionGuidance));
  lines.push(...buildReasoningFormatSection(reasoningHint));

  // Skip silent replies for subagent/none modes
  if (!isMinimal) {
    lines.push(...buildSilentRepliesSection(isMinimal));
  }

  // Skip heartbeats for subagent/none modes
  if (!isMinimal) {
    lines.push(...buildHeartbeatsSection(heartbeatPrompt, isMinimal));
  }

  lines.push(
    ...buildRuntimeSection(
      buildRuntimeLine(runtimeInfo, runtimeChannel, runtimeCapabilities, params.defaultThinkLevel),
      reasoningLevel,
      params.defaultThinkLevel,
    ),
  );

  return lines.filter(Boolean).join("\n");
}

export function buildRuntimeLine(
  runtimeInfo?: {
    agentId?: string;
    host?: string;
    os?: string;
    arch?: string;
    node?: string;
    model?: string;
    defaultModel?: string;
    repoRoot?: string;
  },
  runtimeChannel?: string,
  runtimeCapabilities: string[] = [],
  defaultThinkLevel?: ThinkLevel,
): string {
  return `Runtime: ${[
    runtimeInfo?.agentId ? `agent=${runtimeInfo.agentId}` : "",
    runtimeInfo?.host ? `host=${runtimeInfo.host}` : "",
    runtimeInfo?.repoRoot ? `repo=${runtimeInfo.repoRoot}` : "",
    runtimeInfo?.os
      ? `os=${runtimeInfo.os}${runtimeInfo?.arch ? ` (${runtimeInfo.arch})` : ""}`
      : runtimeInfo?.arch
        ? `arch=${runtimeInfo.arch}`
        : "",
    runtimeInfo?.node ? `node=${runtimeInfo.node}` : "",
    runtimeInfo?.model ? `model=${runtimeInfo.model}` : "",
    runtimeInfo?.defaultModel ? `default_model=${runtimeInfo.defaultModel}` : "",
    runtimeChannel ? `channel=${runtimeChannel}` : "",
    runtimeChannel
      ? `capabilities=${runtimeCapabilities.length > 0 ? runtimeCapabilities.join(",") : "none"}`
      : "",
    `thinking=${defaultThinkLevel ?? "off"}`,
  ]
    .filter(Boolean)
    .join(" | ")}`;
}
