export interface TraceData {
    type: 'request' | 'notification';
    method?: string;
    timestamp: string;
    session_id: string;
    client_id?: string;
    duration?: number;
    entity_name?: string;
    arguments?: any;
    response?: any;
    error?: string;
    ip_address?: string;
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

export type MaskFunction = (data: any) => any;

export interface TraceMiddlewareOptions {
    adapter: TraceAdapter;
    logFields?: LogFields;
    mask?: MaskFunction;
} 