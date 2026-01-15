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
              enum: ['all', 'conversation', 'code', 'decision', 'task', 'document'],
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
      // Task management tools
      {
        name: 'list_tasks',
        description: 'List all tasks, optionally filtered by project path or status.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Filter tasks by project path',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
              description: 'Filter tasks by status',
            },
          },
        },
      },
      {
        name: 'create_task',
        description: 'Create a new task to track work items.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Task title',
            },
            content: {
              type: 'string',
              description: 'Task description or details',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Task priority (default: medium)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization',
            },
            projectPath: {
              type: 'string',
              description: 'Associated project path',
            },
          },
          required: ['title', 'content'],
        },
      },
      {
        name: 'update_task_status',
        description: 'Update the status of an existing task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The task ID to update',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
              description: 'New status for the task',
            },
          },
          required: ['taskId', 'status'],
        },
      },
      {
        name: 'delete_task',
        description: 'Delete a task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The task ID to delete',
            },
          },
          required: ['taskId'],
        },
      },
      // Document management tools
      {
        name: 'list_documents',
        description: 'List all stored documents, optionally filtered by project path or tags.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Filter documents by project path',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter documents by tags',
            },
          },
        },
      },
      {
        name: 'store_document',
        description: 'Store a document for future reference (e.g., generated docs, notes, specs).',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Document title',
            },
            content: {
              type: 'string',
              description: 'Document content',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization',
            },
            projectPath: {
              type: 'string',
              description: 'Associated project path',
            },
          },
          required: ['title', 'content'],
        },
      },
      {
        name: 'get_document',
        description: 'Get the full content of a specific document by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'The document ID to retrieve',
            },
          },
          required: ['docId'],
        },
      },
      {
        name: 'delete_document',
        description: 'Delete a document.',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'The document ID to delete',
            },
          },
          required: ['docId'],
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

      // Task management handlers
      case 'list_tasks': {
        const projectPath = args?.projectPath as string | undefined;
        const status = args?.status as 'pending' | 'in_progress' | 'completed' | undefined;

        const tasks = await store.listTasks(projectPath, status);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(tasks, null, 2),
            },
          ],
        };
      }

      case 'create_task': {
        const title = args?.title as string;
        const content = args?.content as string;
        const priority = (args?.priority as 'low' | 'medium' | 'high') || 'medium';
        const tags = (args?.tags as string[]) || [];
        const projectPath = args?.projectPath as string | undefined;

        const taskId = await store.createTask(title, content, priority, tags, projectPath);
        return {
          content: [
            {
              type: 'text',
              text: `Task created successfully with ID: ${taskId}`,
            },
          ],
        };
      }

      case 'update_task_status': {
        const taskId = args?.taskId as string;
        const status = args?.status as 'pending' | 'in_progress' | 'completed';

        await store.updateTaskStatus(taskId, status);
        return {
          content: [
            {
              type: 'text',
              text: `Task ${taskId} status updated to: ${status}`,
            },
          ],
        };
      }

      case 'delete_task': {
        const taskId = args?.taskId as string;

        await store.deleteTask(taskId);
        return {
          content: [
            {
              type: 'text',
              text: `Task ${taskId} deleted successfully.`,
            },
          ],
        };
      }

      // Document management handlers
      case 'list_documents': {
        const projectPath = args?.projectPath as string | undefined;
        const tags = args?.tags as string[] | undefined;

        const documents = await store.listDocuments(projectPath, tags);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(documents, null, 2),
            },
          ],
        };
      }

      case 'store_document': {
        const title = args?.title as string;
        const content = args?.content as string;
        const tags = (args?.tags as string[]) || [];
        const projectPath = args?.projectPath as string | undefined;

        const docId = await store.storeDocument(title, content, tags, projectPath);
        return {
          content: [
            {
              type: 'text',
              text: `Document stored successfully with ID: ${docId}`,
            },
          ],
        };
      }

      case 'get_document': {
        const docId = args?.docId as string;

        const doc = await store.getDocument(docId);
        if (!doc) {
          return {
            content: [
              {
                type: 'text',
                text: `Document not found: ${docId}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(doc, null, 2),
            },
          ],
        };
      }

      case 'delete_document': {
        const docId = args?.docId as string;

        await store.deleteDocument(docId);
        return {
          content: [
            {
              type: 'text',
              text: `Document ${docId} deleted successfully.`,
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
