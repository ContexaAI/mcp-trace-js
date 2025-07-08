import { TraceAdapter, TraceData } from '../types';

export interface ContexaTraceAdapterConfig {
    apiKey?: string;
    serverId?: string;
    apiUrl?: string;
    bufferSize?: number;
    flushInterval?: number; // in ms
    maxRetries?: number;
    retryDelay?: number;    // in ms
}

/**
 * Trace adapter that buffers events and sends them to the Contexa API with adaptive background sending.
 */
export class ContexaTraceAdapter implements TraceAdapter {
    private apiUrl: string;
    private apiKey: string;
    private serverId: string;
    private headers: Record<string, string>;
    private buffer: TraceData[] = [];
    private bufferSize: number;
    private flushInterval: number;
    private maxRetries: number;
    private retryDelay: number;
    private worker: NodeJS.Timeout | null = null;
    private isRunning = false;
    private stop = false;

    constructor(config: ContexaTraceAdapterConfig = {}) {
        this.apiUrl = config.apiUrl || process.env.CONTEXA_API_URL || 'http://localhost:4000/v1/trace/ingest';
        this.apiKey = config.apiKey || process.env.CONTEXA_API_KEY || '';
        this.serverId = config.serverId || process.env.CONTEXA_SERVER_ID || '';
        this.bufferSize = config.bufferSize ?? 1000;
        this.flushInterval = config.flushInterval ?? 1000;
        this.maxRetries = config.maxRetries ?? 3;
        this.retryDelay = config.retryDelay ?? 2000;

        if (!this.apiKey) {
            throw new Error('[ContexaTraceAdapter] Missing API key. Provide via `apiKey` or CONTEXA_API_KEY.');
        }

        if (!this.serverId) {
            throw new Error('[ContexaTraceAdapter] Missing server ID. Provide via `serverId` or CONTEXA_SERVER_ID.');
        }

        this.headers = {
            'X-API-KEY': this.apiKey,
            'X-Server-ID': this.serverId,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Adds a trace event to the buffer and starts the worker if not already running.
     */
    export(traceData: TraceData): void {
        if (this.buffer.length < this.bufferSize) {
            this.buffer.push(traceData);
            this.startWorker();
        } else {
            console.warn('[ContexaTraceAdapter] Buffer full — event dropped.');
        }
    }

    /**
     * Starts the background worker if it's not already running.
     */
    private startWorker() {
        if (this.isRunning || this.stop) return;

        this.isRunning = true;
        this.worker = setInterval(async () => {
            if (this.stop) return;

            const event = this.buffer.shift();
            if (!event) {
                this.stopWorker();
                return;
            }

            await this.sendEventWithRetry(event);
        }, this.flushInterval);
    }

    /**
     * Stops the background worker and marks the adapter as idle.
     */
    private stopWorker() {
        if (this.worker) {
            clearInterval(this.worker);
            this.worker = null;
        }
        this.isRunning = false;
    }

    /**
     * Sends a trace event with retry and backoff.
     */
    private async sendEventWithRetry(event: TraceData): Promise<void> {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: this.headers,
                    body: JSON.stringify(event),
                });

                if (response.ok) return;

                const errorText = await response.text();
                console.error(`[ContexaTraceAdapter] Server error (status ${response.status}): ${errorText}`);
            } catch (error) {
                console.error(`[ContexaTraceAdapter] Network error (attempt ${attempt}):`, error);
            }

            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }

        console.error('[ContexaTraceAdapter] Max retries exceeded — event dropped.');
    }

    /**
     * Flushes all remaining events immediately (used during shutdown).
     */
    async flush(timeout?: number): Promise<void> {
        const start = Date.now();

        while (this.buffer.length > 0) {
            if (timeout && Date.now() - start > timeout) {
                console.warn('[ContexaTraceAdapter] Flush timeout reached — events left:', this.buffer.length);
                break;
            }

            const event = this.buffer.shift();
            if (event) {
                await this.sendEventWithRetry(event);
            }
        }
    }

    /**
     * Stops the worker and optionally waits for all pending events to flush.
     */
    async shutdown(wait = true, timeout?: number): Promise<void> {
        this.stop = true;
        this.stopWorker();

        if (wait) {
            await this.flush(timeout);
        }
    }
}
