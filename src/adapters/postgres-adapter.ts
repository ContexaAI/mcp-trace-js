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
  session_id TEXT NOT NULL,
  client_id TEXT,
  duration INTEGER,
  entity_name TEXT,
  arguments JSONB,
  response TEXT,
  error TEXT
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

  constructor(config: PostgresConfig) {
    this.dsn = config.dsn;
    this.tableName = config.tableName || 'trace_events';
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
   * Inserts a trace event into the PostgreSQL table.
   *
   * @param traceData - The trace metadata to persist
   */
  async export(traceData: TraceData): Promise<void> {
    try {
      const client = await this.getClient();

      const insertSQL = `
        INSERT INTO ${this.tableName} (
          timestamp, type, method, session_id, client_id, duration,
          entity_name, arguments, response, error
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      const values = [
        traceData.timestamp,
        traceData.type,
        traceData.method ?? null,
        traceData.session_id,
        traceData.client_id ?? null,
        traceData.duration ?? null,
        traceData.entity_name ?? null,
        traceData.entity_params ? JSON.stringify(traceData.entity_params) : null,
        traceData.entity_response !== undefined
          ? typeof traceData.entity_response === 'object'
            ? JSON.stringify(traceData.entity_response)
            : String(traceData.entity_response)
          : null,
        traceData.error ?? null
      ];

      await client.query(insertSQL, values);
    } catch (error) {
      console.error(`[PostgresTraceAdapter] Failed to insert into "${this.tableName}". Ensure the table exists.`, error);
    }
  }

  /**
   * PostgreSQL writes are immediate; no flushing is required.
   */
  async flush(): Promise<void> {
    return;
  }

  /**
   * Closes the PostgreSQL connection and cleans up the client.
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
