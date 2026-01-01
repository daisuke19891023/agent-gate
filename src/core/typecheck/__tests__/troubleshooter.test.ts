import { describe, it, expect } from "vitest";
import { troubleshootTypecheck, getTypecheckNextActions } from "../troubleshooter.js";

describe("troubleshootTypecheck", () => {
  describe("Node.js typecheck errors", () => {
    it("should classify TSC_NOT_FOUND", () => {
      const result = troubleshootTypecheck("node", 127, "tsc: command not found", "", false);

      expect(result.code).toBe("TSC_NOT_FOUND");
      expect(result.message).toContain("not installed");
      expect(result.nextActions).toHaveLength(1);
      expect(result.nextActions[0]?.kind).toBe("install-typescript");
    });

    it("should classify TSC_NOT_FOUND from ENOENT", () => {
      const result = troubleshootTypecheck("node", 1, "ENOENT: tsc not found", "", false);

      expect(result.code).toBe("TSC_NOT_FOUND");
    });

    it("should classify TSCONFIG_MISSING", () => {
      const result = troubleshootTypecheck(
        "node",
        1,
        "",
        "error TS18003: No inputs were found in config file",
        false
      );

      expect(result.code).toBe("TSCONFIG_MISSING");
      expect(result.nextActions[0]?.kind).toBe("create-tsconfig");
    });

    it("should classify TSCONFIG_MISSING from Cannot find", () => {
      const result = troubleshootTypecheck("node", 1, "Cannot find tsconfig.json", "", false);

      expect(result.code).toBe("TSCONFIG_MISSING");
    });

    it("should classify TYPECHECK_SCRIPT_MISSING", () => {
      const result = troubleshootTypecheck(
        "node",
        1,
        "npm ERR! Missing script: typecheck",
        "",
        false
      );

      expect(result.code).toBe("TYPECHECK_SCRIPT_MISSING");
      expect(result.nextActions[0]?.kind).toBe("add-typecheck-script");
    });

    it("should classify TYPECHECK_SCRIPT_MISSING from pnpm", () => {
      const result = troubleshootTypecheck(
        "node",
        1,
        "ERR_PNPM_NO_SCRIPT: Missing script: typecheck",
        "",
        false
      );

      expect(result.code).toBe("TYPECHECK_SCRIPT_MISSING");
    });

    it("should classify TYPECHECK_FAILED from tsc errors", () => {
      const result = troubleshootTypecheck(
        "node",
        1,
        "",
        "src/index.ts(10,5): error TS2304: Cannot find name 'x'.",
        false
      );

      expect(result.code).toBe("TYPECHECK_FAILED");
      expect(result.nextActions[0]?.kind).toBe("fix-type-errors");
    });

    it("should classify TYPECHECK_FAILED from Found errors", () => {
      const result = troubleshootTypecheck("node", 1, "", "Found 5 errors in 2 files.", false);

      expect(result.code).toBe("TYPECHECK_FAILED");
    });
  });

  describe("Python typecheck errors", () => {
    it("should classify PYRIGHT_NOT_FOUND", () => {
      const result = troubleshootTypecheck("python", 127, "pyright: command not found", "", false);

      expect(result.code).toBe("PYRIGHT_NOT_FOUND");
      expect(result.nextActions[0]?.kind).toBe("install-pyright");
    });

    it("should classify PYRIGHT_NOT_FOUND from ENOENT", () => {
      const result = troubleshootTypecheck("python", 1, "ENOENT: pyright", "", false);

      expect(result.code).toBe("PYRIGHT_NOT_FOUND");
    });

    it("should classify PYRIGHTCONFIG_MISSING", () => {
      const result = troubleshootTypecheck("python", 1, "pyrightconfig.json not found", "", false);

      expect(result.code).toBe("PYRIGHTCONFIG_MISSING");
      expect(result.nextActions[0]?.kind).toBe("create-pyrightconfig");
    });

    it("should classify TYPECHECK_FAILED from pyright errors", () => {
      const output = JSON.stringify({
        generalDiagnostics: [{ severity: 1, message: "Error" }],
        errorCount: 1
      });
      const result = troubleshootTypecheck("python", 1, "", output, false);

      expect(result.code).toBe("TYPECHECK_FAILED");
    });
  });

  describe("common error handling", () => {
    it("should classify TIMEOUT", () => {
      const result = troubleshootTypecheck("node", null, "", "", true);

      expect(result.code).toBe("TIMEOUT");
      expect(result.nextActions[0]?.kind).toBe("increase-timeout");
    });

    it("should return UNKNOWN for exit code 0", () => {
      const result = troubleshootTypecheck("node", 0, "", "", false);

      expect(result.code).toBe("UNKNOWN");
      expect(result.message).toBe("No error detected.");
      expect(result.nextActions).toHaveLength(0);
    });

    it("should return UNKNOWN for unrecognized error", () => {
      const result = troubleshootTypecheck("node", 1, "Some completely unknown error", "", false);

      expect(result.code).toBe("UNKNOWN");
      expect(result.nextActions[0]?.kind).toBe("check-logs");
    });

    it("should match patterns in both stdout and stderr", () => {
      // Error in stdout
      const result1 = troubleshootTypecheck(
        "node",
        1,
        "",
        "error TS2304: Cannot find name 'x'.",
        false
      );
      expect(result1.code).toBe("TYPECHECK_FAILED");

      // Error in stderr
      const result2 = troubleshootTypecheck(
        "node",
        1,
        "error TS2304: Cannot find name 'x'.",
        "",
        false
      );
      expect(result2.code).toBe("TYPECHECK_FAILED");
    });
  });

  describe("priority ordering", () => {
    it("should prioritize TSC_NOT_FOUND over TYPECHECK_FAILED", () => {
      // Both patterns match, but TSC_NOT_FOUND has higher priority
      const result = troubleshootTypecheck(
        "node",
        1,
        "tsc: command not found",
        "error TS2304: some error",
        false
      );

      expect(result.code).toBe("TSC_NOT_FOUND");
    });

    it("should prioritize TSCONFIG_MISSING over TYPECHECK_SCRIPT_MISSING", () => {
      const result = troubleshootTypecheck(
        "node",
        1,
        "Cannot find tsconfig.json",
        "Missing script: typecheck",
        false
      );

      expect(result.code).toBe("TSCONFIG_MISSING");
    });
  });
});

describe("getTypecheckNextActions", () => {
  it("should return correct actions for TSC_NOT_FOUND", () => {
    const actions = getTypecheckNextActions({
      code: "TSC_NOT_FOUND",
      message: "TypeScript not found"
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.kind).toBe("install-typescript");
    expect(actions[0]?.commands).toContain("npm install -D typescript");
  });

  it("should return correct actions for PYRIGHT_NOT_FOUND", () => {
    const actions = getTypecheckNextActions({
      code: "PYRIGHT_NOT_FOUND",
      message: "Pyright not found"
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.kind).toBe("install-pyright");
    expect(actions[0]?.commands).toContain("pip install pyright");
  });

  it("should return correct actions for TYPECHECK_SCRIPT_MISSING", () => {
    const actions = getTypecheckNextActions({
      code: "TYPECHECK_SCRIPT_MISSING",
      message: "Script missing"
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.kind).toBe("add-typecheck-script");
  });

  it("should return correct actions for TYPECHECK_FAILED", () => {
    const actions = getTypecheckNextActions({
      code: "TYPECHECK_FAILED",
      message: "Typecheck failed"
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.kind).toBe("fix-type-errors");
  });

  it("should return correct actions for TIMEOUT", () => {
    const actions = getTypecheckNextActions({
      code: "TIMEOUT",
      message: "Timed out"
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.kind).toBe("increase-timeout");
  });

  it("should return check-logs for UNKNOWN", () => {
    const actions = getTypecheckNextActions({
      code: "UNKNOWN",
      message: "Unknown error"
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.kind).toBe("check-logs");
  });
});
