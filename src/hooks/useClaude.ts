import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ClaudeProjectSettings {
  mcp_servers?: Record<string, McpServerConfig>;
  model?: string;
  auto_start_claude?: boolean;
  ralph_wiggum_enabled?: boolean;
  append_system_prompt?: string;
}

interface UseClaudeReturn {
  isClaudeInstalled: boolean;
  isMcpRegistered: boolean;
  projectSettings: ClaudeProjectSettings | null;
  isLoading: boolean;
  isInitialized: boolean;
  initializeProject: (projectPath: string) => Promise<void>;
  updateSettings: (projectPath: string, settings: ClaudeProjectSettings) => Promise<void>;
  getClaudeStartCommand: (ralphWiggumEnabled?: boolean) => string;
}

export function useClaude(projectPath: string | null): UseClaudeReturn {
  const [isClaudeInstalled, setIsClaudeInstalled] = useState(false);
  const [isMcpRegistered, setIsMcpRegistered] = useState(false);
  const [projectSettings, setProjectSettings] = useState<ClaudeProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    async function checkClaude() {
      try {
        const installed = await invoke<boolean>('check_claude_installed');
        setIsClaudeInstalled(installed);
      } catch {
        setIsClaudeInstalled(false);
      }
    }
    checkClaude();
  }, []);

  useEffect(() => {
    async function loadSettings() {
      if (!projectPath) {
        setProjectSettings(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const settings = await invoke<ClaudeProjectSettings>('get_claude_project_settings', {
          projectPath,
        });
        setProjectSettings(settings);
      } catch {
        setProjectSettings(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [projectPath]);

  const initializeProject = useCallback(async (path: string) => {
    setIsInitialized(false);
    setIsLoading(true);
    try {
      const mcpPath = await invoke<string>('get_mcp_server_path');
      console.log('Initializing Claude with MCP path:', mcpPath);
      const settings = await invoke<ClaudeProjectSettings>('initialize_project_claude', {
        projectPath: path,
        mcpServerPath: mcpPath,
      });
      console.log('Claude settings initialized:', settings);
      setProjectSettings(settings);
      setIsInitialized(true);

      // Check if MCP was successfully registered
      const mcpRegistered = await invoke<boolean>('check_mcp_registered', { projectPath: path });
      console.log('MCP registered:', mcpRegistered);
      setIsMcpRegistered(mcpRegistered);
    } catch (err) {
      console.error('Failed to initialize project Claude settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (path: string, settings: ClaudeProjectSettings) => {
    try {
      await invoke('save_claude_project_settings', {
        projectPath: path,
        settings,
      });
      setProjectSettings(settings);
    } catch (err) {
      console.error('Failed to save Claude settings:', err);
    }
  }, []);

  const getClaudeStartCommand = useCallback((ralphWiggumEnabled: boolean = false) => {
    // Build the claude command with appropriate flags
    if (ralphWiggumEnabled) {
      // Ralph-Wiggum mode: bypass all permission checks for autonomous operation
      return `claude --dangerously-skip-permissions`;
    }
    return `claude`;
  }, []);

  return {
    isClaudeInstalled,
    isMcpRegistered,
    projectSettings,
    isLoading,
    isInitialized,
    initializeProject,
    updateSettings,
    getClaudeStartCommand,
  };
}
