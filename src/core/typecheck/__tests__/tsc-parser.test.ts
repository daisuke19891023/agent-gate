import { describe, it, expect } from "vitest";
import { parseTscOutput, countDiagnostics } from "../node/tsc-parser.js";

describe("parseTscOutput", () => {
  const projectRoot = "/repo/packages/core";
  const repoRoot = "/repo";

  describe("classic format parsing", () => {
    it("should parse single error in classic format", () => {
      const output = "src/index.ts(10,5): error TS2304: Cannot find name 'x'.";
      const diagnostics = parseTscOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        source: "tsc",
        severity: "error",
        file: "packages/core/src/index.ts",
        range: {
          start: { line: 10, column: 5 },
          end: { line: 10, column: 5 }
        },
        code: "TS2304",
        message: "Cannot find name 'x'."
      });
    });

    it("should parse warning in classic format", () => {
      const output = "src/utils.ts(25,10): warning TS6133: 'unused' is declared but never used.";
      const diagnostics = parseTscOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        source: "tsc",
        severity: "warning",
        file: "packages/core/src/utils.ts",
        code: "TS6133",
        message: "'unused' is declared but never used."
      });
    });

    it("should parse multiple errors", () => {
      const output = `
src/index.ts(10,5): error TS2304: Cannot find name 'x'.
src/index.ts(15,3): error TS2551: Property 'foo' does not exist.
src/utils.ts(5,1): error TS1005: ';' expected.
      `;
      const diagnostics = parseTscOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(3);
      expect(diagnostics[0]?.file).toBe("packages/core/src/index.ts");
      expect(diagnostics[0]?.range?.start.line).toBe(10);
      expect(diagnostics[1]?.file).toBe("packages/core/src/index.ts");
      expect(diagnostics[1]?.range?.start.line).toBe(15);
      expect(diagnostics[2]?.file).toBe("packages/core/src/utils.ts");
    });
  });

  describe("pretty format parsing", () => {
    it("should parse error in pretty format", () => {
      const output = "src/index.ts:10:5 - error TS2304: Cannot find name 'x'.";
      const diagnostics = parseTscOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        source: "tsc",
        severity: "error",
        file: "packages/core/src/index.ts",
        range: {
          start: { line: 10, column: 5 },
          end: { line: 10, column: 5 }
        },
        code: "TS2304",
        message: "Cannot find name 'x'."
      });
    });

    it("should parse warning in pretty format", () => {
      const output = "src/utils.ts:25:10 - warning TS6133: 'unused' is declared but never used.";
      const diagnostics = parseTscOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("warning");
    });
  });

  describe("sorting", () => {
    it("should sort diagnostics by file then by line", () => {
      const output = `
src/z.ts(5,1): error TS1005: Error in z.
src/a.ts(20,1): error TS1005: Error at line 20.
src/a.ts(10,1): error TS1005: Error at line 10.
src/a.ts(10,5): error TS1005: Error at column 5.
      `;
      const diagnostics = parseTscOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(4);
      // Should be sorted: a.ts:10:1, a.ts:10:5, a.ts:20:1, z.ts:5:1
      expect(diagnostics[0]?.file).toBe("packages/core/src/a.ts");
      expect(diagnostics[0]?.range?.start.line).toBe(10);
      expect(diagnostics[0]?.range?.start.column).toBe(1);
      expect(diagnostics[1]?.range?.start.column).toBe(5);
      expect(diagnostics[2]?.range?.start.line).toBe(20);
      expect(diagnostics[3]?.file).toBe("packages/core/src/z.ts");
    });
  });

  describe("path normalization", () => {
    it("should normalize Windows paths", () => {
      // Simulate relative path from project
      const output = "src\\index.ts(10,5): error TS2304: Cannot find name 'x'.";
      const diagnostics = parseTscOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      // Path should use forward slashes
      expect(diagnostics[0]?.file).toBe("packages/core/src/index.ts");
    });

    it("should handle absolute paths", () => {
      const output = "/repo/packages/core/src/index.ts(10,5): error TS2304: Cannot find name 'x'.";
      const diagnostics = parseTscOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.file).toBe("packages/core/src/index.ts");
    });
  });

  describe("edge cases", () => {
    it("should return empty array for empty output", () => {
      const diagnostics = parseTscOutput("", projectRoot, repoRoot);
      expect(diagnostics).toHaveLength(0);
    });

    it("should ignore non-diagnostic lines", () => {
      const output = `
Version 5.0.0
Starting compilation in watch mode...

src/index.ts(10,5): error TS2304: Cannot find name 'x'.

Found 1 error.
      `;
      const diagnostics = parseTscOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.code).toBe("TS2304");
    });

    it("should handle info severity", () => {
      const output = "src/index.ts(10,5): info TS1234: Some information.";
      const diagnostics = parseTscOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("info");
    });
  });
});

describe("countDiagnostics", () => {
  it("should count diagnostics by severity", () => {
    const diagnostics = [
      { source: "tsc", severity: "error" as const, message: "Error 1" },
      { source: "tsc", severity: "error" as const, message: "Error 2" },
      { source: "tsc", severity: "warning" as const, message: "Warning 1" },
      { source: "tsc", severity: "info" as const, message: "Info 1" },
      { source: "tsc", severity: "hint" as const, message: "Hint 1" }
    ];

    const counts = countDiagnostics(diagnostics);

    expect(counts).toEqual({
      errors: 2,
      warnings: 1,
      info: 1,
      hints: 1
    });
  });

  it("should return zeros for empty array", () => {
    const counts = countDiagnostics([]);

    expect(counts).toEqual({
      errors: 0,
      warnings: 0,
      info: 0,
      hints: 0
    });
  });
});
