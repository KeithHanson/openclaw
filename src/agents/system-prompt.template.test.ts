import * as fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterEach } from "vitest";
import { buildAgentSystemPrompt, buildRuntimeLine } from "./system-prompt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("system-prompt template rendering", () => {
  const testWorkspace = path.join(__dirname, ".test-template-workspace");

  afterEach(() => {
    if (fsSync.existsSync(testWorkspace)) {
      fsSync.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  describe("with template file", () => {
    it("renders template with all variables populated", () => {
      fsSync.mkdirSync(testWorkspace, { recursive: true });
      fsSync.writeFileSync(
        path.join(testWorkspace, "SYSTEM.md"),
        `TEMPLATE TEST: workspace={{workspaceDir}} docs={{docsPath}}`,
      );

      const result = buildAgentSystemPrompt({
        workspaceDir: testWorkspace,
        docsPath: "/test/docs",
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
      });

      expect(result).toContain("TEMPLATE TEST:");
      expect(result).toContain(`workspace=${testWorkspace}`);
      expect(result).toContain("docs=/test/docs");
    });

    it("renders template with boolean variables", () => {
      fsSync.mkdirSync(testWorkspace, { recursive: true });
      fsSync.writeFileSync(
        path.join(testWorkspace, "SYSTEM.md"),
        `sandbox={{sandboxEnabled}} gateway={{hasGateway}} minimal={{isMinimal}}`,
      );

      const result = buildAgentSystemPrompt({
        workspaceDir: testWorkspace,
        sandboxInfo: { enabled: true },
        runtimeInfo: { agentId: "test-agent" },
        promptMode: "minimal",
      });

      expect(result).toContain("sandbox=true");
      expect(result).toContain("gateway=false");
      expect(result).toContain("minimal=true");
    });

    it("renders template with array variables", () => {
      fsSync.mkdirSync(testWorkspace, { recursive: true });
      fsSync.writeFileSync(
        path.join(testWorkspace, "SYSTEM.md"),
        `aliases={{modelAliasLines}} notes={{workspaceNotes}}`,
      );

      const result = buildAgentSystemPrompt({
        workspaceDir: testWorkspace,
        modelAliasLines: ["alias1", "alias2"],
        workspaceNotes: ["note1", "note2"],
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
      });

      expect(result).toContain("aliases=");
      expect(result).toContain("alias1");
      expect(result).toContain("alias2");
      expect(result).toContain("notes=");
      expect(result).toContain("note1");
      expect(result).toContain("note2");
    });

    it("renders template with object variables", () => {
      fsSync.mkdirSync(testWorkspace, { recursive: true });
      fsSync.writeFileSync(
        path.join(testWorkspace, "SYSTEM.md"),
        `agent={{runtimeInfo.agentId}} host={{runtimeInfo.host}} os={{runtimeInfo.os}}`,
      );

      const result = buildAgentSystemPrompt({
        workspaceDir: testWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: {
          agentId: "test-agent",
          host: "test-host",
          os: "Linux",
          model: "claude-3-5",
        },
      });

      expect(result).toContain("agent=test-agent");
      expect(result).toContain("host=test-host");
      expect(result).toContain("os=Linux");
    });

    it("renders template with contextFiles", () => {
      fsSync.mkdirSync(testWorkspace, { recursive: true });
      fsSync.writeFileSync(
        path.join(testWorkspace, "SYSTEM.md"),
        `file={{contextFiles[0].path}} content={{contextFiles[0].content}}`,
      );

      const result = buildAgentSystemPrompt({
        workspaceDir: testWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
        contextFiles: [
          { path: "README.md", content: "Hello World" },
          { path: "CONFIG.md", content: "Config here" },
        ],
      });

      expect(result).toContain("file=README.md");
      expect(result).toContain("content=Hello World");
    });

    it("renders template with tool variables", () => {
      fsSync.mkdirSync(testWorkspace, { recursive: true });
      fsSync.writeFileSync(
        path.join(testWorkspace, "SYSTEM.md"),
        `## Tools\n{{ toolList }}\nexec={{execToolName}} read={{readToolName}}`,
      );

      const result = buildAgentSystemPrompt({
        workspaceDir: testWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
        toolNames: ["read", "write", "exec"],
        toolSummaries: {
          read: "Read file contents",
          write: "Create or overwrite files",
          exec: "Run shell commands",
        },
      });

      expect(result).toContain("## Tools");
      expect(result).toContain("- read: Read file contents");
      expect(result).toContain("- write: Create or overwrite files");
      expect(result).toContain("- exec: Run shell commands");
      expect(result).toContain("exec=exec");
      expect(result).toContain("read=read");
    });

    it("handles empty tools array gracefully", () => {
      fsSync.mkdirSync(testWorkspace, { recursive: true });
      fsSync.writeFileSync(
        path.join(testWorkspace, "SYSTEM.md"),
        `## Tools\nAvailable: {{ toolList or "none" }}`,
      );

      const result = buildAgentSystemPrompt({
        workspaceDir: testWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
        toolNames: [],
        toolSummaries: {},
      });

      expect(result).toContain("## Tools");
      expect(result).toContain("Available: none");
    });

    it("allows conditional tool checks in template", () => {
      fsSync.mkdirSync(testWorkspace, { recursive: true });
      fsSync.writeFileSync(
        path.join(testWorkspace, "SYSTEM.md"),
        `{% if availableTools.has('memory_search') %}Memory enabled{% else %}No memory{% endif %}`,
      );

      const resultWithMemory = buildAgentSystemPrompt({
        workspaceDir: testWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
        toolNames: ["memory_search", "memory_get"],
      });

      const resultWithoutMemory = buildAgentSystemPrompt({
        workspaceDir: testWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
        toolNames: ["read", "write"],
      });

      expect(resultWithMemory).toContain("Memory enabled");
      expect(resultWithoutMemory).toContain("No memory");
    });

    it("handles missing optional variables gracefully", () => {
      fsSync.mkdirSync(testWorkspace, { recursive: true });
      fsSync.writeFileSync(
        path.join(testWorkspace, "SYSTEM.md"),
        `docs={{docsPath}} tz={{userTimezone}}`,
      );

      const result = buildAgentSystemPrompt({
        workspaceDir: testWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "test-agent" },
      });

      expect(result).toContain("docs=");
      expect(result).toContain("tz=");
    });
  });

  describe("without template file", () => {
    const noTemplateWorkspace = path.join(__dirname, ".test-no-template-workspace");

    afterEach(() => {
      if (fsSync.existsSync(noTemplateWorkspace)) {
        fsSync.rmSync(noTemplateWorkspace, { recursive: true, force: true });
      }
    });

    it("uses default prompt construction", () => {
      fsSync.mkdirSync(noTemplateWorkspace, { recursive: true });

      const result = buildAgentSystemPrompt({
        workspaceDir: noTemplateWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "no-template-agent" },
      });

      expect(result).toContain("You are a personal assistant running inside OpenClaw.");
      expect(result).toContain("## Tooling");
      expect(result).toContain("## Workspace");
      expect(result).toContain(noTemplateWorkspace);
    });

    it("includes all default sections in full mode", () => {
      fsSync.mkdirSync(noTemplateWorkspace, { recursive: true });

      const result = buildAgentSystemPrompt({
        workspaceDir: noTemplateWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "no-template-agent" },
        promptMode: "full",
      });

      expect(result).toContain("## Tooling");
      expect(result).toContain("## Safety");
      expect(result).toContain("## OpenClaw CLI Quick Reference");
      expect(result).toContain("## Messaging");
      expect(result).toContain("## Silent Replies");
      expect(result).toContain("## Heartbeats");
    });

    it("includes minimal sections in minimal mode", () => {
      fsSync.mkdirSync(noTemplateWorkspace, { recursive: true });

      const result = buildAgentSystemPrompt({
        workspaceDir: noTemplateWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "no-template-agent" },
        promptMode: "minimal",
      });

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
      fsSync.mkdirSync(noTemplateWorkspace, { recursive: true });

      const result = buildAgentSystemPrompt({
        workspaceDir: noTemplateWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "no-template-agent" },
        promptMode: "none",
      });

      expect(result).toBe("You are a personal assistant running inside OpenClaw.");
    });

    it("includes sandbox info when enabled", () => {
      fsSync.mkdirSync(noTemplateWorkspace, { recursive: true });

      const result = buildAgentSystemPrompt({
        workspaceDir: noTemplateWorkspace,
        sandboxInfo: {
          enabled: true,
          workspaceDir: "/sandbox/workspace",
        },
        runtimeInfo: { agentId: "no-template-agent" },
      });

      expect(result).toContain("## Sandbox");
      expect(result).toContain("sandboxed runtime");
    });

    it("includes model aliases when provided", () => {
      fsSync.mkdirSync(noTemplateWorkspace, { recursive: true });

      const result = buildAgentSystemPrompt({
        workspaceDir: noTemplateWorkspace,
        modelAliasLines: ["sonnet: claude-3-5-sonnet", "haiku: claude-3-haiku"],
        sandboxInfo: { enabled: false },
        runtimeInfo: { agentId: "no-template-agent" },
      });

      expect(result).toContain("## Model Aliases");
      expect(result).toContain("sonnet: claude-3-5-sonnet");
    });

    it("includes runtime line with all info", () => {
      fsSync.mkdirSync(noTemplateWorkspace, { recursive: true });

      const result = buildAgentSystemPrompt({
        workspaceDir: noTemplateWorkspace,
        sandboxInfo: { enabled: false },
        runtimeInfo: {
          agentId: "test-agent",
          host: "test-host",
          os: "Linux",
          node: "v18.0.0",
          model: "claude-3-5",
        },
      });

      expect(result).toContain("## Runtime");
      expect(result).toContain("agent=test-agent");
      expect(result).toContain("host=test-host");
    });
  });

  describe("buildRuntimeLine", () => {
    it("formats runtime line correctly", () => {
      const result = buildRuntimeLine(
        {
          agentId: "main",
          host: "localhost",
          os: "Linux",
          node: "v18.0.0",
          model: "claude-3-5",
        },
        "telegram",
        ["inlinebuttons", "polls"],
        "low",
      );

      expect(result).toContain("agent=main");
      expect(result).toContain("host=localhost");
      expect(result).toContain("os=Linux");
      expect(result).toContain("node=v18.0.0");
      expect(result).toContain("model=claude-3-5");
      expect(result).toContain("channel=telegram");
      expect(result).toContain("capabilities=inlinebuttons,polls");
      expect(result).toContain("thinking=low");
    });

    it("handles partial runtime info", () => {
      const result = buildRuntimeLine(
        {
          agentId: "main",
        },
        undefined,
        [],
        undefined,
      );

      expect(result).toContain("agent=main");
      expect(result).toContain("thinking=off");
      expect(result).not.toContain("host=");
      expect(result).not.toContain("channel=");
    });
  });
});
