import { TraceAdapter, TraceData } from '../types';

export class MultiAdapter implements TraceAdapter {
    private adapters: TraceAdapter[];

    constructor(...adapters: TraceAdapter[]) {
        this.adapters = adapters;
    }

      async export(traceData: TraceData): Promise<void> {
    const promises = this.adapters.map(async adapter => {
      try {
        const result = adapter.export(traceData);
        if (result instanceof Promise) {
          await result;
        }
      } catch (error) {
        console.error('Adapter export failed:', error);
      }
    });
    await Promise.allSettled(promises);
  }

      async flush(timeout?: number): Promise<void> {
    const promises = this.adapters.map(async adapter => {
      try {
        if (adapter.flush) {
          await adapter.flush(timeout);
        }
      } catch (error) {
        console.error('Adapter flush failed:', error);
      }
    });
    await Promise.allSettled(promises);
  }

      async shutdown(): Promise<void> {
    const promises = this.adapters.map(async adapter => {
      try {
        if (adapter.shutdown) {
          await adapter.shutdown();
        }
      } catch (error) {
        console.error('Adapter shutdown failed:', error);
      }
    });
    await Promise.allSettled(promises);
  }
} 