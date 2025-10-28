# mcp-trace

<div align="center">
  <img src="images/MCP-TRACE.png" alt="MCP Trace JS Logo" />
</div>

> **Flexible, pluggable tracing middleware for Model Context Protocol (MCP) servers in JavaScript/TypeScript.** Log every request, tool call, and response to local files, PostgreSQL, Supabase, Contexa, console, OTLP, or your own backend—with full control over what gets logged.

---

## Table of Contents

- [Features](#features)
- [Quickstart](#quickstart)
- [Basic Usage](#basic-usage)
- [Feature Usage](#feature-usage)
  - [Configurable Logging](#configurable-logging)
  - [Request-Level Control](#request-level-control)
  - [PII Redaction](#pii-redaction)
  - [User Identification](#user-identification)
  - [Production-Ready Features](#production-ready-features)
- [Contexa Adapter](#contexa-adapter)
- [Other Adapters](#other-adapters)
  - [File Adapter](#file-adapter)
  - [Console Adapter](#console-adapter)
  - [PostgreSQL Adapter](#postgresql-adapter)
  - [Supabase Adapter](#supabase-adapter)
  - [OTLP Adapter](#otlp-adapter)
  - [Multi-Adapter Example](#multi-adapter-example)
- [Requirements](#requirements)
- [Contributing](#contributing)
- [License](#license)
- [Links & Acknowledgements](#links--acknowledgements)

---

## Features

- 📦 **Plug-and-play**: Add tracing to any MCP server in seconds
- 🗃️ **Pluggable adapters**: Log to file, PostgreSQL, Supabase, Contexa, console, OTLP, or your own
- 🛠️ **Configurable logging**: Enable/disable fields (tool args, responses, client ID, etc.)
- 🧩 **Composable**: Use multiple adapters at once
- 📝 **Schema-first**: All traces stored as JSON for easy querying
- 🔒 **Privacy-aware**: Control exactly what gets logged
- ⚡ **TypeScript support**: Full type safety and IntelliSense
- 🛡️ **Production-ready**: Comprehensive error handling and memory management
- 🔧 **Robust validation**: Configuration validation with descriptive error messages
- 🧹 **Automatic cleanup**: Prevents memory leaks with timeout management
- 🌐 **OpenTelemetry support**: Native OTLP integration for observability platforms

---

## Quickstart

### Installation

```bash
npm install mcp-trace
```

### Minimal Example

```typescript
import { TraceMiddleware, FileAdapter } from "mcp-trace-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Create your MCP server
const server = new McpServer({ name: "my-server", version: "1.0.0" });

// Set up tracing
const traceAdapter = new FileAdapter("trace.log");
const traceMiddleware = new TraceMiddleware({ adapter: traceAdapter });

// Initialize tracing with your server
traceMiddleware.init(server);

// Your server is now fully traced!
```

---

## Basic Usage

### Streamable HTTP Server

See `example/streamable-http-server.ts` for a complete MCP server using Streamable HTTP transport with tracing.

```bash
npm run example:streamable-http
```

This example demonstrates:

- Setting up an MCP server with Streamable HTTP transport
- Registering tools with tracing integration
- Handling HTTP requests with proper tracing
- Graceful shutdown with trace flushing

The server includes:

- **Addition tool**: Adds two numbers
- **Search tool**: Simulates search functionality
- **Health check endpoint**: `/health`
- **MCP endpoint**: `/mcp` (GET and POST)
- **Tracing**: All requests and tool calls are traced to `streamable-http-trace.log`

---

## Feature Usage

### Configurable Logging

Control exactly which fields are logged by passing a `logFields` dictionary to `TraceMiddleware`. By default, all fields are logged unless set to `false`.

**Available fields:**

- `type`, `method`, `timestamp`, `session_id`, `request_id`, `client_id`, `duration`
- `tool_name`, `tool_arguments`, `tool_response`, `tool_response_structured`

**Example: Only log tool name and response, hide arguments and client ID:**

```typescript
const traceMiddleware = new TraceMiddleware({
  adapter: traceAdapter,
  logFields: {
    tool_name: true,
    tool_response: true,
    tool_arguments: false, // disables tool arguments
    client_id: false, // disables client_id
    // ...add more as needed
  },
});
```

### Request-Level Control

Skip tracing for specific requests by adding the `X-Ignore-Traces` header:

```bash
# Skip tracing for this request
curl -H "X-Ignore-Traces: true" http://localhost:8080/mcp
```

**Supported header formats:**

- `X-Ignore-Traces: true`
- `x-ignore-traces: true`

When this header is present, the middleware will skip all tracing logic and continue to the next middleware without any performance overhead.

### PII Redaction

Protect sensitive data by providing a custom redaction function that processes all trace data before it's sent to adapters.

```typescript
const redactPII = (data: any) => {
  // Redact sensitive fields
  if (typeof data === "object" && data !== null) {
    const redacted = { ...data };

    // Redact common PII fields
    if (redacted.email) redacted.email = "[REDACTED]";
    if (redacted.password) redacted.password = "[REDACTED]";
    if (redacted.apiKey) redacted.apiKey = "[REDACTED]";
    if (redacted.token) redacted.token = "[REDACTED]";

    // Redact nested objects
    if (redacted.arguments && typeof redacted.arguments === "object") {
      redacted.arguments = redactPII(redacted.arguments);
    }

    return redacted;
  }

  return data;
};

const traceMiddleware = new TraceMiddleware({
  adapter: traceAdapter,
  redact: redactPII,
});
```

### User Identification

Automatically extract user information from request headers for better trace context and analytics.

```typescript
const extractUser = (
  headers: Record<string, string | string[] | undefined>
) => {
  // Extract user info from headers (e.g., JWT token, custom headers)
  const authHeader = headers.authorization || headers.Authorization;

  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    // Decode JWT or extract user info from token
    const userInfo = decodeJWT(token); // Your JWT decoding logic

    return {
      user_id: userInfo.sub,
      user_name: userInfo.name,
      user_email: userInfo.email,
    };
  }

  // Alternative: Extract from custom headers
  const userId = headers["x-user-id"];
  const userName = headers["x-user-name"];
  const userEmail = headers["x-user-email"];

  if (userId && userName && userEmail) {
    return {
      user_id: Array.isArray(userId) ? userId[0] : userId,
      user_name: Array.isArray(userName) ? userName[0] : userName,
      user_email: Array.isArray(userEmail) ? userEmail[0] : userEmail,
    };
  }

  return undefined;
};

const traceMiddleware = new TraceMiddleware({
  adapter: traceAdapter,
  identifyUser: extractUser,
});
```

### Production-Ready Features

#### Error Handling & Resilience

The middleware includes comprehensive error handling to ensure your MCP server continues running even if tracing fails:

- **Graceful degradation**: If tracing fails, the original MCP flow continues uninterrupted
- **Structured error logging**: All errors are logged with context for easy debugging
- **Transport-level safety**: Errors in message handlers don't break the transport layer

#### Configuration Validation

The middleware validates your configuration at startup:

```typescript
// This will throw a descriptive error if the adapter is invalid
const traceMiddleware = new TraceMiddleware({
  adapter: invalidAdapter, // ❌ Will throw: "TraceAdapter is required"
});
```

#### Memory Management

Automatic cleanup prevents memory leaks:

- **Request timeout handling**: Pending requests are automatically cleaned up after 5 minutes
- **Proper shutdown**: All resources are cleaned up when `shutdown()` is called
- **Timeout management**: All timeouts are tracked and cleared on shutdown

#### Type Safety

Full TypeScript support with proper type guards:

- **Message type validation**: Automatic detection of JSON-RPC requests, responses, and notifications
- **Type-safe handlers**: All message handlers use proper TypeScript types
- **IntelliSense support**: Full autocomplete and type checking

---

## Contexa Adapter

Send traces to Contexa for cloud-based trace storage and analytics.

**Requirements:**

- Contexa API key (`CONTEXA_API_KEY`)
- Contexa Server ID (`CONTEXA_SERVER_ID`)

**Usage:**

```typescript
import { TraceMiddleware, ContexaTraceAdapter } from "mcp-trace-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

// Option 1: Set environment variables
// process.env.CONTEXA_API_KEY = 'your-api-key';
// process.env.CONTEXA_SERVER_ID = 'your-server-id';
// const contexaAdapter = new ContexaTraceAdapter();

// Option 2: Pass directly
const contexaAdapter = new ContexaTraceAdapter({
  apiKey: "your-api-key",
  serverId: "your-server-id",
  // Optional: apiUrl, bufferSize, flushInterval, maxRetries, retryDelay
});

const traceMiddleware = new TraceMiddleware({ adapter: contexaAdapter });
traceMiddleware.init(server);

// On shutdown, ensure all events are sent:
await contexaAdapter.flush(5000);
await contexaAdapter.shutdown();
```

---

## Other Adapters

### File Adapter

Logs each trace as a JSON line to a file.

```typescript
import { TraceMiddleware, FileAdapter } from "mcp-trace-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "my-server", version: "1.0.0" });
const traceAdapter = new FileAdapter("trace.log");
const traceMiddleware = new TraceMiddleware({ adapter: traceAdapter });

traceMiddleware.init(server);
```

### Console Adapter

Logs each trace to the console in a human-readable format (with colors).

```typescript
import { TraceMiddleware, ConsoleAdapter } from "mcp-trace-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "my-server", version: "1.0.0" });
const traceAdapter = new ConsoleAdapter();
const traceMiddleware = new TraceMiddleware({ adapter: traceAdapter });

traceMiddleware.init(server);
```

### PostgreSQL Adapter

Store traces in a PostgreSQL table for easy querying and analytics.

**Table schema:**

```sql
CREATE TABLE IF NOT EXISTS trace_events (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  method TEXT,
  session_id TEXT NOT NULL,
  client_id TEXT,
  duration INTEGER,
  entity_name TEXT,
  arguments JSONB,
  response TEXT,
  error TEXT
);
```

**Usage:**

```typescript
import { TraceMiddleware, PostgresTraceAdapter } from "mcp-trace-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "my-server", version: "1.0.0" });
const psqlAdapter = new PostgresTraceAdapter({
  dsn: "postgresql://user:pass@host:port/dbname",
  // Optional: tableName
});
const traceMiddleware = new TraceMiddleware({ adapter: psqlAdapter });

traceMiddleware.init(server);
```

### Supabase Adapter

Log traces to Supabase (PostgreSQL as a service).

**Table schema:** (same as PostgreSQL above)

**Install:**

```bash
npm install @supabase/supabase-js
```

**Usage:**

```typescript
import { createClient } from "@supabase/supabase-js";
import { TraceMiddleware, SupabaseTraceAdapter } from "mcp-trace-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "my-server", version: "1.0.0" });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const supabaseAdapter = new SupabaseTraceAdapter({ supabaseClient: supabase });
const traceMiddleware = new TraceMiddleware({ adapter: supabaseAdapter });

traceMiddleware.init(server);
```

### OTLP Adapter

Send traces to OpenTelemetry-compatible observability platforms (Jaeger, Zipkin, DataDog, etc.) using the OTLP protocol.

**Install:**

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

**Usage:**

```typescript
import { TraceMiddleware, OTLPAdapter } from "mcp-trace-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

const otlpAdapter = new OTLPAdapter({
  endpoint: "http://localhost:4318/v1/traces", // OTLP HTTP endpoint
  // Optional: headers, timeout, retryDelay, maxRetries
});

const traceMiddleware = new TraceMiddleware({ adapter: otlpAdapter });
traceMiddleware.init(server);
```

**Configuration options:**

```typescript
const otlpAdapter = new OTLPAdapter({
  endpoint: "http://localhost:4318/v1/traces",
  headers: {
    Authorization: "Bearer your-token",
  },
  timeout: 5000,
  retryDelay: 1000,
  maxRetries: 3,
});
```

### Multi-Adapter Example

Send traces to multiple backends at once:

```typescript
import {
  TraceMiddleware,
  FileAdapter,
  PostgresTraceAdapter,
  SupabaseTraceAdapter,
  OTLPAdapter,
  MultiAdapter,
} from "mcp-trace-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "my-server", version: "1.0.0" });
const fileAdapter = new FileAdapter("trace.log");
const psqlAdapter = new PostgresTraceAdapter({
  dsn: "postgresql://user:pass@host:port/dbname",
});
const supabaseAdapter = new SupabaseTraceAdapter({ supabaseClient: supabase });
const otlpAdapter = new OTLPAdapter({
  endpoint: "http://localhost:4318/v1/traces",
});

const multiAdapter = new MultiAdapter(
  fileAdapter,
  psqlAdapter,
  supabaseAdapter,
  otlpAdapter
);
const traceMiddleware = new TraceMiddleware({ adapter: multiAdapter });

traceMiddleware.init(server);
```

---

## Requirements

- Node.js 16+
- TypeScript 4.5+ (for TypeScript projects)
- `@modelcontextprotocol/sdk` (for MCP server integration)
- `pg` (for PostgreSQL adapter)
- `@supabase/supabase-js` (for Supabase adapter)
- `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http` (for OTLP adapter)

---

## Contributing

We love contributions! Please open issues for bugs or feature requests, and submit pull requests for improvements.

---

## License

MIT

---

## Links & Acknowledgements

- [Model Context Protocol](https://modelcontextprotocol.io/) — Model Context Protocol
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — Official MCP SDK
