import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../task-queue.js';

describe('TaskQueue', () => {
  it('should run tasks sequentially', async () => {
    const queue = new TaskQueue();
    const results: number[] = [];

    await Promise.all([
      queue.enqueue(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        results.push(1);
      }),
      queue.enqueue(async () => {
        results.push(2);
      }),
    ]);

    expect(results).toEqual([1, 2]);
  });
});
