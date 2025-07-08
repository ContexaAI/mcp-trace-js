import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from 'cors';
import express from 'express';
import { z } from "zod"; // For defining tool input schemas
import {
    ConsoleAdapter,
    TraceMiddleware
} from '../src';

import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from "node:crypto";


// Set up tracing middleware
const consoleAdapter = new ConsoleAdapter();

const traceMiddleware = new TraceMiddleware({
    adapter: consoleAdapter
});

const server = new McpServer({
    name: "streamable-http-mcp-server",
    version: "1.0.0"
});

// Register a simple addition tool
server.registerTool(
    "add",
    {
        title: "Addition Tool",
        description: "Adds two numbers.",
        inputSchema: {
            a: z.number(),
            b: z.number(),
        }
    },
    async ({ a, b }) => {
        return {
            content: [{ type: "text", text: String(a + b) }],
        };
    }
);

async function main() {
    const app = express();
    app.use(cors())
    app.use(express.json());
    app.use('/mcp', traceMiddleware.express())

    const streamableHttpTransports: Record<string, StreamableHTTPServerTransport> = {};

    app.get('/health', (_: any, res: any) => {
        res.json({ status: 'OK', server: 'streamable-http-mcp-server', version: '1.0.0' });
    });

    app.get('/', (_: any, res: any) => {
        res.json({ status: 'OK', server: 'streamable-http-mcp-server', version: '1.0.0' });
    });

    app.use("/mcp", express.json());
    app.post("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        let transport: StreamableHTTPServerTransport;
        // Initial session creation
        if (!sessionId && isInitializeRequest(req.body)) {
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: (): string => randomUUID(),
                onsessioninitialized: (sessionId): void => {
                    // Store the transport by session ID
                    streamableHttpTransports[sessionId] = transport;
                },
            });

            transport.onclose = (): void => {
                if (transport.sessionId) {
                    delete streamableHttpTransports[transport.sessionId];
                }
            };

            await server.connect(transport);

        } else if (sessionId && streamableHttpTransports[sessionId]) {
            // Todo must be a better way to handle this duplication
            transport = streamableHttpTransports[sessionId];
        } else {
            res.status(400).json({ error: "No valid session ID provided" });
            return;
        }

        await transport.handleRequest(req, res, req.body);
    });

    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (
        req: express.Request,
        res: express.Response,
    ): Promise<void> => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (!sessionId || !streamableHttpTransports[sessionId]) {
            res.status(400).json({ error: "No valid session ID provided" });
            return;
        }

        await streamableHttpTransports[sessionId].handleRequest(req, res, req.body);
    };


    app.get("/mcp", handleSessionRequest);
    app.delete("/mcp", handleSessionRequest);


    const PORT = 8080

    app.listen(PORT, () => {
        console.error(`MCP Web Server running at http://localhost:${PORT}`);
        console.error(`- SSE Endpoint: http://localhost:${PORT}/sse`);
        console.error(`- Messages Endpoint: http://localhost:${PORT}/api/messages?sessionId=YOUR_SESSION_ID`);
        console.error(`- Health Check: http://localhost:${PORT}/health`);
    });
}

main();