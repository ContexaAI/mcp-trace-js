import { TraceAdapter, TraceData } from '../types';

/**
 * Create the table in Supabase using the following SQL:
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

export interface SupabaseConfig {
    /**
     * Instance of Supabase client (must be initialized)
     */
    supabaseClient: any;

    /**
     * Name of the Supabase table to store trace events (defaults to 'trace_events')
     */
    tableName?: string;
}

/**
 * A TraceAdapter that writes trace logs to a Supabase Postgres table via its API.
 * ⚠️ Requires a valid Supabase client instance and an existing table.
 */
export class SupabaseTraceAdapter implements TraceAdapter {
    private supabaseClient: any;
    private tableName: string;

    constructor(config: SupabaseConfig) {
        this.supabaseClient = config.supabaseClient;
        this.tableName = config.tableName || 'trace_events';
    }

    /**
     * Sends trace data to Supabase for insertion into the specified table.
     *
     * @param traceData - The trace payload to store
     */
    async export(traceData: TraceData): Promise<void> {
        try {
            const { error } = await this.supabaseClient
                .from(this.tableName)
                .insert([
                    {
                        timestamp: traceData.timestamp,
                        type: traceData.type,
                        method: traceData.method ?? null,
                        entity_name: traceData.entity_name ?? null,
                        request: traceData.request ? JSON.stringify(traceData.request) : null,
                        response: traceData.response !== undefined
                            ? typeof traceData.response === 'object'
                                ? JSON.stringify(traceData.response)
                                : String(traceData.response)
                            : null,
                        duration: traceData.duration ?? null,
                        trace_id: traceData.id ?? null,
                        session_id: traceData.session_id,
                        user_id: traceData.user_id ?? null,
                        user_name: traceData.user_name ?? null,
                        user_email: traceData.user_email ?? null,
                        client_id: traceData.client_id ?? null,
                        client_name: traceData.client_name ?? null,
                        client_version: traceData.client_version ?? null,
                        server_id: traceData.server_id ?? null,
                        server_name: traceData.server_name ?? null,
                        server_version: traceData.server_version ?? null,
                        is_error: traceData.is_error ?? null,
                        error: traceData.error ?? null,
                        ip_address: traceData.ip_address ?? null,
                        context: traceData.context ?? null,
                        sdk_language: traceData.sdk_language ?? null,
                        sdk_version: traceData.sdk_version ?? null,
                        mcp_trace_version: traceData.mcp_trace_version ?? null,
                        metadata: traceData.metadata ? JSON.stringify(traceData.metadata) : null
                    }
                ]);

            if (error) {
                throw error;
            }
        } catch (error) {
            console.error('[SupabaseTraceAdapter] Failed to insert trace event:', error);
        }
    }

    /**
     * Supabase writes are immediate; nothing to flush.
     */
    async flush(): Promise<void> {
        return;
    }

    /**
     * Supabase client doesn't need shutdown handling.
     */
    async shutdown(): Promise<void> {
        return;
    }
}
