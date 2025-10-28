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
          timestamp, type, method, entity_name, request, response, duration,
          trace_id, session_id, user_id, user_name, user_email,
          client_id, client_name, client_version,
          server_id, server_name, server_version,
          is_error, error, ip_address, context,
          sdk_language, sdk_version, mcp_trace_version, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      `;

      const values = [
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
