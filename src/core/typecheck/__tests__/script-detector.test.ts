import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  detectTypecheckScript,
  buildScriptCommand,
  buildTscFallbackCommand
} from "../node/script-detector.js";

describe("detectTypecheckScript", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "script-detector-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("script detection", () => {
    it("should detect 'typecheck' script", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { typecheck: "tsc --noEmit" }
        })
      );

      const result = await detectTypecheckScript(tempDir);

      expect(result.hasTypecheckScript).toBe(true);
      expect(result.scriptName).toBe("typecheck");
    });

    it("should detect 'type-check' script", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { "type-check": "tsc --noEmit" }
        })
      );

      const result = await detectTypecheckScript(tempDir);

      expect(result.hasTypecheckScript).toBe(true);
      expect(result.scriptName).toBe("type-check");
    });

    it("should detect 'check-types' script", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { "check-types": "tsc --noEmit" }
        })
      );

      const result = await detectTypecheckScript(tempDir);

      expect(result.hasTypecheckScript).toBe(true);
      expect(result.scriptName).toBe("check-types");
    });

    it("should detect 'tsc' script", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { tsc: "tsc --noEmit" }
        })
      );

      const result = await detectTypecheckScript(tempDir);

      expect(result.hasTypecheckScript).toBe(true);
      expect(result.scriptName).toBe("tsc");
    });

    it("should prioritize 'typecheck' over other names", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: {
            tsc: "tsc --noEmit",
            typecheck: "tsc --noEmit",
            "type-check": "tsc --noEmit"
          }
        })
      );

      const result = await detectTypecheckScript(tempDir);

      expect(result.scriptName).toBe("typecheck");
    });

    it("should return false when no typecheck script exists", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { build: "tsc", test: "vitest" }
        })
      );

      const result = await detectTypecheckScript(tempDir);

      expect(result.hasTypecheckScript).toBe(false);
      expect(result.scriptName).toBeNull();
    });

    it("should handle missing scripts field", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));

      const result = await detectTypecheckScript(tempDir);

      expect(result.hasTypecheckScript).toBe(false);
      expect(result.scriptName).toBeNull();
    });

    it("should handle missing package.json", async () => {
      const result = await detectTypecheckScript(tempDir);

      expect(result.hasTypecheckScript).toBe(false);
      expect(result.scriptName).toBeNull();
    });
  });

  describe("script name override", () => {
    it("should use override when specified", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: {
            typecheck: "tsc --noEmit",
            "custom-check": "tsc -p tsconfig.custom.json --noEmit"
          }
        })
      );

      const result = await detectTypecheckScript(tempDir, "custom-check");

      expect(result.hasTypecheckScript).toBe(true);
      expect(result.scriptName).toBe("custom-check");
    });

    it("should return false when override script not found", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { typecheck: "tsc --noEmit" }
        })
      );

      const result = await detectTypecheckScript(tempDir, "nonexistent");

      expect(result.hasTypecheckScript).toBe(false);
      expect(result.scriptName).toBeNull();
    });
  });

  describe("tsconfig detection", () => {
    it("should detect tsconfig.json presence", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
      await fs.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      );

      const result = await detectTypecheckScript(tempDir);

      expect(result.hasTsconfig).toBe(true);
    });

    it("should detect tsconfig.json absence", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));

      const result = await detectTypecheckScript(tempDir);

      expect(result.hasTsconfig).toBe(false);
    });
  });

  describe("package manager detection", () => {
    it("should detect pnpm from lockfile", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
      await fs.writeFile(path.join(tempDir, "pnpm-lock.yaml"), "");

      const result = await detectTypecheckScript(tempDir);

      expect(result.packageManager).toBe("pnpm");
    });

    it("should detect npm from lockfile", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
      await fs.writeFile(path.join(tempDir, "package-lock.json"), "{}");

      const result = await detectTypecheckScript(tempDir);

      expect(result.packageManager).toBe("npm");
    });

    it("should detect yarn from lockfile", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
      await fs.writeFile(path.join(tempDir, "yarn.lock"), "");

      const result = await detectTypecheckScript(tempDir);

      expect(result.packageManager).toBe("yarn");
    });

    it("should detect bun from lockfile", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
      await fs.writeFile(path.join(tempDir, "bun.lockb"), "");

      const result = await detectTypecheckScript(tempDir);

      expect(result.packageManager).toBe("bun");
    });

    it("should return unknown when no lockfile found", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));

      const result = await detectTypecheckScript(tempDir);

      expect(result.packageManager).toBe("unknown");
    });
  });
});

describe("buildScriptCommand", () => {
  it("should build pnpm command", () => {
    const cmd = buildScriptCommand("typecheck", "pnpm");
    expect(cmd).toEqual(["pnpm", "run", "typecheck"]);
  });

  it("should build npm command", () => {
    const cmd = buildScriptCommand("typecheck", "npm");
    expect(cmd).toEqual(["npm", "run", "typecheck"]);
  });

  it("should build yarn command", () => {
    const cmd = buildScriptCommand("typecheck", "yarn");
    expect(cmd).toEqual(["yarn", "run", "typecheck"]);
  });

  it("should build bun command", () => {
    const cmd = buildScriptCommand("typecheck", "bun");
    expect(cmd).toEqual(["bun", "run", "typecheck"]);
  });

  it("should default to npm for unknown manager", () => {
    const cmd = buildScriptCommand("typecheck", "unknown");
    expect(cmd).toEqual(["npm", "run", "typecheck"]);
  });
});

describe("buildTscFallbackCommand", () => {
  it("should build pnpm exec command", () => {
    const cmd = buildTscFallbackCommand("pnpm");
    expect(cmd).toEqual(["pnpm", "exec", "tsc", "--noEmit"]);
  });

  it("should build npx command for npm", () => {
    const cmd = buildTscFallbackCommand("npm");
    expect(cmd).toEqual(["npx", "tsc", "--noEmit"]);
  });

  it("should build yarn exec command", () => {
    const cmd = buildTscFallbackCommand("yarn");
    expect(cmd).toEqual(["yarn", "exec", "tsc", "--noEmit"]);
  });

  it("should build bun x command", () => {
    const cmd = buildTscFallbackCommand("bun");
    expect(cmd).toEqual(["bun", "x", "tsc", "--noEmit"]);
  });

  it("should use custom command when provided", () => {
    const cmd = buildTscFallbackCommand("npm", "tsc -p tsconfig.custom.json --noEmit");
    expect(cmd).toEqual(["tsc", "-p", "tsconfig.custom.json", "--noEmit"]);
  });
});
