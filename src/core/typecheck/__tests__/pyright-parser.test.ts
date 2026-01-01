import { describe, it, expect } from "vitest";
import { parsePyrightOutput, tryParsePyrightOutput } from "../python/pyright-parser.js";

describe("parsePyrightOutput", () => {
  const projectRoot = "/repo/python/backend";
  const repoRoot = "/repo";

  describe("basic parsing", () => {
    it("should parse single error", () => {
      const output = JSON.stringify({
        version: "1.1.0",
        generalDiagnostics: [
          {
            file: "/repo/python/backend/src/app.py",
            severity: 1, // error
            message: 'Cannot assign to "x" because it is a constant',
            range: {
              start: { line: 9, character: 0 },
              end: { line: 9, character: 10 }
            },
            rule: "reportConstantRedefinition"
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        source: "pyright",
        severity: "error",
        file: "python/backend/src/app.py",
        range: {
          start: { line: 10, column: 1 }, // 1-based
          end: { line: 10, column: 11 }
        },
        code: "reportConstantRedefinition",
        message: 'Cannot assign to "x" because it is a constant'
      });
    });

    it("should parse warning", () => {
      const output = JSON.stringify({
        generalDiagnostics: [
          {
            file: "/repo/python/backend/src/utils.py",
            severity: 2, // warning
            message: "Variable is not used",
            range: {
              start: { line: 4, character: 4 },
              end: { line: 4, character: 10 }
            },
            rule: "reportUnusedVariable"
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("warning");
    });

    it("should parse info severity", () => {
      const output = JSON.stringify({
        generalDiagnostics: [
          {
            file: "/repo/python/backend/src/app.py",
            severity: 3, // info
            message: "Some information",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("info");
    });

    it("should parse multiple diagnostics", () => {
      const output = JSON.stringify({
        generalDiagnostics: [
          {
            file: "/repo/python/backend/src/app.py",
            severity: 1,
            message: "Error 1",
            range: { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } }
          },
          {
            file: "/repo/python/backend/src/app.py",
            severity: 1,
            message: "Error 2",
            range: { start: { line: 5, character: 0 }, end: { line: 5, character: 5 } }
          },
          {
            file: "/repo/python/backend/src/utils.py",
            severity: 2,
            message: "Warning",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(3);
    });
  });

  describe("sorting", () => {
    it("should sort by file then by line", () => {
      const output = JSON.stringify({
        generalDiagnostics: [
          {
            file: "/repo/python/backend/src/z.py",
            severity: 1,
            message: "Error in z",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
          },
          {
            file: "/repo/python/backend/src/a.py",
            severity: 1,
            message: "Error at line 20",
            range: { start: { line: 19, character: 0 }, end: { line: 19, character: 5 } }
          },
          {
            file: "/repo/python/backend/src/a.py",
            severity: 1,
            message: "Error at line 10",
            range: { start: { line: 9, character: 0 }, end: { line: 9, character: 5 } }
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(3);
      // Should be sorted: a.py:10, a.py:20, z.py:1
      expect(diagnostics[0]?.file).toBe("python/backend/src/a.py");
      expect(diagnostics[0]?.range?.start.line).toBe(10);
      expect(diagnostics[1]?.range?.start.line).toBe(20);
      expect(diagnostics[2]?.file).toBe("python/backend/src/z.py");
    });
  });

  describe("path normalization", () => {
    it("should normalize paths to repo-relative", () => {
      const output = JSON.stringify({
        generalDiagnostics: [
          {
            file: "/repo/python/backend/src/app.py",
            severity: 1,
            message: "Error",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);

      expect(diagnostics[0]?.file).toBe("python/backend/src/app.py");
    });

    it("should handle relative paths", () => {
      const output = JSON.stringify({
        generalDiagnostics: [
          {
            file: "src/app.py",
            severity: 1,
            message: "Error",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);

      expect(diagnostics[0]?.file).toBe("python/backend/src/app.py");
    });
  });

  describe("line number conversion", () => {
    it("should convert 0-based to 1-based line numbers", () => {
      const output = JSON.stringify({
        generalDiagnostics: [
          {
            file: "/repo/python/backend/src/app.py",
            severity: 1,
            message: "Error",
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 }
            }
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);

      // Line 0 (0-based) should become line 1 (1-based)
      expect(diagnostics[0]?.range?.start.line).toBe(1);
      expect(diagnostics[0]?.range?.start.column).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("should return empty array for empty output", () => {
      const diagnostics = parsePyrightOutput("", projectRoot, repoRoot);
      expect(diagnostics).toHaveLength(0);
    });

    it("should return empty array for invalid JSON", () => {
      const diagnostics = parsePyrightOutput("not json", projectRoot, repoRoot);
      expect(diagnostics).toHaveLength(0);
    });

    it("should handle missing generalDiagnostics", () => {
      const output = JSON.stringify({ version: "1.0.0" });
      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);
      expect(diagnostics).toHaveLength(0);
    });

    it("should skip diagnostics without message", () => {
      const output = JSON.stringify({
        generalDiagnostics: [
          {
            file: "/repo/python/backend/src/app.py",
            severity: 1
            // no message
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);
      expect(diagnostics).toHaveLength(0);
    });

    it("should handle missing range", () => {
      const output = JSON.stringify({
        generalDiagnostics: [
          {
            file: "/repo/python/backend/src/app.py",
            severity: 1,
            message: "Error without range"
            // no range
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.range).toBeUndefined();
    });

    it("should handle missing file", () => {
      const output = JSON.stringify({
        generalDiagnostics: [
          {
            severity: 1,
            message: "Error without file"
          }
        ]
      });

      const diagnostics = parsePyrightOutput(output, projectRoot, repoRoot);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.file).toBeUndefined();
    });
  });
});

describe("tryParsePyrightOutput", () => {
  const projectRoot = "/repo/python/backend";
  const repoRoot = "/repo";

  it("should return parseSuccess true for valid JSON", () => {
    const output = JSON.stringify({
      generalDiagnostics: [
        {
          file: "/repo/python/backend/src/app.py",
          severity: 1,
          message: "Error",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
        }
      ]
    });

    const result = tryParsePyrightOutput(output, projectRoot, repoRoot);

    expect(result.parseSuccess).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
  });

  it("should return parseSuccess false for invalid JSON", () => {
    const result = tryParsePyrightOutput("not json", projectRoot, repoRoot);

    expect(result.parseSuccess).toBe(false);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("should return parseSuccess true for empty output", () => {
    const result = tryParsePyrightOutput("", projectRoot, repoRoot);

    expect(result.parseSuccess).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });
});
