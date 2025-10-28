import { TraceAdapter, TraceData } from '../types';

/**
 * Create the table in the database using the following SQL:
 * 
 * ```sql
CREATE TABLE IF NOT EXISTS trace_events (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  method TEXT,
  entity_name TEXT,
  request JSONB,
  response JSONB,
  duration INTEGER,
  trace_id TEXT,
  session_id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  user_email TEXT,
  client_id TEXT,
  client_name TEXT,
  client_version TEXT,
  server_id TEXT,
  server_name TEXT,
  server_version TEXT,
  is_error BOOLEAN,
  error TEXT,
  ip_address TEXT,
  context TEXT,
  sdk_language TEXT,
  sdk_version TEXT,
  mcp_trace_version TEXT,
  metadata JSONB
);
```
 */

export interface PostgresConfig {
  /**
   * PostgreSQL connection string (DSN)
   * Example: postgres://user:pass@host:port/dbname
   */
  dsn: string;

  /**
   * Optional name of the table to insert trace events into.
   * Defaults to 'trace_events'.
   */
  tableName?: string;

  /**
   * Optional batch size for bulk inserts. When this many events are buffered,
   * they will be inserted in a single batch. Defaults to 100.
   */
  batchSize?: number;

  /**
   * Optional timeout in milliseconds to force flush buffered events.
   * Defaults to 5000ms (5 seconds).
   */
  flushInterval?: number;
}

/**
 * A TraceAdapter implementation that writes trace events to a PostgreSQL table.
 * ⚠️ Assumes the table already exists — it does not create it automatically.
 *
 * Requires the `pg` package (PostgreSQL client for Node.js).
 */
export class PostgresTraceAdapter implements TraceAdapter {
  private dsn: string;
  private tableName: string;
  private client: any = null;
  private batchSize: number;
  private flushInterval: number;
  private buffer: TraceData[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: PostgresConfig) {
    this.dsn = config.dsn;
    this.tableName = config.tableName || 'trace_events';
    this.batchSize = config.batchSize || 100;
    this.flushInterval = config.flushInterval || 5000;

    // Set up automatic flushing
    this.startFlushTimer();
  }

  /**
   * Starts the automatic flush timer.
   */
  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('[PostgresTraceAdapter] Auto-flush failed:', error);
      });
    }, this.flushInterval);
  }

  /**
   * Stops the automatic flush timer.
   */
  private stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Lazily initializes and returns the PostgreSQL client.
   * Uses dynamic import for `pg` to avoid forcing a dependency.
   */
  private async getClient() {
    if (!this.client) {
      try {
        const pg = await import('pg');
        this.client = new pg.Client({ connectionString: this.dsn });
        await this.client.connect();
      } catch (error) {
        console.error('[PostgresTraceAdapter] Failed to connect to PostgreSQL:', error);
        throw new Error(
          'PostgresTraceAdapter requires the "pg" package. Install it using: npm install pg'
        );
      }
    }
    return this.client;
  }

  /**
   * Converts a single trace data object to values array for SQL insertion.
   */
  private traceDataToValues(traceData: TraceData): any[] {
    return [
      traceData.timestamp,
      traceData.type,
      traceData.method ?? null,
      traceData.entity_name ?? null,
      traceData.request ? JSON.stringify(traceData.request) : null,
      traceData.response !== undefined
        ? typeof traceData.response === 'object'
          ? JSON.stringify(traceData.response)
          : String(traceData.response)
        : null,
      traceData.duration ?? null,
      traceData.id ?? null,
      traceData.session_id,
      traceData.user_id ?? null,
      traceData.user_name ?? null,
      traceData.user_email ?? null,
      traceData.client_id ?? null,
      traceData.client_name ?? null,
      traceData.client_version ?? null,
      traceData.server_id ?? null,
      traceData.server_name ?? null,
      traceData.server_version ?? null,
      traceData.is_error ?? null,
      traceData.error ?? null,
      traceData.ip_address ?? null,
      traceData.context ?? null,
      traceData.sdk_language ?? null,
      traceData.sdk_version ?? null,
      traceData.mcp_trace_version ?? null,
      traceData.metadata ? JSON.stringify(traceData.metadata) : null
    ];
  }

  /**
   * Performs a batch insert of trace events.
   */
  private async performBatchInsert(events: TraceData[]): Promise<void> {
    if (events.length === 0) return;

    try {
      const client = await this.getClient();

      // Build the batch insert query
      const insertSQL = `
        INSERT INTO ${this.tableName} (
          timestamp, type, method, entity_name, request, response, duration,
          trace_id, session_id, user_id, user_name, user_email,
          client_id, client_name, client_version,
          server_id, server_name, server_version,
          is_error, error, ip_address, context,
          sdk_language, sdk_version, mcp_trace_version, metadata
        ) VALUES ${events.map((_, index) => {
        const baseIndex = index * 27;
        return `(${Array.from({ length: 27 }, (_, i) => `$${baseIndex + i + 1}`).join(', ')})`;
      }).join(', ')}
      `;

      // Flatten all values into a single array
      const values = events.flatMap(event => this.traceDataToValues(event));

      await client.query(insertSQL, values);
    } catch (error) {
      console.error(`[PostgresTraceAdapter] Failed to batch insert into "${this.tableName}". Ensure the table exists.`, error);
    }
  }

  /**
   * Adds a trace event to the buffer for batch insertion.
   * Events are automatically flushed when the buffer reaches batchSize
   * or when the flush interval expires.
   *
   * @param traceData - The trace metadata to persist
   */
  async export(traceData: TraceData): Promise<void> {
    // Add to buffer
    this.buffer.push(traceData);

    // If buffer is full, flush immediately
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Flushes all buffered trace events to PostgreSQL in a single batch insert.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    // Create a copy of the buffer and clear it immediately to avoid race conditions
    const eventsToInsert = [...this.buffer];
    this.buffer = [];

    // Perform the batch insert
    await this.performBatchInsert(eventsToInsert);
  }

  /**
   * Closes the PostgreSQL connection and cleans up the client.
   * Flushes any remaining buffered events before closing.
   */
  async shutdown(): Promise<void> {
    // Stop the flush timer
    this.stopFlushTimer();

    // Flush any remaining events
    await this.flush();

    // Close the database connection
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
