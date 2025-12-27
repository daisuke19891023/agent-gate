import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { configSchema } from '../schema.js';
import { configJsonSchema } from '../json-schema.js';

const schemaPath = new URL(
  '../../../docs/reference/config.schema.json',
  import.meta.url,
);

describe('config schema', () => {
  it('accepts minimal config', () => {
    const parsed = configSchema.parse({ schemaVersion: 1 });
    expect(parsed).toEqual({ schemaVersion: 1 });
  });

  it('rejects unknown top-level keys', () => {
    expect(() =>
      configSchema.parse({ schemaVersion: 1, extra: true }),
    ).toThrow();
  });

  it('rejects unknown nested keys', () => {
    expect(() =>
      configSchema.parse({
        schemaVersion: 1,
        runtime: {
          provider: 'auto',
          unexpected: 'nope',
        },
      }),
    ).toThrow();
  });

  it('matches the published JSON schema', () => {
    const raw = readFileSync(schemaPath, 'utf8');
    const published = JSON.parse(raw) as unknown;

    expect(published).toEqual(configJsonSchema);
  });
});
