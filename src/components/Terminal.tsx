import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

interface TerminalTab {
  id: string;
  title: string;
  initialized: boolean;
}

interface TerminalOutput {
  id: string;
  data: string;
}

// Tab component with rename support
const TerminalTabItem = memo(function TerminalTabItem({
  tab,
  isActive,
  onSelect,
  onClose,
  onRename,
}: {
  tab: TerminalTab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (newTitle: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(tab.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(tab.title);
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editValue.trim() && editValue !== tab.title) {
      onRename(editValue.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(tab.title);
    }
  };

  return (
    <div
      className={`terminal-tab ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          className="tab-title-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="tab-title">{tab.title}</span>
      )}
      <button
        className="tab-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
});

interface TerminalPanelProps {
  projectPath?: string | null;
  autoStartClaude?: boolean;
  claudeStartCommand?: string;
  isLoading?: boolean;
}

export default function TerminalPanel({ projectPath, autoStartClaude = false, claudeStartCommand = 'claude', isLoading = false }: TerminalPanelProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const terminalRefs = useRef<Map<string, { xterm: XTerm; fitAddon: FitAddon }>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasCreatedInitialTerminal = useRef(false);
  const lastProjectPath = useRef<string | null | undefined>(null);
  const lastClaudeStartCommand = useRef<string>(claudeStartCommand);
  const claudeTerminalId = useRef<string | null>(null);
  const lastResizeTime = useRef<number>(0);
  const resizeCooldown = 500; // Minimum ms between resize operations

  // Handle Claude start command changes (e.g., Ralph-Wiggum mode toggle) - restart Claude terminal
  useEffect(() => {
    if (lastClaudeStartCommand.current !== claudeStartCommand && claudeTerminalId.current && autoStartClaude) {
      console.log('[Terminal] Claude command changed, restarting Claude terminal:', {
        from: lastClaudeStartCommand.current,
        to: claudeStartCommand
      });

      // Close the existing Claude terminal
      const oldId = claudeTerminalId.current;
      invoke('kill_terminal', { id: oldId }).catch(console.error);
      const terminal = terminalRefs.current.get(oldId);
      if (terminal) {
        terminal.xterm.dispose();
        terminalRefs.current.delete(oldId);
      }
      setTabs((prev) => prev.filter((t) => t.id !== oldId));

      // Create new terminal with updated command
      createNewTerminal(projectPath || undefined, claudeStartCommand);
    }
    lastClaudeStartCommand.current = claudeStartCommand;
  }, [claudeStartCommand, autoStartClaude, projectPath]);

  // Handle project changes - close all terminals and reset
  useEffect(() => {
    if (projectPath !== lastProjectPath.current) {
      if (lastProjectPath.current !== null) {
        console.log('[Terminal] Project changed, resetting terminals');
        // Close all existing terminals
        terminalRefs.current.forEach((terminal, id) => {
          invoke('kill_terminal', { id }).catch(console.error);
          terminal.xterm.dispose();
        });
        terminalRefs.current.clear();
        setTabs([]);
        setActiveTab(null);
        hasCreatedInitialTerminal.current = false;
        claudeTerminalId.current = null;
      }
      lastProjectPath.current = projectPath;
    }
  }, [projectPath]);

  // Debounced fit function - with cooldown to prevent rapid resizing
  const debouncedFit = useCallback((id: string) => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    resizeTimeoutRef.current = setTimeout(() => {
      const now = Date.now();
      const timeSinceLastResize = now - lastResizeTime.current;

      // Skip if we recently resized
      if (timeSinceLastResize < resizeCooldown) {
        return;
      }

      const terminal = terminalRefs.current.get(id);
      if (terminal) {
        try {
          // Only fit if dimensions would actually change
          const dims = terminal.fitAddon.proposeDimensions();
          if (dims && (dims.cols !== terminal.xterm.cols || dims.rows !== terminal.xterm.rows)) {
            terminal.fitAddon.fit();
          }
        } catch (e) {
          // Ignore fit errors during transitions
        }
      }
    }, 200);  // Increased to 200ms
  }, []);

  // Set up event listeners only once
  useEffect(() => {
    // Listen for terminal output - write directly without buffering
    const unlisten = listen<TerminalOutput>('terminal-output', (event) => {
      const { id, data } = event.payload;
      const terminal = terminalRefs.current.get(id);
      if (terminal && data) {
        terminal.xterm.write(data);
      }
    });

    // Listen for terminal exit
    const unlistenExit = listen<string>('terminal-exit', (event) => {
      const id = event.payload;
      handleCloseTab(id);
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []); // Empty deps - only run once

  // Auto-create first terminal (separate effect to avoid re-subscribing listeners)
  useEffect(() => {
    console.log('[Terminal] Effect check:', {
      hasCreated: hasCreatedInitialTerminal.current,
      isLoading,
      projectPath,
      autoStartClaude,
      claudeStartCommand
    });
    if (!hasCreatedInitialTerminal.current && !isLoading && projectPath) {
      hasCreatedInitialTerminal.current = true;
      // If we have a project and autoStartClaude is enabled, start claude with the configured command
      const startupCmd = autoStartClaude ? claudeStartCommand : undefined;
      console.log('[Terminal] Creating terminal with:', { projectPath, autoStartClaude, claudeStartCommand, startupCmd });
      createNewTerminal(projectPath, startupCmd);
    }
  }, [projectPath, autoStartClaude, claudeStartCommand, isLoading]);

  // Initialize terminals after DOM renders
  useEffect(() => {
    tabs.forEach((tab) => {
      if (!tab.initialized && !terminalRefs.current.has(tab.id)) {
        const container = document.getElementById(`terminal-${tab.id}`);
        if (container) {
          initializeTerminal(tab.id);
          setTabs((prev) =>
            prev.map((t) => (t.id === tab.id ? { ...t, initialized: true } : t))
          );
        }
      }
    });
  }, [tabs]);

  useEffect(() => {
    if (activeTab) {
      debouncedFit(activeTab);
    }
  }, [activeTab, debouncedFit]);

  const createNewTerminal = async (cwd?: string, startupCommand?: string) => {
    try {
      const id = await invoke<string>('create_terminal', {
        cwd: cwd || projectPath || null,
        startupCommand: startupCommand || null,
      });
      const tabNumber = tabs.length + 1;

      // Name the tab based on whether it's running Claude
      const isClaudeTerminal = startupCommand?.startsWith('claude');
      const title = isClaudeTerminal
        ? (startupCommand?.includes('--dangerously-skip-permissions') ? 'Claude (Ralph)' : 'Claude Code')
        : `Terminal ${tabNumber}`;

      // Track Claude terminal ID for restart functionality
      if (isClaudeTerminal) {
        claudeTerminalId.current = id;
      }

      setTabs((prev) => [...prev, { id, title, initialized: false }]);
      setActiveTab(id);
    } catch (err) {
      console.error('Failed to create terminal:', err);
    }
  };

  const initializeTerminal = (id: string) => {
    const container = document.getElementById(`terminal-${id}`);
    if (!container) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
      allowProposedApi: true,
      scrollback: 10000,
      altClickMovesCursor: true,
      theme: {
        background: '#1a1a2e',
        foreground: '#eaeaea',
        cursor: '#3282b8',
        cursorAccent: '#1a1a2e',
        selectionBackground: '#3282b8',
        black: '#1a1a2e',
        red: '#ff6b6b',
        green: '#69db7c',
        yellow: '#ffd43b',
        blue: '#3282b8',
        magenta: '#da77f2',
        cyan: '#66d9e8',
        white: '#eaeaea',
        brightBlack: '#495057',
        brightRed: '#ff8787',
        brightGreen: '#8ce99a',
        brightYellow: '#ffe066',
        brightBlue: '#4dabf7',
        brightMagenta: '#e599f7',
        brightCyan: '#99e9f2',
        brightWhite: '#f8f9fa',
      },
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(container);

    // Try to load WebGL addon for better performance
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      xterm.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon not supported, using canvas renderer');
    }

    // Delay the initial fit to allow terminal to stabilize
    setTimeout(() => {
      fitAddon.fit();
    }, 100);

    // Handle input
    xterm.onData((data) => {
      invoke('write_terminal', { id, data }).catch(console.error);
    });

    // Track if we've done initial resize
    let initialResizeDone = false;

    // Only resize once after terminal is stable - disable continuous resize to prevent spacing issues
    const doInitialResize = () => {
      if (!initialResizeDone) {
        initialResizeDone = true;
        invoke('resize_terminal', {
          id,
          rows: xterm.rows,
          cols: xterm.cols,
        }).catch(console.error);
      }
    };

    // Do initial resize after a delay
    setTimeout(doInitialResize, 500);

    terminalRefs.current.set(id, { xterm, fitAddon });

    // Focus the terminal
    xterm.focus();
  };

  const handleCloseTab = async (id: string) => {
    try {
      await invoke('kill_terminal', { id });
    } catch {
      // Terminal might already be dead
    }

    // Clear Claude terminal ID if this was the Claude terminal
    if (claudeTerminalId.current === id) {
      claudeTerminalId.current = null;
    }

    const terminal = terminalRefs.current.get(id);
    if (terminal) {
      terminal.xterm.dispose();
      terminalRefs.current.delete(id);
    }

    setTabs((prev) => prev.filter((t) => t.id !== id));
    setActiveTab((prev) => {
      if (prev === id) {
        const remaining = tabs.filter((t) => t.id !== id);
        return remaining.length > 0 ? remaining[0].id : null;
      }
      return prev;
    });
  };

  const handleRenameTab = useCallback((id: string, newTitle: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: newTitle } : t))
    );
  }, []);

  // Handle window resize - debouncedFit already has debouncing, so just call it directly
  useEffect(() => {
    const handleResize = () => {
      if (activeTab) {
        debouncedFit(activeTab);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab, debouncedFit]);

  return (
    <div className="terminal-panel" ref={containerRef}>
      <div className="terminal-tabs">
        {tabs.map((tab) => (
          <TerminalTabItem
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => handleCloseTab(tab.id)}
            onRename={(newTitle) => handleRenameTab(tab.id, newTitle)}
          />
        ))}
        <button className="new-terminal-btn" onClick={() => createNewTerminal()}>
          +
        </button>
      </div>

      <div className="terminal-content">
        {tabs.length === 0 ? (
          <div className="no-terminal">
            <p>No terminal open</p>
            <button onClick={() => createNewTerminal()}>Create Terminal</button>
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.id}
              id={`terminal-${tab.id}`}
              className={`terminal-container ${activeTab === tab.id ? 'active' : ''}`}
            />
          ))
        )}
      </div>
    </div>
  );
}
