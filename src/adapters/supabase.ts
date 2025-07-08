import { TraceAdapter, TraceData } from '../types';

export interface SupabaseConfig {
    supabaseClient: any;
    tableName?: string;
}

export class SupabaseTraceAdapter implements TraceAdapter {
    private supabaseClient: any;
    private tableName: string;

    constructor(config: SupabaseConfig) {
        this.supabaseClient = config.supabaseClient;
        this.tableName = config.tableName || 'mcp_traces';
    }

    async export(traceData: TraceData): Promise<void> {
        try {
            const { error } = await this.supabaseClient
                .from(this.tableName)
                .insert({
                    timestamp: new Date(traceData.timestamp).toISOString(),
                    session_id: traceData.session_id,
                    trace_data: traceData
                });

            if (error) {
                throw error;
            }
        } catch (error) {
            console.error('Failed to write trace to Supabase:', error);
        }
    }

    async flush(): Promise<void> {
        // Supabase writes are immediate, no flushing needed
        return Promise.resolve();
    }

    async shutdown(): Promise<void> {
        // No cleanup needed for Supabase adapter
        return Promise.resolve();
    }
} 