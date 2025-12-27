import { describe, expect, it } from 'vitest';
import { PodmanProvider } from '../podman-provider.js';

describe('PodmanProvider', () => {
  it('adds --network none when deny-all', () => {
    const provider = new PodmanProvider();

    const args = provider.buildRunArgs({
      image: 'alpine:latest',
      networkPolicy: 'deny-all',
      command: ['echo', 'hi'],
    });

    expect(args).toEqual([
      'run',
      '--rm',
      '--network',
      'none',
      'alpine:latest',
      'echo',
      'hi',
    ]);
  });

  it('omits network flags for default', () => {
    const provider = new PodmanProvider();

    const args = provider.buildRunArgs({
      image: 'alpine:latest',
      networkPolicy: 'default',
    });

    expect(args).toEqual(['run', '--rm', 'alpine:latest']);
  });
});
