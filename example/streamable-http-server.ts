import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from 'cors';
import express from 'express';
import { z } from "zod"; // For defining tool input schemas
import {
    ConsoleAdapter,
    MaskFunction,
    TraceMiddleware
} from '../dist/index.js';

import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from "node:crypto";


const server = new McpServer({
    name: "streamable-http-mcp-server",
    version: "1.0.0"
});

// Example mask function to hide PII data
const maskPII: MaskFunction = (data: any) => {
    if (typeof data !== 'object' || data === null) {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(item => maskPII(item));
    }

    const masked = { ...data };

    // List of PII fields to mask
    const piiFields = ['password', 'ssn', 'socialSecurityNumber', 'creditCard', 'email', 'phone', 'address'];

    for (const field of piiFields) {
        if (masked[field]) {
            masked[field] = '[MASKED]';
        }
    }

    // Recursively mask nested objects
    for (const [key, value] of Object.entries(masked)) {
        if (typeof value === 'object' && value !== null) {
            masked[key] = maskPII(value);
        }
    }

    return masked;
};

const traceMiddleware = new TraceMiddleware({
    adapter: new ConsoleAdapter(),
    mask: maskPII
});
traceMiddleware.init(server);

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

server.registerTool(
    "createUser",
    {
        title: "Create User Tool",
        description: "Creates a user with personal information (PII will be masked in traces).",
        inputSchema: {
            name: z.string(),
            email: z.string().email(),
            password: z.string(),
            phone: z.string(),
            ssn: z.string(),
        }
    },
    async ({ name, email, password, phone, ssn }) => {
        // Simulate user creation
        const user = {
            id: Math.random().toString(36).substr(2, 9),
            name,
            email,
            password: '[HASHED]', // In real app, this would be hashed
            phone,
            ssn: ssn.replace(/\d(?=\d{4})/g, '*'), // Mask SSN
            createdAt: new Date().toISOString()
        };

        return {
            content: [{
                type: "text",
                text: `User created successfully with ID: ${user.id}`
            }],
        };
    }
);

async function main() {
    const app = express();
    app.use(cors())
    app.use(express.json());

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