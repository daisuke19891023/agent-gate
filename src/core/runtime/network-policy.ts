export type NetworkPolicy = 'default' | 'deny-all' | 'proxy';

export interface RuntimeNetworkConfig {
  prepare?: NetworkPolicy;
  validate?: NetworkPolicy;
}

export type RuntimeCommand = 'prepare' | 'validate';

export function resolveNetworkPolicy(
  command: RuntimeCommand,
  config?: RuntimeNetworkConfig,
): NetworkPolicy {
  if (command === 'prepare') {
    return config?.prepare ?? 'default';
  }

  return config?.validate ?? 'default';
}
