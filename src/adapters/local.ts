import { appendFileSync, existsSync, writeFileSync } from 'fs';
import { TraceAdapter, TraceData } from '../types';

export class LocalTraceAdapter implements TraceAdapter {
    private filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
        // Create file if it doesn't exist
        if (!existsSync(filePath)) {
            writeFileSync(filePath, '');
        }
    }

    export(traceData: TraceData): void {
        try {
            const jsonLine = JSON.stringify(traceData) + '\n';
            appendFileSync(this.filePath, jsonLine);
        } catch (error) {
            console.error('Failed to write trace to file:', error);
        }
    }

    flush(): Promise<void> {
        // File writes are synchronous, so no flushing needed
        return Promise.resolve();
    }

    shutdown(): Promise<void> {
        // No cleanup needed for file adapter
        return Promise.resolve();
    }
} 