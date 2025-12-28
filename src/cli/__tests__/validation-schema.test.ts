import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const schemaPath = new URL(
  "../../../docs/reference/validation-report.schema.json",
  import.meta.url
);

describe("validation-report.schema.json", () => {
  it("should be valid JSON", () => {
    const raw = readFileSync(schemaPath, "utf8");

    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("should declare draft 2020-12 schema and required fields", () => {
    const raw = readFileSync(schemaPath, "utf8");
    const schema = JSON.parse(raw) as {
      $schema?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "tool",
        "toolVersion",
        "schemaVersion",
        "command",
        "generatedAt",
        "repo",
        "scope",
        "environment",
        "steps",
        "diagnostics",
        "warnings",
        "nextActions",
        "summary",
        "artifacts"
      ])
    );
  });
});
