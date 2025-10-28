import { TraceAdapter, TraceData } from '../types';

export class ConsoleAdapter implements TraceAdapter {
    export(traceData: TraceData): void {
        const {
            type,
            method,
            entity_name,
            request,
            response,
            timestamp,
            duration,
            id,
            session_id,
            user_id,
            user_name,
            user_email,
            client_id,
            client_name,
            client_version,
            server_id,
            server_name,
            server_version,
            is_error,
            error,
            ip_address,
            context,
            sdk_language,
            sdk_version,
            mcp_trace_version,
            metadata
        } = traceData;

        const status = error || is_error
            ? this.colorText(' ERROR ', 'bgRed', 'bold')
            : this.colorText(' SUCCESS ', 'bgGreen', 'bold');

        console.log('');
        console.log(this.grayLine());
        console.log(`${this.colorText('Trace Log', 'cyan', 'bold')} ${status}`);
        console.log(this.grayLine());

        // Basic trace info
        this.logField('Type', type);
        this.logField('Method', method);
        this.logField('Entity Name', entity_name);
        this.logField('Timestamp', timestamp);
        this.logField('Duration', duration !== undefined ? `${duration} ms` : undefined);
        this.logField('Trace ID', id);
        this.logField('Session ID', session_id);

        // User info
        this.logField('User ID', user_id);
        this.logField('User Name', user_name);
        this.logField('User Email', user_email);

        // Client info
        this.logField('Client ID', client_id);
        this.logField('Client Name', client_name);
        this.logField('Client Version', client_version);

        // Server info
        this.logField('Server ID', server_id);
        this.logField('Server Name', server_name);
        this.logField('Server Version', server_version);

        // Request/Response
        this.logField('Request', this.formatJSON(request));
        this.logField('Response', this.formatJSON(response));

        // Error info
        this.logField('Is Error', is_error);
        this.logField('Error', error, 'red');

        // Network & Context
        this.logField('IP Address', ip_address);
        this.logField('Context', context);

        // SDK info
        this.logField('SDK Language', sdk_language);
        this.logField('SDK Version', sdk_version);
        this.logField('MCP Trace Version', mcp_trace_version);

        // Metadata
        this.logField('Metadata', this.formatJSON(metadata));

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
