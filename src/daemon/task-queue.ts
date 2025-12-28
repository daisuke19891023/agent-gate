export interface QueueTask<T> {
  run: () => Promise<T>;
}

export class TaskQueue {
  private readonly queue: Array<QueueTask<unknown>> = [];
  private active = false;

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        run: async () => {
          try {
            const result = await task();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }
      });
      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.active) {
      return;
    }
    this.active = true;
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) {
        continue;
      }
      await next.run();
    }
    this.active = false;
  }
}
