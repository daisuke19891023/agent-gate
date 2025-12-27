import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { outputJson, wrapInternalError } from '../output.js';
import { version } from '../version.js';

describe('outputJson', () => {
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWriteSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  it('should output compact JSON when pretty=false', () => {
    const data = { foo: 'bar', baz: 123 };
    outputJson(data, false);

    expect(stdoutWriteSpy).toHaveBeenCalledWith('{"foo":"bar","baz":123}\n');
  });

  it('should output pretty-printed JSON when pretty=true', () => {
    const data = { foo: 'bar' };
    outputJson(data, true);

    const output = stdoutWriteSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('\n');
    expect(output).toContain('  ');
    expect(JSON.parse(output)).toEqual(data);
  });

  it('should append newline to output', () => {
    outputJson({ test: true }, false);

    const output = stdoutWriteSpy.mock.calls[0]?.[0] as string;
    expect(output.endsWith('\n')).toBe(true);
  });

  it('should handle nested objects', () => {
    const data = { outer: { inner: { deep: 'value' } } };
    outputJson(data, false);

    const output = stdoutWriteSpy.mock.calls[0]?.[0] as string;
    expect(JSON.parse(output)).toEqual(data);
  });

  it('should handle arrays', () => {
    const data = { items: [1, 2, 3] };
    outputJson(data, false);

    const output = stdoutWriteSpy.mock.calls[0]?.[0] as string;
    expect(JSON.parse(output)).toEqual(data);
  });

  it('should handle null values', () => {
    const data = { value: null };
    outputJson(data, false);

    const output = stdoutWriteSpy.mock.calls[0]?.[0] as string;
    expect(JSON.parse(output)).toEqual(data);
  });

  it('should handle empty objects', () => {
    outputJson({}, false);

    expect(stdoutWriteSpy).toHaveBeenCalledWith('{}\n');
  });

  it('should handle strings', () => {
    outputJson('test string', false);

    expect(stdoutWriteSpy).toHaveBeenCalledWith('"test string"\n');
  });
});

describe('wrapInternalError', () => {
  it('should create InternalErrorOutput from Error instance', () => {
    const error = new Error('Test error message');
    const result = wrapInternalError(error);

    expect(result.error.message).toBe('Test error message');
  });

  it('should include stack trace when available', () => {
    const error = new Error('Test error');
    const result = wrapInternalError(error);

    expect(result.error.stack).toBeDefined();
    expect(result.error.stack).toContain('Test error');
  });

  it('should handle non-Error values (strings)', () => {
    const result = wrapInternalError('string error');

    expect(result.error.message).toBe('string error');
    expect(result.error.stack).toBeUndefined();
  });

  it('should handle non-Error values (objects)', () => {
    const result = wrapInternalError({ custom: 'error' });

    expect(result.error.message).toBe('[object Object]');
  });

  it('should set status to "internal_error"', () => {
    const result = wrapInternalError(new Error('test'));

    expect(result.status).toBe('internal_error');
  });

  it('should include tool name "agent-gate"', () => {
    const result = wrapInternalError(new Error('test'));

    expect(result.tool).toBe('agent-gate');
  });

  it('should include current version', () => {
    const result = wrapInternalError(new Error('test'));

    expect(result.toolVersion).toBe(version);
  });

  it('should include schemaVersion 1', () => {
    const result = wrapInternalError(new Error('test'));

    expect(result.schemaVersion).toBe(1);
  });

  it('should include generatedAt timestamp in ISO format', () => {
    const before = new Date();
    const result = wrapInternalError(new Error('test'));
    const after = new Date();

    const generated = new Date(result.generatedAt);
    expect(generated.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(generated.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should handle undefined', () => {
    const result = wrapInternalError(undefined);

    expect(result.error.message).toBe('undefined');
  });

  it('should handle null', () => {
    const result = wrapInternalError(null);

    expect(result.error.message).toBe('null');
  });
});
