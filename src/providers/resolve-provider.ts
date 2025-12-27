import { runCommand } from '../core/process/run-command.js';
import { DockerProvider } from './docker-provider.js';
import { PodmanProvider } from './podman-provider.js';
import type {
  ContainerProvider,
  RuntimeProviderKind,
  RuntimeProviderPreference,
} from './types.js';

export interface ProviderResolution {
  kind: RuntimeProviderKind;
  provider: ContainerProvider | null;
}

export interface ProviderResolutionOptions {
  isAvailable?: (command: 'docker' | 'podman') => Promise<boolean>;
}

export async function resolveProvider(
  preference: RuntimeProviderPreference,
  options: ProviderResolutionOptions = {},
): Promise<ProviderResolution> {
  const requested = preference ?? 'auto';

  if (requested === 'none') {
    return { kind: 'none', provider: null };
  }

  if (requested === 'docker') {
    return { kind: 'docker', provider: new DockerProvider() };
  }

  if (requested === 'podman') {
    return { kind: 'podman', provider: new PodmanProvider() };
  }

  const isAvailable = options.isAvailable ?? defaultAvailabilityCheck;

  if (await isAvailable('docker')) {
    return { kind: 'docker', provider: new DockerProvider() };
  }

  if (await isAvailable('podman')) {
    return { kind: 'podman', provider: new PodmanProvider() };
  }

  return { kind: 'none', provider: null };
}

async function defaultAvailabilityCheck(
  command: 'docker' | 'podman',
): Promise<boolean> {
  try {
    const result = await runCommand({
      command,
      args: ['--version'],
      timeoutMs: 3_000,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
