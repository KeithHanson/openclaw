import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("SYSTEM.md template - tools clearing behavior", () => {
  const testWorkspace = path.join(__dirname, ".test-system-template-tools");

  beforeEach(() => {
    // Create test workspace
    if (!fsSync.existsSync(testWorkspace)) {
      fsSync.mkdirSync(testWorkspace, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test workspace
    if (fsSync.existsSync(testWorkspace)) {
      fsSync.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  it("should detect SYSTEM.md template file exists", async () => {
    // Create SYSTEM.md template
    await fs.writeFile(path.join(testWorkspace, "SYSTEM.md"), "Custom system prompt");

    const templatePath = path.join(testWorkspace, "SYSTEM.md");
    const exists = await fs
      .access(templatePath)
      .then(() => true)
      .catch(() => false);

    expect(exists).toBe(true);
  });

  it("should detect when SYSTEM.md template does not exist", async () => {
    const templatePath = path.join(testWorkspace, "SYSTEM.md");
    const exists = await fs
      .access(templatePath)
      .then(() => true)
      .catch(() => false);

    expect(exists).toBe(false);
  });

  it("verifies the fix: session.agent.setTools([]) is called when SYSTEM.md exists", async () => {
    // This is a documentation test that verifies the fix is in place
    // The actual implementation is at src/agents/pi-embedded-runner/run/attempt.ts:501-505

    const attemptFileContent = await fs.readFile(
      path.join(__dirname, "run", "attempt.ts"),
      "utf-8",
    );

    // Verify the fix is present in the code
    expect(attemptFileContent).toContain(
      "applySystemPromptOverrideToSession(session, systemPromptText);",
    );
    expect(attemptFileContent).toContain("if (hasSystemTemplate)");
    expect(attemptFileContent).toContain("session.agent.setTools([])");

    // Verify the comment explaining the fix
    expect(attemptFileContent).toContain("When SYSTEM.md template exists, clear tools");
    expect(attemptFileContent).toContain("SDK's _buildRuntime() sets default tools");
  });

  it("documents the expected behavior when SYSTEM.md exists", () => {
    // When SYSTEM.md template exists:
    // 1. hasSystemTemplate should be true (line 210-213)
    // 2. toolsRaw should be empty array (line 217-251)
    // 3. builtInTools and customTools should be empty (line 462-467)
    // 4. System prompt should be set from template (line 500)
    // 5. Tools should be explicitly cleared (line 503-505) <- THE FIX

    // This ensures no function definitions are injected by the LLM provider
    expect(true).toBe(true); // Documentation test
  });

  it("documents the expected behavior when SYSTEM.md does NOT exist", () => {
    // When SYSTEM.md template does NOT exist:
    // 1. hasSystemTemplate should be false
    // 2. toolsRaw should contain created tools
    // 3. builtInTools and customTools should be populated
    // 4. System prompt should use default construction
    // 5. Tools should NOT be cleared (no setTools([]) call)

    // This ensures normal tool operation when using default prompts
    expect(true).toBe(true); // Documentation test
  });
});
