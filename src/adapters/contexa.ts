import { TraceAdapter, TraceData } from '../types';

export interface ContexaConfig {
    apiKey?: string;
    serverId?: string;
    baseUrl?: string;
}

export class ContexaTraceAdapter implements TraceAdapter {
    private apiKey: string;
    private serverId: string;
    private baseUrl: string;
    private queue: TraceData[] = [];
    private flushInterval: NodeJS.Timeout | null = null;

    constructor(config: ContexaConfig = {}) {
        this.apiKey = config.apiKey || process.env.CONTEXA_API_KEY || '';
        this.serverId = config.serverId || process.env.CONTEXA_SERVER_ID || '';
        this.baseUrl = config.baseUrl || 'https://api.contexa.ai';

        if (!this.apiKey) {
            throw new Error('Contexa API key is required. Set CONTEXA_API_KEY environment variable or pass apiKey in config.');
        }

        if (!this.serverId) {
            throw new Error('Contexa Server ID is required. Set CONTEXA_SERVER_ID environment variable or pass serverId in config.');
        }

        // Set up periodic flushing
        this.flushInterval = setInterval(() => {
            this.flush().catch(console.error);
        }, 5000); // Flush every 5 seconds
    }

    export(traceData: TraceData): void {
        this.queue.push(traceData);

        // Flush immediately if queue gets too large
        if (this.queue.length >= 100) {
            this.flush().catch(console.error);
        }
    }

    async flush(timeout: number = 5000): Promise<void> {
        if (this.queue.length === 0) return;

        const traces = [...this.queue];
        this.queue = [];

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${this.baseUrl}/api/v1/traces`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'X-Server-ID': this.serverId,
                },
                body: JSON.stringify({ traces }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Contexa API error: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('Failed to send traces to Contexa:', error);
            // Re-queue failed traces
            this.queue.unshift(...traces);
        }
    }

    async shutdown(): Promise<void> {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        await this.flush();
    }
} 