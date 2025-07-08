import { NextFunction, Request, Response } from "express";
import {
  LogFields,
  TraceAdapter,
  TraceData,
  TraceMiddlewareOptions,
} from "./types";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

const REQUEST_METHODS = [
  "initialize",
  "tools/list",
  "tools/call",
  "prompts/list",
  "prompts/get",
  "resources/list",
  "resources/read",
];

/**
 * TraceMiddleware automatically logs metadata for incoming MCP-related requests in Express.js applications.
 *
 * It supports capturing:
 * - method name
 * - session ID
 * - timestamps
 * - entity name/params
 * - response payload
 * - request duration
 * - error status
 *
 * You can configure which fields to log and plug in your own adapter for exporting logs.
 */
export class TraceMiddleware {
  private adapter: TraceAdapter;
  private logFields: LogFields;

  /**
   * Creates a new TraceMiddleware instance.
   *
   * @param options - Configuration options including adapter and optional logFields filter
   */
  constructor(options: TraceMiddlewareOptions) {
    this.adapter = options.adapter;
    this.logFields = {
      type: true,
      method: true,
      timestamp: true,
      session_id: true,
      client_id: true,
      duration: true,
      entity_name: true,
      entity_params: true,
      entity_response: true,
      error: true,
      ...options.logFields,
    };
  }

  /**
   * Filters out trace fields that are disabled via configuration.
   *
   * @param traceData - The full trace data object
   * @returns Filtered trace data with only enabled fields
   */
  private filterTraceData(traceData: TraceData): TraceData {
    const filtered: Partial<TraceData> = {};

    for (const [key, value] of Object.entries(traceData)) {
      if (this.logFields[key as keyof LogFields] !== false) {
        filtered[key as keyof TraceData] = value;
      }
    }

    return filtered as TraceData;
  }

  /**
   * Constructs and filters a trace data object using defaults and user input.
   *
   * @param data - Raw trace data to be formatted
   * @returns A filtered and formatted TraceData object
   */
  private createTraceData(data: TraceData): TraceData {
    const traceData: TraceData = {
      ...data,
      type: data.type,
      timestamp: new Date().toISOString(),
      session_id: data.session_id,
    };

    return this.filterTraceData(traceData);
  }

  /**
   * Safely parses JSON response body, handling potential parsing errors.
   *
   * @param body - Response body to parse
   * @returns Parsed JSON object or original body if parsing fails
   */
  private parseResponseBody(body: any): any {
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch (error) {
        // If JSON parsing fails, return the original string
        return body;
      }
    }
    return body;
  }

  /**
   * Captures response body by intercepting various response methods.
   *
   * @param res - Express response object
   * @returns Object containing captured response data
   */
  private captureResponseBody(res: Response): {
    body: any;
    contentType: string | undefined;
  } {
    let capturedBody: any = null;
    let contentType: string | undefined = undefined;

    // Store original methods
    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);
    const originalEnd = res.end.bind(res);
    const originalWrite = res.write.bind(res);

    // Track response chunks for non-JSON responses
    const chunks: Buffer[] = [];

    // Override res.send()
    res.send = (body: any): Response => {
      capturedBody = this.parseResponseBody(body);
      contentType = res.getHeader("content-type") as string;
      res.locals.responseBody = capturedBody;
      res.locals.contentType = contentType;
      return originalSend(body);
    };

    // Override res.json()
    res.json = (body: any): Response => {
      capturedBody = body;
      contentType = "application/json";
      res.locals.responseBody = capturedBody;
      res.locals.contentType = contentType;
      return originalJson(body);
    };

    const parseResponseBody = this.parseResponseBody;
    // Override res.write() to capture streaming responses
    res.write = function (
      this: Response,
      chunk: any,
      encodingOrCallback?: any,
      callback?: any
    ): boolean {
      if (chunk) {
        const encoding =
          typeof encodingOrCallback === "string"
            ? encodingOrCallback
            : undefined;
        if (typeof chunk === "string") {
          if (encoding && Buffer.isEncoding(encoding)) {
            chunks.push(Buffer.from(chunk, encoding));
          } else {
            chunks.push(Buffer.from(chunk));
          }
        } else {
          chunks.push(Buffer.from(chunk));
        }
      }
      return originalWrite.apply(this, arguments as any);
    };

    // Override res.end() to capture final response
    res.end = function (
      this: Response,
      chunk?: any,
      encodingOrCallback?: any,
      callback?: any
    ): Response {
      if (chunk) {
        const encoding =
          typeof encodingOrCallback === "string"
            ? encodingOrCallback
            : undefined;
        if (typeof chunk === "string") {
          if (encoding && Buffer.isEncoding(encoding)) {
            chunks.push(Buffer.from(chunk, encoding));
          } else {
            chunks.push(Buffer.from(chunk));
          }
        } else {
          chunks.push(Buffer.from(chunk));
        }
      }

      // If we haven't captured body yet and have chunks, combine them
      if (!capturedBody && chunks.length > 0) {
        const fullBody = Buffer.concat(chunks).toString("utf8");
        capturedBody = parseResponseBody(fullBody);
        contentType = res.getHeader("content-type") as string;
        res.locals.responseBody = capturedBody;
        res.locals.contentType = contentType;
      }

      return originalEnd.apply(this, arguments as any);
    };

    return { body: capturedBody, contentType };
  }

  /**
   * Optionally flushes buffered trace logs using the adapter.
   *
   * @param timeout - Optional timeout in milliseconds
   */
  async flush(timeout?: number): Promise<void> {
    await this.adapter.flush?.(timeout);
  }

  /**
   * Optionally shuts down the adapter and clears resources.
   */
  async shutdown(): Promise<void> {
    await this.adapter.shutdown?.();
  }

  /**
   * Returns the Express.js middleware function.
   *
   * This middleware extracts request metadata and logs it via the adapter.
   *
   * Enhanced to properly capture response bodies from various response methods.
   */
  express() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();

      const method = this.getMethod(req);
      const type = this.getType(req);
      const entityName = this.getEntityName(req);
      const entityParams = this.getEntityParams(req);

      // Set up response body capture
      this.captureResponseBody(res);

      // Hook into the response finish event
      res.on("finish", () => {
        const duration = Date.now() - start;

        // Get the captured response body
        const entityResponse = this.getEntityResponse(req, res);

        const sessionID = this.getSessionID(req, res);
        const clientID = this.getClientID(req);

        const traceData = this.createTraceData({
          type,
          method,
          timestamp: new Date().toISOString(),
          session_id: sessionID,
          client_id: clientID,
          entity_name: entityName,
          entity_params: entityParams,
          entity_response: entityResponse,
          duration,
          error: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined,
        });

        this.adapter.export(traceData);
      });

      // Handle cases where the connection is aborted
      res.on("close", () => {
        if (!res.writableEnded) {
          const duration = Date.now() - start;

          const sessionID = this.getSessionID(req, res);
          const clientID = this.getClientID(req);

          const traceData = this.createTraceData({
            type,
            method,
            timestamp: new Date().toISOString(),
            session_id: sessionID,
            client_id: clientID,
            entity_name: entityName,
            entity_params: entityParams,
            entity_response: undefined,
            duration,
            error: "Connection aborted",
          });

          this.adapter.export(traceData);
        }
      });

      next();
    };
  }

  /**
   * Extracts the method field from the request body.
   *
   * @param req - Express request object
   * @returns Method string if available
   */
  private getMethod(req: Request): string | undefined {
    return req.body?.method;
  }

  /**
   * Determines the type of the request (e.g., request, notification, or unknown).
   *
   * @param req - Express request object
   * @returns Type of the request
   */
  private getType(req: Request): "request" | "notification" | "unknown" {
    const method = req.body?.method;

    if (REQUEST_METHODS.includes(method)) {
      return "request";
    }

    if (method?.startsWith("notifications/")) {
      return "notification";
    }

    return "unknown";
  }

  /**
   * Extracts the entity name from the request body for supported methods.
   *
   * @param req - Express request object
   * @returns Name of the entity if present
   */
  private getEntityName(req: Request): string | undefined {
    const method = req.body?.method;

    switch (method) {
      case "tools/call":
      case "prompts/get":
      case "resources/read":
        return req.body?.params?.name;
      default:
        return undefined;
    }
  }

  /**
   * Extracts the entity parameters from the request body.
   *
   * @param req - Express request object
   * @returns Parameters object if present
   */
  private getEntityParams(req: Request): any | undefined {
    return req.body?.params;
  }

  /**
   * Extracts the response from multiple sources with proper fallback handling.
   *
   * Priority order:
   * 1. Server-generated response from res.locals.responseBody
   * 2. Inline response from request body
   * 3. undefined if no response found
   *
   * @param req - Express request object
   * @param res - Express response object
   * @returns Response body if present
   */
  private getEntityResponse(req: Request, res: Response): any | undefined {
    // First priority: server-generated response (captured by middleware)
    if (res.locals?.responseBody !== undefined) {
      return res.locals.responseBody;
    }

    // Second priority: inline response from request body (for client-provided responses)
    if (req.body?.response !== undefined) {
      return req.body.response;
    }

    // No response found
    return undefined;
  }

  private getClientID(req: Request): string | undefined {
    if (isInitializeRequest(req.body)) {
      return req.body.params.clientInfo.name;
    }

    return req.headers["mcp-client-id"] as string;
  }

  private getSessionID(req: Request, res: Response): string {
    if (isInitializeRequest(req.body)) {
      return res.getHeader("mcp-session-id") as string;
    }

    return req.headers["mcp-session-id"] as string;
  }
}
