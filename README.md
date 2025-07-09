# mcp-trace

<div align="center">
  <img src="images/MCP-TRACE.png" alt="MCP Trace JS Logo" />
</div>

> **Flexible, pluggable tracing middleware for Model Context Protocol (MCP) servers in JavaScript/TypeScript.** Log every request, tool call, and response to local files, PostgreSQL, Supabase, Contexa, console, or your own backend—with full control over what gets logged.

---

## Table of Contents

- [Features](#features)
- [Quickstart](#quickstart)
- [Adapters](#adapters)
  - [File Adapter](#file-adapter)
  - [Console Adapter](#console-adapter)
  - [Contexa Adapter](#contexa-adapter)
  - [PostgreSQL Adapter](#postgresql-adapter)
  - [Supabase Adapter](#supabase-adapter)
  - [Multi-Adapter Example](#multi-adapter-example)
- [Configurable Logging](#configurable-logging)
- [Requirements](#requirements)
- [Contributing](#contributing)
- [License](#license)
- [Links & Acknowledgements](#links--acknowledgements)

---

## Features

- 📦 **Plug-and-play**: Add tracing to any MCP server in seconds
- 🗃️ **Pluggable adapters**: Log to file, PostgreSQL, Supabase, Contexa, console, or your own
- 🛠️ **Configurable logging**: Enable/disable fields (tool args, responses, client ID, etc.)
- 🧩 **Composable**: Use multiple adapters at once
- 📝 **Schema-first**: All traces stored as JSON for easy querying
- 🔒 **Privacy-aware**: Control exactly what gets logged
- ⚡ **TypeScript support**: Full type safety and IntelliSense

---

## Quickstart

### Installation

```bash
npm install mcp-trace
```

### Minimal Example

```typescript
import { TraceMiddleware, FileAdapter } from "mcp-trace-js";

const traceAdapter = new FileAdapter("trace.log");
const traceMiddleware = new TraceMiddleware({ adapter: traceAdapter });

// Use in your MCP server
// See examples/ for integration details
```

---

## Examples

### Basic Usage

See `example/basic-usage.ts` for a simple demonstration of all adapters.

```bash
npm run example
```

### MCP Server Integration

See `example/mcp-server-integration.ts` for how to integrate tracing with an MCP server.

```bash
npm run example:mcp
```

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

## Adapters

### File Adapter

Logs each trace as a JSON line to a file.

```typescript
import { FileAdapter } from "mcp-trace-js";

const traceAdapter = new FileAdapter("trace.log");
const traceMiddleware = new TraceMiddleware({ adapter: traceAdapter });
app.use('/mcp', traceMiddleware.express())
```

### Console Adapter

Logs each trace to the console in a human-readable format (with colors).

``` typescript
import { ConsoleAdapter } from "mcp-trace-js";

const traceAdapter = new ConsoleAdapter();
const traceMiddleware = new TraceMiddleware({ adapter: traceAdapter });
app.use('/mcp', traceMiddleware.express())
```

### ContexaAI Adapter

Send traces to Contexa for cloud-based trace storage and analytics.

**Requirements:**

- Contexa API key (`CONTEXA_API_KEY`)
- Contexa Server ID (`CONTEXA_SERVER_ID`)

**Usage:**

```typescript
import { ContexaTraceAdapter } from "mcp-trace-js";

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

// On shutdown, ensure all events are sent:
await contexaAdapter.flush(5000);
await contexaAdapter.shutdown();

app.use('/mcp', traceMiddleware.express())
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
import { PostgresTraceAdapter } from "mcp-trace-js";

const psqlAdapter = new PostgresTraceAdapter({
  dsn: "postgresql://user:pass@host:port/dbname",
  // Optional: tableName
});
const traceMiddleware = new TraceMiddleware({ adapter: psqlAdapter });

app.use('/mcp', traceMiddleware.express())
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
import { SupabaseTraceAdapter } from "mcp-trace-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const supabaseAdapter = new SupabaseTraceAdapter({ supabaseClient: supabase });
const traceMiddleware = new TraceMiddleware({ adapter: supabaseAdapter });

app.use('/mcp', traceMiddleware.express())
```

### Multi-Adapter Example

Send traces to multiple backends at once:

```typescript
import {
  FileAdapter,
  PostgresTraceAdapter,
  SupabaseTraceAdapter,
  MultiAdapter,
} from "mcp-trace-js";

const fileAdapter = new FileAdapter("trace.log");
const psqlAdapter = new PostgresTraceAdapter({
  dsn: "postgresql://user:pass@host:port/dbname",
});
const supabaseAdapter = new SupabaseTraceAdapter({ supabaseClient: supabase });

const multiAdapter = new MultiAdapter(
  fileAdapter,
  psqlAdapter,
  supabaseAdapter
);
const traceMiddleware = new TraceMiddleware({ adapter: multiAdapter });

app.use('/mcp', traceMiddleware.express())
```

---

## Configurable Logging

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

---

## Requirements

- Node.js 16+
- TypeScript 4.5+ (for TypeScript projects)
- `@modelcontextprotocol/sdk` (for MCP server integration)
- `pg` (for PostgreSQL adapter)
- `@supabase/supabase-js` (for Supabase adapter)

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
