import { describe, it, expect } from 'vitest';
import { ExitCode, exitCodeFromCategory } from '../exit-codes.js';

describe('ExitCode', () => {
  it('should have Success = 0', () => {
    expect(ExitCode.Success).toBe(0);
  });

  it('should have ValidationFailed = 1', () => {
    expect(ExitCode.ValidationFailed).toBe(1);
  });

  it('should have UserError = 2', () => {
    expect(ExitCode.UserError).toBe(2);
  });

  it('should have InfrastructureError = 3', () => {
    expect(ExitCode.InfrastructureError).toBe(3);
  });

  it('should have InternalError = 4', () => {
    expect(ExitCode.InternalError).toBe(4);
  });

  it('should have exactly 5 exit codes', () => {
    const exitCodes = Object.values(ExitCode).filter(
      (v) => typeof v === 'number',
    );
    expect(exitCodes).toHaveLength(5);
  });
});

describe('exitCodeFromCategory', () => {
  it('should return ValidationFailed for "validation" category', () => {
    expect(exitCodeFromCategory('validation')).toBe(ExitCode.ValidationFailed);
  });

  it('should return UserError for "config" category', () => {
    expect(exitCodeFromCategory('config')).toBe(ExitCode.UserError);
  });

  it('should return UserError for "usage" category', () => {
    expect(exitCodeFromCategory('usage')).toBe(ExitCode.UserError);
  });

  it('should return InfrastructureError for "infrastructure" category', () => {
    expect(exitCodeFromCategory('infrastructure')).toBe(
      ExitCode.InfrastructureError,
    );
  });

  it('should return InternalError for "internal" category', () => {
    expect(exitCodeFromCategory('internal')).toBe(ExitCode.InternalError);
  });
});
