import { describe, expect, it } from 'vitest';
import { DockerProvider } from '../docker-provider.js';

describe('DockerProvider', () => {
  it('adds --network none when deny-all', () => {
    const provider = new DockerProvider();

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
    const provider = new DockerProvider();

    const args = provider.buildRunArgs({
      image: 'alpine:latest',
      networkPolicy: 'default',
    });

    expect(args).toEqual(['run', '--rm', 'alpine:latest']);
  });
});
