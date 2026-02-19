# Model Context Protocol (MCP)

**Version:** 2025-06-18 (Official MCP Specification)

This document provides a technical understanding of the Model Context Protocol, focusing on how it works end-to-end, where keys are stored, and the request lifecycle.

---

## What Is MCP?

The Model Context Protocol is a **standardized communication protocol** for AI applications to interact with external tools and data sources. It defines:

- **Data Format**: JSON-RPC 2.0 messages
- **Transport**: STDIO (local) or Streamable HTTP (remote)
- **Semantics**: How clients and servers negotiate capabilities and exchange data

**MCP focuses solely on context exchange.** It does NOT dictate how AI applications use LLMs or manage the provided context.

---

## Architecture: Client-Server Model

### Participants

MCP uses a strict **client-server relationship**:

| Participant | What It Is | Example |
|------------|-----------|---------|
| **MCP Host** | The AI application that manages connections | Claude Desktop, Claude Code, LangChain agent |
| **MCP Client** | A connection manager created by the host for each server | Manages one dedicated connection to one MCP server |
| **MCP Server** | A program that provides tools, resources, or prompts | GitHub MCP Server, Slack MCP Server, filesystem server |

### Connection Model

**Critical relationship:** The MCP host creates **one MCP client per MCP server**. Each client maintains a dedicated connection to its corresponding server.

```
MCP Host (e.g., Claude Desktop)
│
├─── MCP Client 1 ──→ [MCP Server A: Filesystem]
│    (dedicated connection via STDIO)
│
├─── MCP Client 2 ──→ [MCP Server B: GitHub]
│    (dedicated connection via HTTP)
│
├─── MCP Client 3 ──→ [MCP Server C: Slack]
│    (dedicated connection via HTTP)
│
└─── MCP Client 4 ──→ [MCP Server D: Zuul Proxy]
     (dedicated connection via STDIO or HTTP)
```

**Each connection is independent.** Servers do not communicate with each other. The host (agent) chooses which server to route a tool call to.

---

## Two Layers: Data and Transport

MCP separates concerns into two layers:

### Data Layer (JSON-RPC 2.0)

Defines **what** is communicated:

- **Lifecycle management**: Initialize connection, negotiate capabilities, handle shutdown
- **Primitives** (what servers expose):
  - **Tools**: Executable functions (e.g., "create_issue", "send_message")
  - **Resources**: Data sources (e.g., file contents, database schema)
  - **Prompts**: Interaction templates (e.g., system prompts, few-shot examples)
- **Primitives** (what clients expose):
  - **Sampling**: Request LLM completions from the host's AI model
  - **Elicitation**: Request user input from the host
  - **Logging**: Send debug messages to the host
- **Notifications**: Unsolicited messages from server to client (e.g., "tools list changed")

All data layer messages use **JSON-RPC 2.0 format**.

### Transport Layer

Defines **how** messages are sent:

| Transport | Use Case | Characteristics |
|-----------|----------|-----------------|
| **STDIO** | Local server on same machine | Subprocess stdin/stdout, no network, optimal performance |
| **Streamable HTTP** | Remote server | HTTP POST + Server-Sent Events, bearer token auth, one server handles many clients |

**The transport is abstracted.** The same JSON-RPC 2.0 protocol works over both transports.

---

## Request Lifecycle: Four Steps

### Step 1: Initialization (Capability Negotiation)

**Purpose**: Both client and server declare what features they support.

**Client sends:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "elicitation": {}
    },
    "clientInfo": {
      "name": "claude-desktop",
      "version": "1.0.0"
    }
  }
}
```

**Server responds:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": {
        "listChanged": true
      },
      "resources": {}
    },
    "serverInfo": {
      "name": "github-mcp-server",
      "version": "1.0.0"
    }
  }
}
```

**Negotiation Details:**

- **protocolVersion**: Must match or be compatible. Different versions cannot communicate.
- **Client capabilities**: What the client can do (e.g., `"elicitation": {}` means client can handle user input requests)
- **Server capabilities**: What the server provides:
  - `"tools": {"listChanged": true}` → Server has tools AND can send `tools/list_changed` notifications
  - `"resources": {}` → Server has resources

**After successful initialization, client sends:**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

This initialization happens **once per connection** and establishes the session context.

---

### Step 2: Tool Discovery

**Purpose**: Client discovers what tools are available on the server.

**Client sends:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

**Server responds with available tools:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "create_issue",
        "title": "Create Issue",
        "description": "Create a new GitHub issue in a repository",
        "inputSchema": {
          "type": "object",
          "properties": {
            "owner": {
              "type": "string",
              "description": "Repository owner"
            },
            "repo": {
              "type": "string",
              "description": "Repository name"
            },
            "title": {
              "type": "string",
              "description": "Issue title"
            },
            "body": {
              "type": "string",
              "description": "Issue body (optional)"
            }
          },
          "required": ["owner", "repo", "title"]
        }
      },
      {
        "name": "list_repos",
        "title": "List Repositories",
        "description": "List all repositories for a user",
        "inputSchema": {
          "type": "object",
          "properties": {
            "username": {
              "type": "string",
              "description": "GitHub username"
            }
          },
          "required": ["username"]
        }
      }
    ]
  }
}
```

**Key fields in tool response:**

- **name**: Unique identifier (used in tool calls)
- **title**: Human-readable name
- **description**: What the tool does
- **inputSchema**: JSON Schema defining required/optional parameters

The client now knows what tools are available and their parameters.

---

### Step 3: Tool Execution

**Purpose**: Client invokes a tool on the server.

**Client sends:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "create_issue",
    "arguments": {
      "owner": "myorg",
      "repo": "myproject",
      "title": "Fix authentication bug"
    }
  }
}
```

**Server executes and responds:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Successfully created issue #42: https://github.com/myorg/myproject/issues/42"
      }
    ]
  }
}
```

**Execution flow:**

1. Client specifies tool name (must match name from `tools/list`)
2. Client provides arguments (validated against `inputSchema`)
3. Server executes the tool
4. Server returns results in `content` array (supports multiple content types: text, images, resources)

---

### Step 4: Real-time Updates (Notifications)

**Purpose**: Server notifies client of changes without being asked.

**Server sends** (no `id` — this is a notification, not a request):
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed"
}
```

**Client typically responds by refreshing:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/list"
}
```

Notifications keep the client's view of available tools synchronized with server state. This is **event-driven**, not polled.

---

## Primitives: Core Capabilities

### Server Primitives (What Servers Expose)

#### Tools
Executable functions that perform actions.

```json
{
  "method": "tools/list",
  "params": {}
}
```

Returns array of tool objects with name, description, inputSchema.

```json
{
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": {...}
  }
}
```

Executes a tool and returns results.

**Notifications:**
- `notifications/tools/list_changed` → tools changed, client should refresh

#### Resources
Data sources that provide context (read-only).

```json
{
  "method": "resources/list",
  "params": {}
}
```

Returns available resources with name, description, URI.

```json
{
  "method": "resources/read",
  "params": {
    "uri": "resource://path"
  }
}
```

Reads a resource and returns content.

#### Prompts
Reusable interaction templates.

```json
{
  "method": "prompts/list",
  "params": {}
}
```

Returns available prompt templates.

```json
{
  "method": "prompts/get",
  "params": {
    "name": "prompt_name"
  }
}
```

Returns full prompt template.

---

### Client Primitives (What Clients Expose)

#### Sampling
Request language model completions from the host's AI application.

```json
{
  "method": "sampling/complete",
  "params": {
    "messages": [
      {
        "role": "user",
        "content": "What should I do next?"
      }
    ]
  }
}
```

**Use case**: Server needs LLM intelligence without embedding an LLM.

#### Elicitation
Request additional information from the user.

```json
{
  "method": "elicitation/request",
  "params": {
    "name": "username",
    "description": "Enter your GitHub username"
  }
}
```

**Use case**: Server needs user input to proceed.

#### Logging
Send debug/diagnostic messages to the client.

```json
{
  "method": "logging/log",
  "params": {
    "level": "info",
    "message": "Tool execution started"
  }
}
```

---

## Stateful Protocol

MCP is **stateful**, not stateless. This is critical for understanding its design:

1. **Connection must be initialized first** — Capability negotiation happens once
2. **Session context persists** — Both sides remember what was negotiated
3. **Servers can send unsolicited messages** — Notifications, requests for sampling/elicitation
4. **Bidirectional communication** — Not just request-response; servers can request things from clients

**Comparison to REST:**
- REST: Each request is independent, all context in headers/body
- MCP: Connection is a conversation with persistent context

---

## Key Storage: The Critical Point

### How Native MCP Servers Handle Credentials

When you use a native MCP server (GitHub MCP, Slack MCP, etc.):

1. **Server is configured with credentials** at startup:
   ```bash
   export GITHUB_TOKEN=ghp_abc123...
   export GITHUB_USERNAME=myuser
   github-mcp-server stdio
   ```

2. **Server holds keys internally** (in memory)

3. **Agent connects via MCP** and requests tools:
   ```json
   {
     "method": "tools/call",
     "params": {
       "name": "create_issue",
       "arguments": {"owner": "...", "repo": "...", "title": "..."}
     }
   }
   ```

4. **Server executes with its own keys** (makes HTTP call to GitHub API):
   ```http
   POST https://api.github.com/repos/owner/repo/issues
   Authorization: token ghp_abc123...
   Content-Type: application/json

   {"title": "..."}
   ```

5. **Server returns result to agent** (agent never sees the token):
   ```json
   {
     "result": {
       "content": [{"type": "text", "text": "Issue #42 created"}]
     }
   }
   ```

**The agent never sees the API key. The server has it.**

### Where Keys Are NOT

- ❌ Not passed in MCP messages
- ❌ Not exposed to the agent
- ❌ Not injectable by the proxy at request time (in native MCP servers)
- ❌ Not transmitted over the protocol (except in protocol authentication headers, e.g., for HTTP transport)

### Where Keys ARE

- ✅ In the server's environment variables
- ✅ In the server's configuration file
- ✅ In the server's memory at runtime
- ✅ In HTTP headers (for `Streamable HTTP` transport authentication)

---

## Transport Details

### STDIO Transport (Local)

```
┌─────────────┐           stdio            ┌─────────────────┐
│  MCP Host   │◄──────────────────────────►│  MCP Server     │
│  (agent)    │   (stdin/stdout)           │  (subprocess)   │
└─────────────┘                            └─────────────────┘
  │                                          │
  └── One MCP Client per server              └── Holds credentials
      Receives JSON-RPC messages                Reads from env vars
      Sends JSON-RPC messages                   Executes tools locally
```

**Characteristics:**
- No network overhead
- Optimal performance
- One client per server
- Server runs as subprocess of host

**Authentication:** None (same machine, subprocess trust).

### Streamable HTTP Transport (Remote)

```
┌─────────────┐        HTTP POST          ┌──────────────────┐
│  MCP Host   │◄─────────────────────────►│  Remote MCP      │
│  (agent)    │   (JSON-RPC messages)     │  Server          │
└─────────────┘        SSE for ←──────────┤  (on server)     │
  │                    server→client msgs  └──────────────────┘
  └── One MCP Client   │
      Handles many     └── Holds credentials
      parallel requests    (in server environment)
```

**Characteristics:**
- Network communication
- HTTP authentication headers (bearer tokens, API keys)
- One server can serve many clients
- Server runs on remote machine

**Authentication:** HTTP headers (e.g., `Authorization: Bearer token` or custom `X-API-Key` header).

---

## Request Lifecycle Summary

```
┌──────────────────────────────────────────────┐
│ 1. INITIALIZATION                            │
│ Client: [initialize]                         │
│ Server: [capabilities response]              │
│ Client: [notifications/initialized]          │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│ 2. TOOL DISCOVERY                            │
│ Client: [tools/list]                         │
│ Server: [tools array with schemas]           │
│ (Optional: Server sends tools/list_changed)  │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│ 3. TOOL EXECUTION (Repeated)                 │
│ Client: [tools/call with name + arguments]   │
│ Server: [executes with its own keys]         │
│ Server: [result content array]               │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│ 4. REAL-TIME UPDATES                         │
│ Server: [notifications/tools/list_changed]   │
│ Client: [tools/list] (refresh)               │
└──────────────────────────────────────────────┘
```

---

## Implications for Zuul Proxy

### Key Facts About MCP

1. **Connection is between agent and server** — Not mediated by a third party
2. **Servers hold credentials** — Native MCP servers manage their own keys
3. **Tool execution happens on the server** — With the server's credentials
4. **The agent chooses which server to use** — Based on available tools and LLM decision
5. **Protocol is stateful** — Session context persists across multiple requests

### What This Means for Governance

**If Zuul is just another MCP server:**
- Agent can connect to Zuul OR connect to native MCP servers directly
- Agent will prefer native servers (lower latency, more direct)
- Zuul only governs requests that agents explicitly route to it
- Governance is **opt-in, not enforced**

**If an agent has credentials for a native MCP server:**
- Agent can bypass Zuul by connecting directly to that server
- Zuul has no visibility into those requests
- Governance is **bypassable**

---

## Example: Agent Using GitHub MCP

### Scenario 1: Direct Connection (Bypasses Zuul)

```json
{
  "mcpServers": {
    "github": {
      "command": "github-mcp-server stdio",
      "env": {
        "GITHUB_TOKEN": "ghp_abc123..."
      }
    }
  }
}
```

**Flow:**
1. Agent starts GitHub MCP server with token
2. Agent connects to GitHub server via MCP
3. Agent calls `tools/call(create_issue)`
4. GitHub server executes with `ghp_abc123...`
5. Zuul never sees this request

### Scenario 2: Through Zuul (If Agent Chooses)

```json
{
  "mcpServers": {
    "zuul": {
      "command": "zuul-proxy stdio",
      "env": {
        "ZUUL_PRIVATE_KEY": "...",
        "HEDERA_ACCOUNT": "..."
      }
    }
  }
}
```

**Flow:**
1. Agent connects to Zuul MCP server
2. Zuul lists tools from its registered backends
3. Agent calls `tools/call(create_issue, {arguments})`
4. **Zuul verifies signature** ✅
5. **Zuul checks RBAC** ✅
6. **Zuul injects GitHub token** ✅
7. **Zuul logs to blockchain** ✅
8. Zuul forwards to GitHub API
9. Zuul returns result to agent

**In this scenario, Zuul provides governance.**

---

## Conclusion

MCP is a **decoupled, stateful protocol** where:
- Agents independently choose which servers to connect to
- Servers hold and manage their own credentials
- Communication is peer-to-peer between agent and server
- Governance is optional (only applies to servers agent chooses to use)

For Zuul to enforce governance, agents must be **constrained** to use Zuul (via network isolation, configuration restriction, or infrastructure control), not just incentivized by convenience.

---

## References

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [MCP Architecture Overview](https://modelcontextprotocol.io/docs/concepts/architecture)
- [MCP Server Implementation Guide](https://modelcontextprotocol.io/docs/server)
- [MCP Client Implementation Guide](https://modelcontextprotocol.io/docs/client)
