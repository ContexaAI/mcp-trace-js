// src/middleware/TraceMiddleware.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport";
import { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse, MessageExtraInfo } from "@modelcontextprotocol/sdk/types";
import { IdentifyUser, LogFields, RedactFunction, TraceAdapter, TraceData, TraceMiddlewareOptions } from "./types";

/**
 * TraceMiddleware hooks into an MCP server and logs
 * all incoming/outgoing messages using the provided adapter.
 *
 * Example:
 * ```ts
 * const server = new McpServer({ name: "my-server", version: "1.0.0" });
 * const tracer = new TraceMiddleware({ adapter: new ConsoleAdapter() });
 * tracer.init(server);
 * ```
 *
 * With PII redaction:
 * ```ts
 * const redactPII = (data: any) => {
 *   // Custom logic to redact sensitive data
 *   return data;
 * };
 * const tracer = new TraceMiddleware({ 
 *   adapter: new ConsoleAdapter(),
 *   redact: redactPII 
 * });
 * ```
 *
 * With user identification from headers:
 * ```ts
 * const extractUser = (headers: Record<string, string | string[] | undefined>) => {
 *   const userId = headers['x-user-id'] as string;
 *   const userName = headers['x-user-name'] as string;
 *   const userEmail = headers['x-user-email'] as string;
 *   
 *   if (userId && userName && userEmail) {
 *     return { user_id: userId, user_name: userName, user_email: userEmail };
 *   }
 *   return undefined;
 * };
 * 
 * const tracer = new TraceMiddleware({ 
 *   adapter: new ConsoleAdapter(),
 *   userFunction: extractUser
 * });
 * ```
 */

export class TraceMiddleware {
  private adapter: TraceAdapter;
  private logFields: LogFields;
  private redact?: RedactFunction;
  private userFunction?: IdentifyUser;
  private server!: Server;
  private pendingRequests: Map<string | number, {
    startTime: number;
    requestData: TraceData;
    requestExtra?: MessageExtraInfo;
    transport?: Transport;
  }> = new Map();
  private pendingRequestTimeouts = new Map<string | number, NodeJS.Timeout>();

  constructor(options: TraceMiddlewareOptions) {
    this.validateOptions(options);
    this.adapter = options.adapter;
    this.redact = options.redact;
    this.userFunction = options.identifyUser;
    this.logFields = {
      type: true,
      method: true,
      timestamp: true,
      session_id: true,
      client_id: true,
      duration: true,
      entity_name: true,
      arguments: true,
      response: true,
      error: true,
      ...options.logFields,
    };
  }

  public init(server: McpServer | Server): void {
    this.server = server instanceof McpServer ? server.server : server;
    this.traceEvent(this.server);
  }

  private traceEvent(server: Server): void {
    const originalConnect = server.connect.bind(server);

    server.connect = async (transport: Transport) => {
      this.handle(transport);
      return originalConnect(transport);
    };
  }

  private handle(transport: Transport): void {
    try {
      const originalOnMessage = transport.onmessage;
      const originalSend = transport.send.bind(transport);

      transport.onmessage = (message: JSONRPCMessage, extra?: MessageExtraInfo) => {
        try {
          this.handleIncomingMessage(message, extra, transport);
          if (originalOnMessage) originalOnMessage(message, extra);
        } catch (error) {
          this.log('error', 'Error in onmessage handler', { error: error instanceof Error ? error.message : String(error) });
          if (originalOnMessage) originalOnMessage(message, extra);
        }
      };

      transport.send = async (message: JSONRPCMessage, options?: TransportSendOptions) => {
        try {
          this.handleOutgoingMessage(message, options, transport);
          return originalSend(message, options);
        } catch (error) {
          this.log('error', 'Error in send handler', { error: error instanceof Error ? error.message : String(error) });
          return originalSend(message, options);
        }
      };
    } catch (error) {
      this.log('error', 'Failed to setup transport handlers', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private handleIncomingMessage(message: any, extra?: MessageExtraInfo, transport?: Transport): void {
    try {
      if (this.isJSONRPCRequest(message)) {
        this.handleRequest(message, extra, transport);
      } else if (this.isJSONRPCNotification(message)) {
        this.logMessage(message, extra);
      }
    } catch (error) {
      this.log('error', 'Error handling incoming message', {
        error: error instanceof Error ? error.message : String(error),
        messageType: typeof message,
        hasMethod: !!message.method,
        hasId: message.id !== undefined
      });
    }
  }

  private handleOutgoingMessage(message: any, options?: TransportSendOptions, transport?: Transport): void {
    try {
      if (this.isJSONRPCResponse(message)) {
        this.handleOutgoingResponse(message, options, transport);
      } else if (this.isJSONRPCNotification(message)) {
        this.logMessage(message, undefined);
      }
    } catch (error) {
      this.log('error', 'Error handling outgoing message', {
        error: error instanceof Error ? error.message : String(error),
        messageType: typeof message,
        hasId: message.id !== undefined,
        hasResult: message.result !== undefined,
        hasError: message.error !== undefined
      });
    }
  }

  private handleRequest(message: JSONRPCRequest, extra?: MessageExtraInfo, transport?: Transport): void {
    try {
      const startTime = Date.now();
      const traceData = this.createTraceData(message, extra, transport);

      if (traceData) {
        this.pendingRequests.set(message.id, {
          startTime,
          requestData: traceData,
          requestExtra: extra,
          transport: transport
        });

        const timeout = setTimeout(() => {
          this.pendingRequests.delete(message.id);
          this.pendingRequestTimeouts.delete(message.id);
        }, 5 * 60 * 1000);

        this.pendingRequestTimeouts.set(message.id, timeout);

        if (message.method && message.id === undefined) {
          this.adapter.export(traceData);
        }
      }
    } catch (error) {
      this.log('error', 'Error handling request', {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.id,
        method: message.method
      });
    }
  }


  private handleOutgoingResponse(message: JSONRPCResponse, options?: TransportSendOptions, transport?: Transport): void {
    try {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        const duration = Date.now() - pending.startTime;

        const combinedTraceData = this.createCombinedTraceData(
          pending.requestData,
          message,
          duration
        );

        if (combinedTraceData) {
          this.adapter.export(combinedTraceData);
        }

        this.pendingRequests.delete(message.id);
        const timeout = this.pendingRequestTimeouts.get(message.id);
        if (timeout) {
          clearTimeout(timeout);
          this.pendingRequestTimeouts.delete(message.id);
        }
      } else {
        const responseTraceData = this.createTraceData({
          ...message,
        }, undefined, transport);

        if (responseTraceData) {
          this.adapter.export(responseTraceData);
        }
      }
    } catch (error) {
      this.log('error', 'Error handling outgoing response', {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.id
      });
    }
  }

  private logMessage(message: JSONRPCMessage, extra?: MessageExtraInfo): void {
    try {
      const traceData = this.createTraceData(message, extra);
      if (traceData) {
        this.adapter.export(traceData);
      }
    } catch (err) {
      console.error("TraceMiddleware logging failed:", err);
    }
  }

  private createCombinedTraceData(
    requestData: TraceData,
    responseMessage: JSONRPCResponse,
    duration: number
  ): TraceData | undefined {
    const now = new Date().toISOString();

    const responseResult = responseMessage.result;
    const combinedTraceData: TraceData = {
      type: 'request',
      method: requestData.method,
      timestamp: now,
      session_id: requestData.session_id,
      client_id: requestData.client_id,
      duration: duration,
      entity_name: requestData.entity_name,
      request: this.applyRedaction(requestData.request),
      response: this.applyRedaction(responseResult),
      user_id: requestData.user_id,
      user_name: requestData.user_name,
      user_email: requestData.user_email,
    };

    return this.filterTraceData(combinedTraceData);
  }

  private createTraceData(message: any, extra?: MessageExtraInfo, transport?: Transport): TraceData | undefined {
    const now = new Date().toISOString();

    const type: "request" | "notification" = (message?.method && message?.id === undefined)
      ? "notification"
      : "request";

    const method = message.method || undefined;
    let entityName: string = "";
    if (["tools/call", "prompts/get", "resources/read"].includes(method)) {
      entityName = message.params?.name || "";
    }

    const sessionIdHeader = extra?.requestInfo?.headers?.['mcp-session-id'];
    const sessionIdFromTransport = transport?.sessionId;
    const userAgentHeader = extra?.requestInfo?.headers?.['user-agent'];

    const sessionId = (Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader) || sessionIdFromTransport || "";
    const clientId = this.extractClientId(message) ||
      (Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader) ||
      undefined;

    const ipAddress = this.getIpAddress(extra);
    const userInfo = this.getUserInfo(extra);

    const traceData: TraceData = {
      type,
      method,
      timestamp: now,
      session_id: sessionId,
      client_id: clientId,
      duration: message._duration,
      entity_name: entityName,
      request: this.applyRedaction(message.params),
      response: this.applyRedaction(message.result),
      error: message.error ? `${message.error.code}: ${message.error.message}` : undefined,
      ip_address: ipAddress,
      user_id: userInfo.user_id,
      user_name: userInfo.user_name,
      user_email: userInfo.user_email,
    };

    return this.filterTraceData(traceData);
  }

  private extractClientId(message: any): string | undefined {
    return message._meta?.clientId || message.clientId || message.context?.clientId;
  }

  private filterTraceData(traceData: TraceData): TraceData {
    const filtered: Partial<TraceData> = {};
    for (const [key, value] of Object.entries(traceData)) {
      if (this.logFields[key as keyof LogFields] !== false) {
        filtered[key as keyof TraceData] = value;
      }
    }
    return filtered as TraceData;
  }

  private applyRedaction(data: any): any {
    if (!this.redact || data === null || data === undefined) {
      return data;
    }

    try {
      return this.redact(data);
    } catch (error) {
      this.log('warn', 'Error applying redaction function', {
        error: error instanceof Error ? error.message : String(error)
      });
      return data;
    }
  }

  public async flush(timeout?: number): Promise<void> {
    await this.adapter.flush?.(timeout);
  }

  public async shutdown(): Promise<void> {
    try {
      this.cleanup();
      await this.adapter.shutdown?.();
    } catch (error) {
      this.log('error', 'Error during shutdown', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private cleanup(): void {
    this.pendingRequests.clear();

    for (const timeout of this.pendingRequestTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pendingRequestTimeouts.clear();

    this.server = null as any;
  }

  private validateOptions(options: TraceMiddlewareOptions): void {
    if (!options.adapter) {
      throw new Error('TraceAdapter is required');
    }

    if (typeof options.adapter.export !== 'function') {
      throw new Error('TraceAdapter must implement export method');
    }
  }

  private log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      middleware: 'TraceMiddleware'
    };

    console[level](JSON.stringify(logEntry));
  }


  private isJSONRPCRequest(message: any): message is JSONRPCRequest {
    return message && typeof message.method === 'string' && message.id !== undefined;
  }

  private isJSONRPCResponse(message: any): message is JSONRPCResponse {
    return message && message.id !== undefined && (message.result !== undefined || message.error !== undefined);
  }

  private isJSONRPCNotification(message: any): boolean {
    return message && typeof message.method === 'string' && message.id === undefined;
  }

  private getIpAddress(extra?: MessageExtraInfo): string | undefined {
    if (!extra?.requestInfo?.headers) return undefined;

    const headers = extra.requestInfo.headers;

    const xForwardedFor = headers['x-forwarded-for'];
    const xRealIp = headers['x-real-ip'];
    const cfConnectingIp = headers['cf-connecting-ip']; // Cloudflare
    const xClientIp = headers['x-client-ip'];
    const remoteAddr = headers['remote-addr'];

    if (xForwardedFor) {
      const ips = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
      return ips.split(',')[0].trim();
    }

    if (xRealIp) {
      return Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
    }

    if (cfConnectingIp) {
      return Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
    }

    if (xClientIp) {
      return Array.isArray(xClientIp) ? xClientIp[0] : xClientIp;
    }

    if (remoteAddr) {
      return Array.isArray(remoteAddr) ? remoteAddr[0] : remoteAddr;
    }

    return undefined;
  }

  private getUserInfo(extra?: MessageExtraInfo): { user_id?: string; user_name?: string; user_email?: string } {
    if (!this.userFunction || !extra?.requestInfo?.headers) {
      return {};
    }

    try {
      const user = this.userFunction(extra.requestInfo.headers);
      return user || {};
    } catch (error) {
      this.log('warn', 'Error extracting user information', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {};
    }
  }
}
