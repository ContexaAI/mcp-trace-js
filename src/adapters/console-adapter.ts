import { TraceAdapter, TraceData } from '../types';

export class ConsoleAdapter implements TraceAdapter {
    export(traceData: TraceData): void {
        const {
            type,
            method,
            timestamp,
            session_id,
            client_id,
            duration,
            entity_name,
            entity_params,
            entity_response,
            error
        } = traceData;

        const status = error
            ? this.colorText(' ERROR ', 'bgRed', 'bold')
            : this.colorText(' SUCCESS ', 'bgGreen', 'bold');

        console.log('');
        console.log(this.grayLine());
        console.log(`${this.colorText('Trace Log', 'cyan', 'bold')} ${status}`);
        console.log(this.grayLine());

        this.logField('Type', type);
        this.logField('Method', method);
        this.logField('Timestamp', timestamp);
        this.logField('Session ID', session_id);
        this.logField('Client ID', client_id);
        this.logField('Duration', duration !== undefined ? `${duration} ms` : undefined);
        this.logField('Entity Name', entity_name);
        this.logField('Entity Params', this.formatJSON(entity_params));
        this.logField('Entity Response', this.formatJSON(entity_response));
        this.logField('Error', error, 'red');

        console.log(this.grayLine());
        console.log('');
    }

    async flush(): Promise<void> {
        return;
    }

    async shutdown(): Promise<void> {
        return;
    }

    private logField(label: string, value: any, color: keyof ConsoleAdapter['colors'] = 'yellow') {
        if (value === undefined || value === null) return;
        const padded = `${label}:`.padEnd(18);
        const colored = this.colorText(padded, color);
        console.log(`${colored} ${value}`);
    }

    private formatJSON(obj: any): string | undefined {
        if (obj === undefined || obj === null) return undefined;
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            return '[Unserializable object]';
        }
    }

    private grayLine(): string {
        return '\x1b[90m' + '─'.repeat(50) + '\x1b[0m';
    }

    private colorText(text: string, fg: keyof ConsoleAdapter['colors'], style: keyof ConsoleAdapter['styles'] = 'reset'): string {
        return `${this.colors[fg] ?? ''}${this.styles[style] ?? ''}${text}${this.styles.reset}`;
    }

    private colors = {
        black: '\x1b[30m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        bgRed: '\x1b[41m',
        bgGreen: '\x1b[42m',
        bgYellow: '\x1b[43m',
        bgBlue: '\x1b[44m',
        bgCyan: '\x1b[46m',
        bgWhite: '\x1b[47m'
    };

    private styles = {
        reset: '\x1b[0m',
        bold: '\x1b[1m',
        dim: '\x1b[2m',
        underline: '\x1b[4m',
        blink: '\x1b[5m',
        reverse: '\x1b[7m',
        hidden: '\x1b[8m'
    };
}
