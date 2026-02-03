import * as fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterEach } from "vitest";
import { buildAgentSystemPrompt, buildRuntimeLine } from "./system-prompt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("system-prompt template rendering", () => {
  const testAgentDir = path.join(__dirname, ".test-template-agent");

  afterEach(() => {
    if (fsSync.existsSync(testAgentDir)) {
      fsSync.rmSync(testAgentDir, { recursive: true, force: true });
    }
  });

  describe("with template file", () => {
    it("renders template with all variables populated", () => {
      const agentDir = path.join(testAgentDir, ".openclaw", "agents", "test-agent");
      fsSync.mkdirSync(agentDir, { recursive: true });
      fsSync.writeFileSync(
        path.join(agentDir, "SYSTEM.md"),
        `TEMPLATE TEST: workspace={{workspaceDir}} docs={{docsPath}}`,
      );
      const originalHome = process.env.HOME;
      process.env.HOME = testAgentDir;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        docsPath: "/test/docs",
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
      });

      process.env.HOME = originalHome;
      expect(result).toContain("TEMPLATE TEST:");
      expect(result).toContain("workspace=/test/workspace");
      expect(result).toContain("docs=/test/docs");
    });

    it("renders template with boolean variables", () => {
      const agentDir = path.join(testAgentDir, ".openclaw", "agents", "test-agent");
      fsSync.mkdirSync(agentDir, { recursive: true });
      fsSync.writeFileSync(
        path.join(agentDir, "SYSTEM.md"),
        `sandbox={{sandboxEnabled}} gateway={{hasGateway}} minimal={{isMinimal}}`,
      );
      const originalHome = process.env.HOME;
      process.env.HOME = testAgentDir;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: { enabled: true },
        runtimeInfo: { agentId: "test-agent" },
        promptMode: "minimal",
      });

      process.env.HOME = originalHome;
      expect(result).toContain("sandbox=true");
      expect(result).toContain("gateway=false");
      expect(result).toContain("minimal=true");
    });

    it("renders template with array variables", () => {
      const agentDir = path.join(testAgentDir, ".openclaw", "agents", "test-agent");
      fsSync.mkdirSync(agentDir, { recursive: true });
      fsSync.writeFileSync(
        path.join(agentDir, "SYSTEM.md"),
        `aliases={{modelAliasLines}} notes={{workspaceNotes}}`,
      );
      const originalHome = process.env.HOME;
      process.env.HOME = testAgentDir;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        modelAliasLines: ["alias1", "alias2"],
        workspaceNotes: ["note1", "note2"],
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
      });

      process.env.HOME = originalHome;
      expect(result).toContain("aliases=");
      expect(result).toContain("alias1");
      expect(result).toContain("alias2");
      expect(result).toContain("notes=");
      expect(result).toContain("note1");
      expect(result).toContain("note2");
    });

    it("renders template with object variables", () => {
      const agentDir = path.join(testAgentDir, ".openclaw", "agents", "test-agent");
      fsSync.mkdirSync(agentDir, { recursive: true });
      fsSync.writeFileSync(
        path.join(agentDir, "SYSTEM.md"),
        `agent={{runtimeInfo.agentId}} host={{runtimeInfo.host}} os={{runtimeInfo.os}}`,
      );
      const originalHome = process.env.HOME;
      process.env.HOME = testAgentDir;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: { enabled: false },
        runtimeInfo: {
          agentId: "test-agent",
          host: "test-host",
          os: "Linux",
          model: "claude-3-5",
        },
      });

      process.env.HOME = originalHome;
      expect(result).toContain("agent=test-agent");
      expect(result).toContain("host=test-host");
      expect(result).toContain("os=Linux");
    });

    it("renders template with contextFiles", () => {
      const agentDir = path.join(testAgentDir, ".openclaw", "agents", "test-agent");
      fsSync.mkdirSync(agentDir, { recursive: true });
      fsSync.writeFileSync(
        path.join(agentDir, "SYSTEM.md"),
        `file={{contextFiles[0].path}} content={{contextFiles[0].content}}`,
      );
      const originalHome = process.env.HOME;
      process.env.HOME = testAgentDir;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
        contextFiles: [
          { path: "README.md", content: "Hello World" },
          { path: "CONFIG.md", content: "Config here" },
        ],
      });

      process.env.HOME = originalHome;
      expect(result).toContain("file=README.md");
      expect(result).toContain("content=Hello World");
    });

    it("handles missing optional variables gracefully", () => {
      const agentDir = path.join(testAgentDir, ".openclaw", "agents", "test-agent");
      fsSync.mkdirSync(agentDir, { recursive: true });
      fsSync.writeFileSync(
        path.join(agentDir, "SYSTEM.md"),
        `docs={{docsPath}} tz={{userTimezone}}`,
      );
      const originalHome = process.env.HOME;
      process.env.HOME = testAgentDir;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
      });

      process.env.HOME = originalHome;
      expect(result).toContain("docs=");
      expect(result).toContain("tz=");
    });
  });

  describe("without template file", () => {
    const noTemplateHome = path.join(testAgentDir, "no-template-home");

    it("uses default prompt construction", () => {
      const originalHome = process.env.HOME;
      process.env.HOME = noTemplateHome;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "no-template-agent" },
      });

      process.env.HOME = originalHome;
      expect(result).toContain("You are a personal assistant running inside OpenClaw.");
      expect(result).toContain("## Tooling");
      expect(result).toContain("## Workspace");
      expect(result).toContain("/test/workspace");
    });

    it("includes all default sections in full mode", () => {
      const originalHome = process.env.HOME;
      process.env.HOME = noTemplateHome;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "no-template-agent" },
        promptMode: "full",
      });

      process.env.HOME = originalHome;
      expect(result).toContain("## Tool Call Style");
      expect(result).toContain("## Safety");
      expect(result).toContain("## OpenClaw CLI Quick Reference");
      expect(result).toContain("## Messaging");
      expect(result).toContain("## Silent Replies");
      expect(result).toContain("## Heartbeats");
    });

    it("includes minimal sections in minimal mode", () => {
      const originalHome = process.env.HOME;
      process.env.HOME = noTemplateHome;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "no-template-agent" },
        promptMode: "minimal",
      });

      process.env.HOME = originalHome;
      expect(result).toContain("## Tool Call Style");
      expect(result).toContain("## Safety");
      expect(result).toContain("## Workspace");
      expect(result).toContain("## Runtime");
      expect(result).not.toContain("## Tooling");
      expect(result).not.toContain("## Silent Replies");
      expect(result).not.toContain("## Heartbeats");
      expect(result).not.toContain("## Messaging");
      expect(result).not.toContain("## Voice");
    });

    it("returns only identity line in none mode", () => {
      const originalHome = process.env.HOME;
      process.env.HOME = noTemplateHome;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "no-template-agent" },
        promptMode: "none",
      });

      process.env.HOME = originalHome;
      expect(result).toBe("You are a personal assistant running inside OpenClaw.");
    });

    it("includes sandbox info when enabled", () => {
      const originalHome = process.env.HOME;
      process.env.HOME = noTemplateHome;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: {
          enabled: true,
          workspaceDir: "/sandbox/workspace",
          workspaceAccess: "rw",
          agentWorkspaceMount: "/host/path",
        },
        runtimeInfo: { agentId: "no-template-agent" },
      });

      process.env.HOME = originalHome;
      expect(result).toContain("## Sandbox");
      expect(result).toContain("/sandbox/workspace");
      expect(result).toContain("/host/path");
    });

    it("includes model aliases when provided", () => {
      const originalHome = process.env.HOME;
      process.env.HOME = noTemplateHome;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "no-template-agent" },
        modelAliasLines: ["sonnet = sonnet-4-20250514", "haiku = haiku-3-20250514"],
      });

      process.env.HOME = originalHome;
      expect(result).toContain("## Model Aliases");
      expect(result).toContain("sonnet = sonnet-4-20250514");
    });

    it("includes runtime line with all info", () => {
      const originalHome = process.env.HOME;
      process.env.HOME = noTemplateHome;

      const result = buildAgentSystemPrompt({
        workspaceDir: "/test/workspace",
        sandboxInfo: { enabled: false },
        runtimeInfo: {
          agentId: "no-template-agent",
          host: "test-host",
          os: "Linux",
          arch: "x64",
          node: "v22.12.0",
          model: "claude-3-5-sonnet-20241022",
          defaultModel: "claude-3-5-haiku-20241022",
          repoRoot: "/repo",
          channel: "telegram",
          capabilities: ["inlinebuttons", "reactions"],
        },
        defaultThinkLevel: "off",
      });

      process.env.HOME = originalHome;
      expect(result).toContain("Runtime:");
      expect(result).toContain("agent=no-template-agent");
      expect(result).toContain("host=test-host");
      expect(result).toContain("os=Linux");
      expect(result).toContain("channel=telegram");
      expect(result).toContain("capabilities=inlinebuttons,reactions");
    });
  });
});

describe("buildRuntimeLine", () => {
  it("formats runtime line correctly", () => {
    const result = buildRuntimeLine(
      {
        agentId: "my-agent",
        host: "my-host",
        os: "Darwin",
        arch: "arm64",
        node: "v22.12.0",
        model: "claude-3-5",
        defaultModel: "claude-3-5-haiku",
        repoRoot: "/Users/test/repo",
      },
      "telegram",
      ["inlinebuttons", "reactions"],
      "off",
    );

    expect(result).toContain("agent=my-agent");
    expect(result).toContain("host=my-host");
    expect(result).toContain("os=Darwin");
    expect(result).toContain("arm64");
    expect(result).toContain("model=claude-3-5");
    expect(result).toContain("channel=telegram");
    expect(result).toContain("thinking=off");
  });

  it("handles partial runtime info", () => {
    const result = buildRuntimeLine({ agentId: "minimal-agent" }, undefined, [], "low");

    expect(result).toContain("agent=minimal-agent");
    expect(result).toContain("thinking=low");
  });
});
