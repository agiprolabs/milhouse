import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chokidar from 'chokidar';
import { ContextStore } from './store.js';
import { generateSummary } from './embeddings.js';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

interface ClaudeConversation {
  id: string;
  messages: ClaudeMessage[];
  projectPath?: string;
}

export class ConversationIndexer {
  private store: ContextStore;
  private claudeDir: string;
  private watcher: chokidar.FSWatcher | null = null;
  private indexedFiles: Set<string> = new Set();

  constructor(store: ContextStore) {
    this.store = store;
    this.claudeDir = path.join(os.homedir(), '.claude');
  }

  async indexProject(projectPath: string, force: boolean = false): Promise<void> {
    // Find Claude Code project directory
    const projectsDir = path.join(this.claudeDir, 'projects');

    try {
      const projects = await fs.readdir(projectsDir);

      for (const projectHash of projects) {
        const projectDir = path.join(projectsDir, projectHash);
        const settingsPath = path.join(projectDir, 'settings.json');

        try {
          const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));

          // Check if this project matches the requested path
          if (settings.projectPath === projectPath || projectPath.includes(projectHash)) {
            await this.indexProjectConversations(projectDir, projectPath, force);
            return;
          }
        } catch {
          // Settings file doesn't exist or can't be parsed
          continue;
        }
      }

      // If no matching project found, try to index by hash
      const hashDir = path.join(projectsDir, this.hashProjectPath(projectPath));
      if (await this.exists(hashDir)) {
        await this.indexProjectConversations(hashDir, projectPath, force);
      }
    } catch (error) {
      console.error('Failed to index project:', error);
      throw error;
    }
  }

  private async indexProjectConversations(
    projectDir: string,
    projectPath: string,
    force: boolean
  ): Promise<void> {
    const conversationsDir = path.join(projectDir, 'conversations');

    if (!(await this.exists(conversationsDir))) {
      console.log('No conversations directory found');
      return;
    }

    const files = await fs.readdir(conversationsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const filePath = path.join(conversationsDir, file);

      if (!force && this.indexedFiles.has(filePath)) {
        continue;
      }

      try {
        await this.indexConversationFile(filePath, projectPath);
        this.indexedFiles.add(filePath);
      } catch (error) {
        console.error(`Failed to index conversation ${file}:`, error);
      }
    }

    console.log(`Indexed ${jsonFiles.length} conversations for ${projectPath}`);
  }

  private async indexConversationFile(
    filePath: string,
    projectPath: string
  ): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const conversation = JSON.parse(content) as ClaudeConversation;

    // Extract meaningful content from messages
    const messageTexts = conversation.messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    // Generate a summary using Claude
    const summary = await generateSummary(messageTexts);

    // Extract a title from the first user message
    const firstUserMessage = conversation.messages.find(m => m.role === 'user');
    const title = firstUserMessage
      ? firstUserMessage.content.substring(0, 100)
      : 'Untitled conversation';

    // Store in vector DB
    await this.store.storeConversation(
      conversation.id || path.basename(filePath, '.json'),
      title,
      `${summary}\n\n---\n\n${messageTexts.substring(0, 5000)}`,
      projectPath
    );
  }

  async startWatching(projectPath: string): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
    }

    const projectsDir = path.join(this.claudeDir, 'projects');

    this.watcher = chokidar.watch(projectsDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 3,
    });

    this.watcher.on('add', async (filePath) => {
      if (filePath.endsWith('.json') && filePath.includes('conversations')) {
        console.log(`New conversation detected: ${filePath}`);
        try {
          await this.indexConversationFile(filePath, projectPath);
          this.indexedFiles.add(filePath);
        } catch (error) {
          console.error('Failed to index new conversation:', error);
        }
      }
    });

    this.watcher.on('change', async (filePath) => {
      if (filePath.endsWith('.json') && filePath.includes('conversations')) {
        console.log(`Conversation updated: ${filePath}`);
        try {
          await this.indexConversationFile(filePath, projectPath);
        } catch (error) {
          console.error('Failed to re-index conversation:', error);
        }
      }
    });

    console.log('Started watching for Claude Code conversations');
  }

  async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private hashProjectPath(projectPath: string): string {
    // Simple hash for project path (Claude Code uses a similar approach)
    let hash = 0;
    for (let i = 0; i < projectPath.length; i++) {
      const char = projectPath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
