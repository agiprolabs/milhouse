# Milhouse Context MCP Server

An MCP (Model Context Protocol) server that provides Claude Code with "memory" by indexing and searching past conversations and decisions.

## Features

- **Vector-based semantic search** - Find relevant past conversations and decisions using LanceDB
- **Automatic conversation indexing** - Indexes Claude Code conversations from `~/.claude/projects/`
- **Decision storage** - Store important decisions and architectural choices for future reference
- **File watching** - Automatically indexes new conversations as they happen

## Tools

The server exposes these tools to Claude Code:

| Tool | Description |
|------|-------------|
| `search_context` | Search past conversations and decisions semantically |
| `get_project_summary` | Get a summary of a project's history |
| `store_decision` | Store an important decision or piece of knowledge |
| `get_related_conversations` | Find conversations related to a topic |
| `index_project` | Index or re-index a project's conversations |

## Setup

### Install dependencies

```bash
cd mcp-server
npm install
npm run build
```

### Configure Claude Code

From the project root:

```bash
npm run mcp:configure
```

This adds the MCP server to `~/.claude/settings.json`.

### Remove configuration

```bash
npm run mcp:remove
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | For generating summaries with Claude | Yes |
| `OPENAI_API_KEY` | For better-quality embeddings | No (fallback available) |

## How It Works

1. **Indexing**: The server reads conversation JSON files from `~/.claude/projects/{hash}/conversations/`
2. **Embedding**: Each conversation is summarized and embedded into a vector
3. **Storage**: Vectors are stored in LanceDB at `~/.milhouse/context.lance`
4. **Search**: Queries are embedded and compared against stored vectors for semantic similarity

## Data Storage

- **Vector DB**: `~/.milhouse/context.lance`
- **Configuration**: `~/.claude/settings.json` (mcpServers.milhouse-context)
