import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ClaudeSettings {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const MCP_SERVER_NAME = 'milhouse-context';

export async function configureMcpServer(
  serverPath: string,
  openaiApiKey?: string
): Promise<void> {
  let settings: ClaudeSettings = {};

  // Read existing settings
  try {
    const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
    settings = JSON.parse(content);
  } catch {
    // File doesn't exist or is invalid, start fresh
  }

  // Ensure mcpServers object exists
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  // Configure the Milhouse MCP server
  const serverConfig: McpServerConfig = {
    command: 'node',
    args: [path.join(serverPath, 'dist', 'index.js')],
  };

  // Add environment variables if provided
  if (openaiApiKey) {
    serverConfig.env = {
      OPENAI_API_KEY: openaiApiKey,
    };
  }

  settings.mcpServers[MCP_SERVER_NAME] = serverConfig;

  // Write updated settings
  await fs.mkdir(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
  await fs.writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));

  console.log(`Configured MCP server "${MCP_SERVER_NAME}" in Claude Code settings`);
  console.log(`Settings file: ${CLAUDE_SETTINGS_PATH}`);
}

export async function removeMcpServer(): Promise<void> {
  try {
    const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(content);

    if (settings.mcpServers && settings.mcpServers[MCP_SERVER_NAME]) {
      delete settings.mcpServers[MCP_SERVER_NAME];
      await fs.writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
      console.log(`Removed MCP server "${MCP_SERVER_NAME}" from Claude Code settings`);
    }
  } catch {
    console.log('No existing configuration to remove');
  }
}

export async function isMcpServerConfigured(): Promise<boolean> {
  try {
    const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(content);
    return !!(settings.mcpServers && settings.mcpServers[MCP_SERVER_NAME]);
  } catch {
    return false;
  }
}

// CLI interface
if (process.argv[1]?.includes('configure-claude')) {
  const action = process.argv[2];
  const serverPath = process.argv[3] || process.cwd();
  const openaiKey = process.env.OPENAI_API_KEY;

  switch (action) {
    case 'add':
      configureMcpServer(serverPath, openaiKey)
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
      break;
    case 'remove':
      removeMcpServer()
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
      break;
    case 'check':
      isMcpServerConfigured()
        .then((configured) => {
          console.log(configured ? 'MCP server is configured' : 'MCP server is not configured');
          process.exit(0);
        })
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
      break;
    default:
      console.log('Usage: configure-claude <add|remove|check> [serverPath]');
      process.exit(1);
  }
}
