import { TraceAdapter, TraceData } from '../types';

/**
 * Configuration options for the OTLP adapter
 */
export interface OTLPConfig {
    /**
     * OTLP endpoint URL for traces
     * Default: http://localhost:4318/v1/traces
     */
    endpoint?: string;

    /**
     * Protocol to use for OTLP export
     * Default: 'http'
     */
    protocol?: 'http' | 'grpc';

    /**
     * Service name for the traces
     * Default: 'mcp-trace'
     */
    serviceName?: string;

    /**
     * Service version
     * Default: '1.0.0'
     */
    serviceVersion?: string;

    /**
     * Additional headers to include in OTLP requests
     */
    headers?: Record<string, string>;

    /**
     * Batch configuration for span processing
     */
    batchConfig?: {
        maxExportBatchSize?: number;
        exportTimeoutMillis?: number;
        scheduledDelayMillis?: number;
    };
}

/**
 * A TraceAdapter implementation that exports traces using OpenTelemetry Protocol (OTLP).
 * 
 * This adapter converts MCP trace data into OpenTelemetry spans and exports them
 * to an OTLP-compatible backend (like Jaeger, Zipkin, or OpenTelemetry Collector).
 * 
 * Requires the OpenTelemetry packages to be installed:
 * ```bash
 * npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
 * ```
 */
export class OTLPAdapter implements TraceAdapter {
    private config: Required<OTLPConfig>;
    private tracer: any = null;
    private provider: any = null;
    private isInitialized = false;

    constructor(config: OTLPConfig = {}) {
        this.config = {
            endpoint: config.endpoint || 'http://localhost:4318/v1/traces',
            protocol: config.protocol || 'http',
            serviceName: config.serviceName || 'mcp-trace',
            serviceVersion: config.serviceVersion || '1.0.0',
            headers: config.headers || {},
            batchConfig: {
                maxExportBatchSize: 512,
                exportTimeoutMillis: 30000,
                scheduledDelayMillis: 5000,
                ...config.batchConfig
            }
        };
    }

    /**
     * Initialize the OpenTelemetry SDK and tracer
     */
    private async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Dynamic imports to avoid forcing dependencies
            // Using eval to avoid TypeScript static analysis of module paths
            const sdkNodeModule = await import('@opentelemetry/sdk-node');
            const exporterModule = await import('@opentelemetry/exporter-trace-otlp-http');
            const apiModule = await import('@opentelemetry/api');
            const semanticModule = await import('@opentelemetry/semantic-conventions');

            const { NodeSDK } = sdkNodeModule;
            const { OTLPTraceExporter } = exporterModule;
            const { trace } = apiModule;
            const { SemanticResourceAttributes } = semanticModule;
            const { Resource } = await import('@opentelemetry/resources');
            const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');

            // Create OTLP exporter
            const traceExporter = new OTLPTraceExporter({
                url: this.config.endpoint,
                headers: this.config.headers,
            });

            // Create batch span processor
            const spanProcessor = new BatchSpanProcessor(traceExporter, {
                maxExportBatchSize: this.config.batchConfig.maxExportBatchSize,
                exportTimeoutMillis: this.config.batchConfig.exportTimeoutMillis,
                scheduledDelayMillis: this.config.batchConfig.scheduledDelayMillis,
            });

            // Initialize the SDK
            const sdk = new NodeSDK({
                resource: new Resource({
                    [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
                    [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
                }),
                spanProcessor,
            });

            sdk.start();
            this.provider = sdk;
            this.tracer = trace.getTracer(this.config.serviceName, this.config.serviceVersion);
            this.isInitialized = true;

        } catch (error) {
            console.error('[OTLPAdapter] Failed to initialize OpenTelemetry SDK:', error);
            throw new Error(
                'OTLPAdapter requires OpenTelemetry packages. Install them using: npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http'
            );
        }
    }

    /**
     * Export trace data as an OpenTelemetry span
     */
    async export(traceData: TraceData): Promise<void> {
        try {
            await this.initialize();

            if (!this.tracer) {
                throw new Error('Tracer not initialized');
            }

            // Create span name from method and entity
            const spanName = this.createSpanName(traceData);

            // Create span attributes from trace data
            const attributes = this.createSpanAttributes(traceData);

            // Create and start span
            const span = this.tracer.startSpan(spanName, {
                attributes,
                startTime: traceData.timestamp ? new Date(traceData.timestamp).getTime() * 1000000 : undefined, // Convert to nanoseconds
            });

            // Add events for request/response if available
            if (traceData.request) {
                span.addEvent('request', {
                    'mcp.request': JSON.stringify(traceData.request),
                });
            }

            if (traceData.response) {
                span.addEvent('response', {
                    'mcp.response': JSON.stringify(traceData.response),
                });
            }

            if (traceData.error) {
                span.recordException(new Error(traceData.error));
                span.setStatus({ code: 2, message: traceData.error }); // ERROR status
            } else {
                span.setStatus({ code: 1 }); // OK status
            }

            // Set duration if available
            if (traceData.duration) {
                // End time = start time + duration
                const endTime = traceData.timestamp
                    ? new Date(traceData.timestamp).getTime() + traceData.duration
                    : Date.now();
                span.end(endTime * 1000000); // Convert to nanoseconds
            } else {
                span.end();
            }

        } catch (error) {
            console.error('[OTLPAdapter] Failed to export trace:', error);
            // Don't throw to avoid breaking the application
        }
    }

    /**
     * Create a meaningful span name from trace data
     */
    private createSpanName(traceData: TraceData): string {
        const parts = [];

        if (traceData.type) {
            parts.push(traceData.type);
        }

        if (traceData.method) {
            parts.push(traceData.method);
        }

        if (traceData.entity_name) {
            parts.push(traceData.entity_name);
        }

        return parts.length > 0 ? parts.join(' ') : 'mcp-operation';
    }

    /**
     * Create OpenTelemetry span attributes from trace data
     */
    private createSpanAttributes(traceData: TraceData): Record<string, any> {
        const attributes: Record<string, any> = {
            'mcp.type': traceData.type,
            'mcp.session_id': traceData.session_id,
        };

        if (traceData.method) {
            attributes['mcp.method'] = traceData.method;
        }

        if (traceData.entity_name) {
            attributes['mcp.entity_name'] = traceData.entity_name;
        }

        if (traceData.client_id) {
            attributes['mcp.client_id'] = traceData.client_id;
        }

        if (traceData.duration !== undefined) {
            attributes['mcp.duration_ms'] = traceData.duration;
        }

        if (traceData.ip_address) {
            attributes['mcp.ip_address'] = traceData.ip_address;
        }

        if (traceData.is_error) {
            attributes['mcp.is_error'] = traceData.is_error;
        }

        if (traceData.server_name) {
            attributes['mcp.server_name'] = traceData.server_name;
        }

        if (traceData.server_version) {
            attributes['mcp.server_version'] = traceData.server_version;
        }

        if (traceData.client_name) {
            attributes['mcp.client_name'] = traceData.client_name;
        }

        if (traceData.client_version) {
            attributes['mcp.client_version'] = traceData.client_version;
        }

        if (traceData.user_id) {
            attributes['mcp.user_id'] = traceData.user_id;
        }

        if (traceData.user_name) {
            attributes['mcp.user_name'] = traceData.user_name;
        }

        if (traceData.user_email) {
            attributes['mcp.user_email'] = traceData.user_email;
        }

        if (traceData.context) {
            attributes['mcp.context'] = traceData.context;
        }

        if (traceData.sdk_language) {
            attributes['mcp.sdk_language'] = traceData.sdk_language;
        }

        if (traceData.sdk_version) {
            attributes['mcp.sdk_version'] = traceData.sdk_version;
        }

        if (traceData.mcp_trace_version) {
            attributes['mcp.trace_version'] = traceData.mcp_trace_version;
        }

        if (traceData.metadata) {
            Object.entries(traceData.metadata).forEach(([key, value]) => {
                attributes[`mcp.metadata.${key}`] = value;
            });
        }

        return attributes;
    }

    /**
     * Flush any pending spans
     */
    async flush(timeout?: number): Promise<void> {
        if (!this.isInitialized || !this.provider) {
            return;
        }

        try {
            // The NodeSDK handles flushing automatically with batch processing
            // This is a no-op for now, but could be extended if needed
        } catch (error) {
            console.error('[OTLPAdapter] Failed to flush traces:', error);
        }
    }

    /**
     * Shutdown the OpenTelemetry SDK
     */
    async shutdown(): Promise<void> {
        if (!this.isInitialized || !this.provider) {
            return;
        }

        try {
            await this.provider.shutdown();
            this.isInitialized = false;
            this.tracer = null;
            this.provider = null;
        } catch (error) {
            console.error('[OTLPAdapter] Failed to shutdown:', error);
        }
    }
}
