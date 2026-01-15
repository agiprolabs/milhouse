import * as lancedb from '@lancedb/lancedb';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { generateEmbedding } from './embeddings.js';

interface ContextEntry {
  id: string;
  type: 'conversation' | 'code' | 'decision' | 'task' | 'document';
  title: string;
  content: string;
  projectPath?: string;
  filePath?: string;
  tags: string[];
  timestamp: number;
  vector: number[];
  // Task-specific fields
  status?: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

export interface TaskEntry {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  timestamp: number;
  projectPath?: string;
}

export interface DocumentEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  timestamp: number;
  projectPath?: string;
}

interface SearchResult {
  id: string;
  type: string;
  title: string;
  content: string;
  score: number;
  timestamp: number;
}

export class ContextStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(os.homedir(), '.milhouse', 'context.lance');
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

    // Connect to LanceDB
    this.db = await lancedb.connect(this.dbPath);

    // Create or open table
    const tables = await this.db.tableNames();
    if (tables.includes('context')) {
      this.table = await this.db.openTable('context');
    } else {
      // Create table with initial schema (need non-empty array for type inference)
      this.table = await this.db.createTable('context', [
        {
          id: 'init',
          type: 'decision',
          title: 'Initial entry',
          content: 'Database initialized',
          projectPath: '',
          filePath: '',
          tags: ['system'], // Need at least one element for type inference
          timestamp: Date.now(),
          vector: new Array(1536).fill(0), // OpenAI embedding dimension
        },
      ]);
    }
  }

  async search(query: string, limit: number = 5, type?: string): Promise<SearchResult[]> {
    if (!this.table) throw new Error('Store not initialized');

    const queryVector = await generateEmbedding(query);

    let results = await this.table
      .search(queryVector)
      .limit(limit * 2) // Get more to filter
      .toArray();

    // Filter by type if specified
    if (type && type !== 'all') {
      results = results.filter((r: any) => r.type === type);
    }

    return results.slice(0, limit).map((r: any) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      content: r.content.substring(0, 500) + (r.content.length > 500 ? '...' : ''),
      score: r._distance ? 1 - r._distance : 1,
      timestamp: r.timestamp,
    }));
  }

  async addEntry(entry: Omit<ContextEntry, 'vector'>): Promise<void> {
    if (!this.table) throw new Error('Store not initialized');

    const vector = await generateEmbedding(`${entry.title}\n${entry.content}`);

    await this.table.add([
      {
        ...entry,
        vector,
      },
    ]);
  }

  async storeDecision(title: string, content: string, tags: string[]): Promise<void> {
    await this.addEntry({
      id: `decision-${Date.now()}`,
      type: 'decision',
      title,
      content,
      tags,
      timestamp: Date.now(),
    });
  }

  async storeConversation(
    id: string,
    title: string,
    content: string,
    projectPath: string
  ): Promise<void> {
    await this.addEntry({
      id,
      type: 'conversation',
      title,
      content,
      projectPath,
      tags: [],
      timestamp: Date.now(),
    });
  }

  async storeCodeContext(
    filePath: string,
    content: string,
    projectPath: string
  ): Promise<void> {
    await this.addEntry({
      id: `code-${filePath}-${Date.now()}`,
      type: 'code',
      title: path.basename(filePath),
      content,
      projectPath,
      filePath,
      tags: [],
      timestamp: Date.now(),
    });
  }

  async getProjectSummary(projectPath: string): Promise<object> {
    if (!this.table) throw new Error('Store not initialized');

    const allEntries = await this.table.query().toArray();
    const projectEntries = allEntries.filter(
      (e: any) => e.projectPath === projectPath
    );

    const conversations = projectEntries.filter((e: any) => e.type === 'conversation');
    const decisions = projectEntries.filter((e: any) => e.type === 'decision');
    const codeContexts = projectEntries.filter((e: any) => e.type === 'code');

    // Get recent entries
    const recentConversations = conversations
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .slice(0, 5)
      .map((c: any) => ({ title: c.title, timestamp: c.timestamp }));

    const recentDecisions = decisions
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .slice(0, 5)
      .map((d: any) => ({ title: d.title, content: d.content.substring(0, 200) }));

    return {
      projectPath,
      stats: {
        totalConversations: conversations.length,
        totalDecisions: decisions.length,
        totalCodeContexts: codeContexts.length,
      },
      recentConversations,
      recentDecisions,
    };
  }

  async getRelatedConversations(topic: string, limit: number = 5): Promise<object[]> {
    const results = await this.search(topic, limit, 'conversation');
    return results;
  }

  async hasProject(projectPath: string): Promise<boolean> {
    if (!this.table) throw new Error('Store not initialized');

    const allEntries = await this.table.query().toArray();
    return allEntries.some((e: any) => e.projectPath === projectPath);
  }

  async getStats(): Promise<object> {
    if (!this.table) throw new Error('Store not initialized');

    const allEntries = await this.table.query().toArray();

    const conversations = allEntries.filter((e: any) => e.type === 'conversation');
    const decisions = allEntries.filter((e: any) => e.type === 'decision');
    const codeContexts = allEntries.filter((e: any) => e.type === 'code');
    const tasks = allEntries.filter((e: any) => e.type === 'task');
    const documents = allEntries.filter((e: any) => e.type === 'document');

    // Get unique projects
    const projects = new Set(allEntries.map((e: any) => e.projectPath).filter(Boolean));

    return {
      totalEntries: allEntries.length,
      conversations: conversations.length,
      decisions: decisions.length,
      codeContexts: codeContexts.length,
      tasks: tasks.length,
      documents: documents.length,
      indexedProjects: Array.from(projects),
      databasePath: this.dbPath,
    };
  }

  // Task management methods
  async createTask(
    title: string,
    content: string,
    priority: 'low' | 'medium' | 'high' = 'medium',
    tags: string[] = [],
    projectPath?: string
  ): Promise<string> {
    const id = `task-${Date.now()}`;
    await this.addEntry({
      id,
      type: 'task',
      title,
      content,
      status: 'pending',
      priority,
      tags,
      projectPath,
      timestamp: Date.now(),
    });
    return id;
  }

  async updateTaskStatus(
    taskId: string,
    status: 'pending' | 'in_progress' | 'completed'
  ): Promise<void> {
    if (!this.table) throw new Error('Store not initialized');

    // LanceDB doesn't have direct update, so we need to get, delete, and re-add
    const allEntries = await this.table.query().toArray();
    const task = allEntries.find((e: any) => e.id === taskId && e.type === 'task');

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Update the status and re-add
    task.status = status;
    task.timestamp = Date.now();

    // Delete old entry and add updated one
    await this.table.delete(`id = '${taskId}'`);
    await this.table.add([task]);
  }

  async listTasks(
    projectPath?: string,
    status?: 'pending' | 'in_progress' | 'completed'
  ): Promise<TaskEntry[]> {
    if (!this.table) throw new Error('Store not initialized');

    const allEntries = await this.table.query().toArray();
    let tasks = allEntries.filter((e: any) => e.type === 'task');

    if (projectPath) {
      tasks = tasks.filter((t: any) => t.projectPath === projectPath);
    }

    if (status) {
      tasks = tasks.filter((t: any) => t.status === status);
    }

    return tasks
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .map((t: any) => ({
        id: t.id,
        title: t.title,
        content: t.content,
        status: t.status || 'pending',
        priority: t.priority || 'medium',
        tags: t.tags || [],
        timestamp: t.timestamp,
        projectPath: t.projectPath,
      }));
  }

  async deleteTask(taskId: string): Promise<void> {
    if (!this.table) throw new Error('Store not initialized');
    await this.table.delete(`id = '${taskId}'`);
  }

  // Document management methods
  async storeDocument(
    title: string,
    content: string,
    tags: string[] = [],
    projectPath?: string
  ): Promise<string> {
    const id = `doc-${Date.now()}`;
    await this.addEntry({
      id,
      type: 'document',
      title,
      content,
      tags,
      projectPath,
      timestamp: Date.now(),
    });
    return id;
  }

  async listDocuments(projectPath?: string, tags?: string[]): Promise<DocumentEntry[]> {
    if (!this.table) throw new Error('Store not initialized');

    const allEntries = await this.table.query().toArray();
    let documents = allEntries.filter((e: any) => e.type === 'document');

    if (projectPath) {
      documents = documents.filter((d: any) => d.projectPath === projectPath);
    }

    if (tags && tags.length > 0) {
      documents = documents.filter((d: any) =>
        tags.some((tag) => d.tags?.includes(tag))
      );
    }

    return documents
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .map((d: any) => ({
        id: d.id,
        title: d.title,
        content: d.content,
        tags: d.tags || [],
        timestamp: d.timestamp,
        projectPath: d.projectPath,
      }));
  }

  async getDocument(docId: string): Promise<DocumentEntry | null> {
    if (!this.table) throw new Error('Store not initialized');

    const allEntries = await this.table.query().toArray();
    const doc = allEntries.find((e: any) => e.id === docId && e.type === 'document');

    if (!doc) return null;

    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      tags: doc.tags || [],
      timestamp: doc.timestamp,
      projectPath: doc.projectPath,
    };
  }

  async deleteDocument(docId: string): Promise<void> {
    if (!this.table) throw new Error('Store not initialized');
    await this.table.delete(`id = '${docId}'`);
  }
}
