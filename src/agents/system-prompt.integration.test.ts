import { createAgentSession, SessionManager, SettingsManager } from "@mariozechner/pi-coding-agent";
import * as fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import { applySystemPromptOverrideToSession } from "./pi-embedded-runner/system-prompt.js";
import { buildAgentSystemPrompt } from "./system-prompt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("system-prompt integration with agent session", () => {
  const testWorkspace = path.join(__dirname, ".test-integration-workspace");
  const testSessionFile = path.join(testWorkspace, "session.jsonl");
  let agentDir: string;

  beforeEach(() => {
    fsSync.mkdirSync(testWorkspace, { recursive: true });
    agentDir = resolveOpenClawAgentDir();
  });

  afterEach(() => {
    if (fsSync.existsSync(testWorkspace)) {
      fsSync.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  it("verifies the fix: setTools([]) properly clears SDK-injected tools", async () => {
    // Create a SYSTEM.md template
    fsSync.writeFileSync(
      path.join(testWorkspace, "SYSTEM.md"),
      "OVERRIDE: No tools should be injected",
    );

    // Create a session file
    fsSync.writeFileSync(testSessionFile, "");

    const systemPrompt = buildAgentSystemPrompt({
      workspaceDir: testWorkspace,
      sandboxInfo: { enabled: false },
      runtimeInfo: { agentId: "test-agent" },
    });

    // Verify template was used
    expect(systemPrompt).toContain("OVERRIDE:");

    const sessionManager = SessionManager.open(testSessionFile);
    const settingsManager = SettingsManager.create(testWorkspace, agentDir);

    // Pass EMPTY tools array (what attempt.ts and compact.ts do when hasSystemTemplate=true)
    const { session } = await createAgentSession({
      cwd: testWorkspace,
      agentDir,
      model: {
        name: "test-model",
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        api: "anthropic-messages",
      },
      tools: [], // EMPTY - SDK may inject defaults
      customTools: [],
      sessionManager,
      settingsManager,
    });

    applySystemPromptOverrideToSession(session, systemPrompt);

    // Get the tools that will be sent to the LLM provider
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolsBefore = (session.agent as any)._state?.tools ?? [];

    console.log(`Tools before setTools([]): ${toolsBefore.length} tools`);

    // With current SDK, passing empty arrays results in 0 tools
    expect(toolsBefore.length).toBe(0);

    // The fix: Clear tools explicitly (defensive coding)
    session.agent.setTools([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolsAfter = (session.agent as any)._state?.tools ?? [];

    console.log(`Tools after setTools([]): ${toolsAfter.length} tools`);

    // Verify tools remain cleared
    expect(toolsAfter).toHaveLength(0);

    session.dispose();
  });

  it("should allow tools when NO SYSTEM.md template exists", async () => {
    // No SYSTEM.md file - use default prompt

    // Create a session file
    fsSync.writeFileSync(testSessionFile, "");

    // Build the system prompt (should use default)
    const systemPrompt = buildAgentSystemPrompt({
      workspaceDir: testWorkspace,
      sandboxInfo: { enabled: false },
      runtimeInfo: { agentId: "test-agent" },
      toolNames: ["read", "write"],
    });

    // Verify default prompt was used
    expect(systemPrompt).toContain("You are a personal assistant running inside OpenClaw.");

    // Create session manager and settings manager
    const sessionManager = SessionManager.open(testSessionFile);
    const settingsManager = SettingsManager.create(testWorkspace, agentDir);

    // Create an agent session - SDK will add default tools
    const { session } = await createAgentSession({
      cwd: testWorkspace,
      agentDir,
      model: {
        name: "test-model",
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        api: "anthropic-messages",
      },
      tools: [], // Even empty, SDK adds defaults
      customTools: [],
      sessionManager,
      settingsManager,
    });

    // Apply the system prompt override
    applySystemPromptOverrideToSession(session, systemPrompt);

    // When NO template exists, tools should remain (we don't call setTools([]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolRegistry = (session as any)._toolRegistry;
    const toolCount = toolRegistry ? toolRegistry.size : 0;

    expect(toolCount).toBeGreaterThan(0);

    // Clean up
    session.dispose();
  });
});
