import { TraceAdapter, TraceData } from '../types';

export interface PostgresConfig {
    dsn: string;
    tableName?: string;
}

export class PostgresTraceAdapter implements TraceAdapter {
    private dsn: string;
    private tableName: string;
    private client: any = null;

    constructor(config: PostgresConfig) {
        this.dsn = config.dsn;
        this.tableName = config.tableName || 'mcp_traces';
    }

      private async getClient() {
    if (!this.client) {
      try {
        // Dynamic import to avoid requiring pg at module level
        const pg = await import('pg');
        this.client = new pg.Client({ connectionString: this.dsn });
        await this.client.connect();
        
        // Ensure table exists
        await this.createTable();
      } catch (error) {
        console.error('Failed to connect to PostgreSQL:', error);
        throw new Error('PostgreSQL adapter requires the "pg" package to be installed');
      }
    }
    return this.client;
  }

    private async createTable() {
        const client = await this.getClient();
        const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        session_id TEXT NOT NULL,
        trace_data JSONB NOT NULL
      );
    `;
        await client.query(createTableQuery);
    }

    async export(traceData: TraceData): Promise<void> {
        try {
            const client = await this.getClient();
            const query = `
        INSERT INTO ${this.tableName} (timestamp, session_id, trace_data)
        VALUES ($1, $2, $3)
      `;
            await client.query(query, [
                new Date(traceData.timestamp),
                traceData.session_id,
                traceData
            ]);
        } catch (error) {
            console.error('Failed to write trace to PostgreSQL:', error);
        }
    }

    async flush(): Promise<void> {
        // PostgreSQL writes are immediate, no flushing needed
        return Promise.resolve();
    }

    async shutdown(): Promise<void> {
        if (this.client) {
            await this.client.end();
            this.client = null;
        }
    }
} 