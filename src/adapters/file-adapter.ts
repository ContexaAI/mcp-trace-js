import { appendFileSync, existsSync, writeFileSync } from 'fs';
import { TraceAdapter, TraceData } from '../types';

export class FileAdapter implements TraceAdapter {
    private filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
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
        return Promise.resolve();
    }

    shutdown(): Promise<void> {
        return Promise.resolve();
    }
} 