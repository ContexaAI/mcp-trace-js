export interface TraceData {
    type: string;
    method?: string;
    entity_name?: string;
    request?: any;
    response?: any;

    timestamp: string;
    duration?: number;

    id?: string;
    session_id: string;

    user_id?: string;
    user_name?: string;
    user_email?: string;

    client_id?: string;
    client_name?: string;
    client_version?: string;

    server_id?: string;
    server_name?: string;
    server_version?: string;

    is_error?: boolean;
    error?: string;

    ip_address?: string;

    context?: string;
    sdk_language?: string;
    sdk_version?: string;
    mcp_trace_version?: string;

    metadata?: Record<string, any>;
}

export interface LogFields {
    type?: boolean;
    method?: boolean;
    timestamp?: boolean;
    session_id?: boolean;
    client_id?: boolean;
    duration?: boolean;
    entity_name?: boolean;
    arguments?: boolean;
    response?: boolean;
    error?: boolean;
}

export interface TraceAdapter {
    export(traceData: TraceData): Promise<void> | void;
    flush?(timeout?: number): Promise<void>;
    shutdown?(): Promise<void>;
}

export type RedactFunction = (data: any) => any;

export interface User {
    user_id: string;
    user_name: string;
    user_email: string;
}

export type IdentifyUser = (headers: Record<string, string | string[] | undefined>) => User | undefined;

export interface TraceMiddlewareOptions {
    adapter: TraceAdapter;
    logFields?: LogFields;
    redact?: RedactFunction;
    identifyUser?: IdentifyUser;
} 