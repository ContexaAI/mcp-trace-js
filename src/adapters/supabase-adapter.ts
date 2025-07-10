import { TraceAdapter, TraceData } from '../types';

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
                        type: traceData.type,
                        method: traceData.method ?? null,
                        session_id: traceData.session_id,
                        client_id: traceData.client_id ?? null,
                        duration: traceData.duration ?? null,
                        entity_name: traceData.arguments ?? null,
                        arguments: traceData.arguments ?? null,
                        response:
                            traceData.response !== undefined
                                ? typeof traceData.response === 'object'
                                    ? JSON.stringify(traceData.response)
                                    : String(traceData.response)
                                : null,
                        error: traceData.error ?? null,
                        timestamp: traceData.timestamp
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
