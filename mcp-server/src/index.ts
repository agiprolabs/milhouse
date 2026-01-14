import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ContextStore } from './store.js';
import { ConversationIndexer } from './indexer.js';
import { z } from 'zod';

const store = new ContextStore();
const indexer = new ConversationIndexer(store);

// Get project path from environment variable (set by Milhouse)
const PROJECT_PATH = process.env.MILHOUSE_PROJECT_PATH;
let isWatching = false;

const server = new Server(
  {
    name: 'milhouse-context',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_context',
        description: 'Search for relevant context from past conversations and codebase knowledge. Use this to find information about previous work, decisions, or code patterns.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query - describe what you\'re looking for',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 5)',
            },
            type: {
              type: 'string',
              enum: ['all', 'conversation', 'code', 'decision'],
              description: 'Filter by content type',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_project_summary',
        description: 'Get a summary of the current project including recent activity, key decisions, and important context.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to the project directory',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'store_decision',
        description: 'Store an important decision or piece of knowledge for future reference.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Brief title for the decision/knowledge',
            },
            content: {
              type: 'string',
              description: 'Detailed description of the decision and reasoning',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization',
            },
          },
          required: ['title', 'content'],
        },
      },
      {
        name: 'get_related_conversations',
        description: 'Find past conversations related to a specific topic or file.',
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'Topic or file path to find related conversations for',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of conversations to return',
            },
          },
          required: ['topic'],
        },
      },
      {
        name: 'index_project',
        description: 'Index or re-index a project\'s Claude Code conversations and codebase.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to the project directory',
            },
            force: {
              type: 'boolean',
              description: 'Force re-index even if already indexed',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'start_watching',
        description: 'Start watching for new Claude Code conversations in a project. Also performs initial indexing.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to the project directory to watch',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'get_memory_status',
        description: 'Get the current status of the Milhouse memory system - indexed projects, watching status, and database stats.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_context': {
        const query = args?.query as string;
        const limit = (args?.limit as number) || 5;
        const type = args?.type as string | undefined;

        const results = await store.search(query, limit, type);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_project_summary': {
        const projectPath = args?.projectPath as string;
        const summary = await store.getProjectSummary(projectPath);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      }

      case 'store_decision': {
        const title = args?.title as string;
        const content = args?.content as string;
        const tags = (args?.tags as string[]) || [];

        await store.storeDecision(title, content, tags);
        return {
          content: [
            {
              type: 'text',
              text: `Decision "${title}" stored successfully.`,
            },
          ],
        };
      }

      case 'get_related_conversations': {
        const topic = args?.topic as string;
        const limit = (args?.limit as number) || 5;

        const conversations = await store.getRelatedConversations(topic, limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(conversations, null, 2),
            },
          ],
        };
      }

      case 'index_project': {
        const projectPath = args?.projectPath as string;
        const force = (args?.force as boolean) || false;

        await indexer.indexProject(projectPath, force);
        return {
          content: [
            {
              type: 'text',
              text: `Project "${projectPath}" indexed successfully.`,
            },
          ],
        };
      }

      case 'start_watching': {
        const projectPath = args?.projectPath as string;

        // Stop any existing watcher
        if (isWatching) {
          await indexer.stopWatching();
        }

        // Index and start watching
        await indexer.indexProject(projectPath, false);
        await indexer.startWatching(projectPath);
        isWatching = true;

        return {
          content: [
            {
              type: 'text',
              text: `Now watching project "${projectPath}" for new conversations. Initial indexing complete.`,
            },
          ],
        };
      }

      case 'get_memory_status': {
        const stats = await store.getStats();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                isWatching,
                watchingProject: PROJECT_PATH || 'none',
                ...stats,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  await store.initialize();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Milhouse MCP server started');

  // Auto-index and start watching if project path is provided
  if (PROJECT_PATH) {
    console.error(`Auto-indexing project: ${PROJECT_PATH}`);
    try {
      // Index existing conversations
      await indexer.indexProject(PROJECT_PATH, false);
      console.error('Initial indexing complete');

      // Start watching for new conversations
      await indexer.startWatching(PROJECT_PATH);
      isWatching = true;
      console.error('Started watching for new conversations');
    } catch (error) {
      console.error('Failed to auto-index project:', error);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down...');
  if (isWatching) {
    await indexer.stopWatching();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down...');
  if (isWatching) {
    await indexer.stopWatching();
  }
  process.exit(0);
});

main().catch(console.error);
