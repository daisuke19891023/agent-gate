import type { NetworkPolicy } from '../core/runtime/network-policy.js';

export type RuntimeProviderKind = 'docker' | 'podman' | 'none';
export type RuntimeProviderPreference =
  | 'auto'
  | 'docker'
  | 'podman'
  | 'none'
  | undefined;

export interface ContainerRunOptions {
  image: string;
  command?: string[];
  networkPolicy: NetworkPolicy;
}

export interface ContainerProvider {
  kind: Exclude<RuntimeProviderKind, 'none'>;
  buildRunArgs(options: ContainerRunOptions): string[];
}
