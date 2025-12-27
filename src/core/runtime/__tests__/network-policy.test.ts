import { describe, expect, it } from 'vitest';
import { resolveNetworkPolicy } from '../network-policy.js';

describe('resolveNetworkPolicy', () => {
  it('defaults prepare to default', () => {
    expect(resolveNetworkPolicy('prepare')).toBe('default');
  });

  it('defaults validate to default', () => {
    expect(resolveNetworkPolicy('validate')).toBe('default');
  });

  it('uses explicit overrides', () => {
    expect(
      resolveNetworkPolicy('prepare', { prepare: 'deny-all' }),
    ).toBe('deny-all');
    expect(
      resolveNetworkPolicy('validate', { validate: 'deny-all' }),
    ).toBe('deny-all');
  });
});
