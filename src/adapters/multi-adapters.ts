import { TraceAdapter, TraceData } from '../types';

/**
 * A TraceAdapter implementation that fans out to multiple adapters.
 * Useful for logging to multiple destinations (e.g., console, DB, Supabase).
 */
export class MultiAdapter implements TraceAdapter {
  private adapters: TraceAdapter[];

  /**
   * @param adapters - One or more TraceAdapter instances to combine
   */
  constructor(...adapters: TraceAdapter[]) {
    this.adapters = adapters;
  }

  /**
   * Exports trace data to all configured adapters in parallel.
   * Failures in one adapter do not affect others.
   *
   * @param traceData - The trace event to export
   */
  async export(traceData: TraceData): Promise<void> {
    const promises = this.adapters.map(async (adapter, index) => {
      try {
        await adapter.export(traceData);
      } catch (error) {
        console.error(`[MultiAdapter] export failed for adapter #${index + 1}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Flushes all adapters if they implement the `flush` method.
   * Failures are logged but do not interrupt others.
   *
   * @param timeout - Optional flush timeout (passed to each adapter)
   */
  async flush(timeout?: number): Promise<void> {
    const promises = this.adapters.map(async (adapter, index) => {
      if (typeof adapter.flush === 'function') {
        try {
          await adapter.flush(timeout);
        } catch (error) {
          console.error(`[MultiAdapter] flush failed for adapter #${index + 1}:`, error);
        }
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Shuts down all adapters if they implement the `shutdown` method.
   * Errors are logged individually.
   */
  async shutdown(): Promise<void> {
    const promises = this.adapters.map(async (adapter, index) => {
      if (typeof adapter.shutdown === 'function') {
        try {
          await adapter.shutdown();
        } catch (error) {
          console.error(`[MultiAdapter] shutdown failed for adapter #${index + 1}:`, error);
        }
      }
    });

    await Promise.allSettled(promises);
  }
}
