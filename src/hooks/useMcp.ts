import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface McpStatus {
  running: boolean;
  pid: number | null;
}

interface UseMcpReturn {
  status: McpStatus;
  isLoading: boolean;
  error: string | null;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  restartServer: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useMcp(): UseMcpReturn {
  const [status, setStatus] = useState<McpStatus>({ running: false, pid: null });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const result = await invoke<McpStatus>('get_mcp_status');
      setStatus(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Auto-start MCP server on mount and check status periodically
  useEffect(() => {
    const initMcp = async () => {
      const currentStatus = await invoke<McpStatus>('get_mcp_status');
      setStatus(currentStatus);

      // Auto-start if not running
      if (!currentStatus.running) {
        try {
          const result = await invoke<McpStatus>('start_mcp_server');
          setStatus(result);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    initMcp();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const startServer = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<McpStatus>('start_mcp_server');
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopServer = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<McpStatus>('stop_mcp_server');
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const restartServer = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await invoke<McpStatus>('stop_mcp_server');
      const result = await invoke<McpStatus>('start_mcp_server');
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    status,
    isLoading,
    error,
    startServer,
    stopServer,
    restartServer,
    refreshStatus,
  };
}
