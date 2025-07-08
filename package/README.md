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
  - [Contexa Adapter](#contexaai-adapter)
  - [PostgreSQL Adapter](#postgresql-adapter)
  - [Supabase Adapter](#supabase-adapter)
  - [Multi-Adapter Example](#multi-adapter-example)
- [Configurable Logging](#configurable-logging)
- [Requirements](#requirements)
- [Contributing](#contributing)
  - [How to Contribute](#-how-to-contribute)
  - [Reporting Bugs](#-reporting-bugs)
  - [Feature Requests](#-feature-requests)
  - [Code Standards](#-code-standards)
  - [Testing Guidelines](#-testing-guidelines)
  - [Documentation Standards](#-documentation-standards)
  - [Release Process](#-release-process)
  - [Areas for Contribution](#-areas-for-contribution)
  - [Getting Help](#-getting-help)
  - [Recognition](#-recognition)
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

````

---

## Adapters

### File Adapter

Logs each trace as a JSON line to a file.

```typescript
import { FileAdapter } from "mcp-trace-js";

const traceAdapter = new FileAdapter("trace.log");
const traceMiddleware = new TraceMiddleware({ adapter: traceAdapter });
````

### Console Adapter

Logs each trace to the console in a human-readable format (with colors).

```typescript
import { ConsoleAdapter } from "mcp-trace-js";

const traceAdapter = new ConsoleAdapter();
const traceMiddleware = new TraceMiddleware({ adapter: traceAdapter });
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

We love contributions! This project thrives on community involvement. Whether you're fixing bugs, adding features, improving documentation, or suggesting ideas, your contributions are welcome.

### 🤝 How to Contribute

#### **Before You Start**

- Check existing [issues](https://github.com/your-org/mcp-trace-js/issues) to see if your idea is already being worked on
- For major changes, please open an issue first to discuss what you'd like to change
- Make sure your code follows our coding standards (see below)

#### **Development Setup**

1. **Fork and Clone**

   ```bash
   git clone https://github.com/your-username/mcp-trace-js.git
   cd mcp-trace-js
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```


3. **Run Examples**
   ```bash
   npm run example
   npm run example:mcp
   npm run example:streamable-http
   ```

#### **Making Changes**

1. **Create a Feature Branch**

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Follow Our Coding Standards**

   - Use TypeScript for all new code
   - Follow the existing code style and formatting
   - Add JSDoc comments for public APIs
   - Write meaningful commit messages
   - Keep functions small and focused

3. **Testing**

   - Add tests for new functionality
   - Ensure all existing tests pass
   - Test with multiple Node.js versions if possible

4. **Documentation**
   - Update README.md if adding new features
   - Add inline documentation for complex logic
   - Update examples if API changes

#### **Pull Request Process**

1. **Prepare Your PR**

   - Ensure your code follows our standards
   - Add tests for new functionality
   - Update documentation as needed
   - Make sure all CI checks pass

2. **PR Description**

   - Clearly describe the problem and solution
   - Include any relevant issue numbers
   - Add screenshots for UI changes
   - List any breaking changes

3. **Review Process**
   - At least one maintainer must approve
   - Address any feedback from reviewers
   - Keep the PR focused and manageable

### 🐛 Reporting Bugs

When reporting bugs, please include:

- **Environment**: Node.js version, OS, package version
- **Steps to Reproduce**: Clear, step-by-step instructions
- **Expected vs Actual Behavior**: What you expected vs what happened
- **Code Example**: Minimal code that reproduces the issue
- **Error Messages**: Full error stack traces if applicable

### 💡 Feature Requests

For feature requests:

- **Use Case**: Explain why this feature would be useful
- **Proposed API**: Suggest how the feature might work
- **Alternatives**: Mention if you've considered other approaches
- **Implementation**: If you have ideas on how to implement it

### 📋 Code Standards

#### **TypeScript**

- Use strict TypeScript configuration
- Prefer interfaces over types for object shapes
- Use meaningful type names
- Avoid `any` - use proper typing

#### **Code Style**

- Use 2-space indentation
- Use semicolons
- Use single quotes for strings
- Use trailing commas in objects and arrays
- Maximum line length: 100 characters

#### **Naming Conventions**

- Use camelCase for variables and functions
- Use PascalCase for classes and interfaces
- Use UPPER_SNAKE_CASE for constants
- Use descriptive names that explain intent

#### **Error Handling**

- Use proper error types
- Include meaningful error messages
- Handle async errors appropriately
- Log errors with context

### 🧪 Testing Guidelines

- Write unit tests for all new functionality
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies
- Keep tests fast and reliable

### 📚 Documentation Standards

- Keep README.md up to date
- Use clear, concise language
- Include code examples
- Document breaking changes
- Update API documentation

### 🚀 Release Process

1. **Version Bumping**

   - Use semantic versioning (semver)
   - Update package.json version

2. **Pre-release Checklist**

   - All tests pass
   - Documentation is updated
   - Examples work correctly
   - No breaking changes (unless major version)

3. **Publishing**
   - Create a git tag
   - Publish to npm
   - Update release notes

### 🎯 Areas for Contribution

We're particularly interested in contributions for:

- **New Adapters**: Database adapters, cloud services, etc.
- **Performance Improvements**: Faster tracing, better memory usage
- **Testing**: More comprehensive test coverage
- **Documentation**: Better examples, tutorials, guides
- **Bug Fixes**: Any issues you encounter
- **TypeScript Improvements**: Better type definitions
- **Examples**: More integration examples

### 📞 Getting Help

- **Issues**: Use GitHub issues for bugs and feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas
- **Code of Conduct**: Be respectful and inclusive

### 🙏 Recognition

Contributors will be recognized in:

- README.md contributors section
- Release notes
- GitHub contributors page

Thank you for contributing to mcp-trace-js! 🎉

---

## License

MIT

---

## Links & Acknowledgements

- [Model Context Protocol](https://modelcontextprotocol.io/) — Model Context Protocol
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — Official MCP SDK
