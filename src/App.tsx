import { useState, useEffect } from 'react';
import FileTree from './components/FileTree';
import TerminalPanel from './components/Terminal';
import { useProject } from './hooks/useProject';
import { useClaude } from './hooks/useClaude';
import { useMcp } from './hooks/useMcp';

function App() {
  const { projectPath, projectName, isLoading, selectProject } = useProject();
  const { isClaudeInstalled, isMcpRegistered, projectSettings, initializeProject, updateSettings, getClaudeStartCommand, isInitialized: claudeInitialized, isLoading: claudeLoading } = useClaude(projectPath);
  const { status: mcpStatus, isLoading: mcpLoading, startServer, stopServer, restartServer } = useMcp();
  const [autoStartClaude, setAutoStartClaude] = useState(true);
  const [mcpMenuOpen, setMcpMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ralphEnabled, setRalphEnabled] = useState(false);

  // Initialize Claude settings when project changes (always run to ensure MCP is configured)
  useEffect(() => {
    if (projectPath) {
      initializeProject(projectPath);
    }
  }, [projectPath, initializeProject]);

  // Update autoStartClaude and ralphEnabled from project settings
  useEffect(() => {
    if (projectSettings?.auto_start_claude !== undefined) {
      setAutoStartClaude(projectSettings.auto_start_claude);
    }
    if (projectSettings?.ralph_wiggum_enabled !== undefined) {
      setRalphEnabled(projectSettings.ralph_wiggum_enabled);
    }
  }, [projectSettings]);

  // Debug logging
  useEffect(() => {
    console.log('[App] State:', {
      projectPath,
      isClaudeInstalled,
      autoStartClaude,
      ralphEnabled,
      claudeStartCommand: getClaudeStartCommand(ralphEnabled),
      claudeInitialized,
      claudeLoading,
      isLoading
    });
  }, [projectPath, isClaudeInstalled, autoStartClaude, ralphEnabled, getClaudeStartCommand, claudeInitialized, claudeLoading, isLoading]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [editorHeight, setEditorHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (path: string, content: string) => {
    setSelectedFile(path);
    setFileContent(content);
    if (editorHeight === 0) {
      setEditorHeight(300);
    }
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const newHeight = e.clientY - 50;
    setEditorHeight(Math.max(0, Math.min(newHeight, window.innerHeight - 150)));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const closeEditor = () => {
    setSelectedFile('');
    setFileContent('');
    setEditorHeight(0);
  };

  return (
    <div
      className="app"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="project-info" onClick={selectProject} title="Click to change project">
            <span className="project-name">{projectName || 'Select Project'}</span>
            <span className="project-change-hint">▾</span>
          </div>
          <div className="mcp-status">
            <span className={`mcp-indicator ${mcpStatus.running ? 'running' : 'stopped'}`} />
            <span className="mcp-label">MCP {mcpLoading ? '...' : mcpStatus.running ? 'Running' : 'Stopped'}</span>
            <div className="dropdown-container">
              <button
                className="menu-btn"
                onClick={() => setMcpMenuOpen(!mcpMenuOpen)}
                title="MCP Options"
              >
                ⋮
              </button>
              {mcpMenuOpen && (
                <div className="dropdown-menu" onMouseLeave={() => setMcpMenuOpen(false)}>
                  {mcpStatus.running ? (
                    <button onClick={() => { stopServer(); setMcpMenuOpen(false); }} disabled={mcpLoading}>
                      Stop
                    </button>
                  ) : (
                    <button onClick={() => { startServer(); setMcpMenuOpen(false); }} disabled={mcpLoading}>
                      Start
                    </button>
                  )}
                  <button onClick={() => { restartServer(); setMcpMenuOpen(false); }} disabled={mcpLoading}>
                    Restart
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {isLoading ? (
          <div className="loading-indicator">Loading...</div>
        ) : (
          <FileTree
            onFileSelect={handleFileSelect}
            projectRoot={projectPath}
            showHidden={false}
          />
        )}

        <div className="sidebar-footer">
          <button className="settings-btn" onClick={() => setSettingsOpen(!settingsOpen)}>
            ⚙ Settings
          </button>
        </div>

        {settingsOpen && (
          <div className="settings-panel">
            <div className="settings-header">
              <h3>Settings</h3>
              <button className="close-btn" onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            <div className="settings-section">
              <h4>Claude Code</h4>
              <div className="settings-row">
                <label>
                  <input
                    type="checkbox"
                    checked={autoStartClaude}
                    onChange={(e) => {
                      setAutoStartClaude(e.target.checked);
                      if (projectPath && projectSettings) {
                        updateSettings(projectPath, {
                          ...projectSettings,
                          auto_start_claude: e.target.checked,
                        });
                      }
                    }}
                  />
                  Auto-start Claude in terminal
                </label>
              </div>
              <div className="settings-info">
                {isClaudeInstalled ? (
                  <span className="status-ok">✓ Claude CLI installed</span>
                ) : (
                  <span className="status-warn">⚠ Claude CLI not found</span>
                )}
              </div>
            </div>

            <div className="settings-section">
              <h4>Ralph-Wiggum Mode</h4>
              <div className="settings-row">
                <label>
                  <input
                    type="checkbox"
                    checked={ralphEnabled}
                    onChange={(e) => {
                      setRalphEnabled(e.target.checked);
                      if (projectPath && projectSettings) {
                        updateSettings(projectPath, {
                          ...projectSettings,
                          ralph_wiggum_enabled: e.target.checked,
                        });
                      }
                    }}
                  />
                  Enable autonomous mode
                </label>
              </div>
              <p className="settings-desc">
                When enabled, Claude bypasses all permission checks and can autonomously execute tasks, make decisions, and iterate on solutions.
              </p>
              {ralphEnabled && (
                <div className="settings-warning">
                  ⚠ Autonomous mode uses --dangerously-skip-permissions. Use with caution in trusted environments only.
                </div>
              )}
            </div>

            <div className="settings-section">
              <h4>Milhouse Memory</h4>
              <div className="settings-info">
                {isMcpRegistered ? (
                  <span className="status-ok">✓ Memory system active</span>
                ) : (
                  <span className="status-warn">⚠ Memory not configured</span>
                )}
              </div>
              <p className="settings-desc">
                Claude has access to persistent memory via the Milhouse MCP server. Past conversations, decisions, and code context are automatically indexed and searchable.
              </p>
              {projectSettings?.append_system_prompt && (
                <details className="system-prompt-details">
                  <summary>View injected system prompt</summary>
                  <pre className="system-prompt-preview">
                    {projectSettings.append_system_prompt.substring(0, 500)}...
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="main-area">
        {editorHeight > 0 && selectedFile && (
          <>
            <div className="editor-area" style={{ height: editorHeight }}>
              <div className="file-header">
                <span className="file-path">{selectedFile}</span>
                <button className="close-editor-btn" onClick={closeEditor}>×</button>
              </div>
              <div className="file-viewer">
                <pre><code>{fileContent}</code></pre>
              </div>
            </div>
            <div
              className="resize-handle"
              onMouseDown={handleMouseDown}
            />
          </>
        )}

        <div className="terminal-area" style={{ flex: 1 }}>
          <TerminalPanel
            projectPath={projectPath}
            autoStartClaude={isClaudeInstalled && autoStartClaude}
            claudeStartCommand={getClaudeStartCommand(ralphEnabled)}
            isLoading={isLoading || claudeLoading || !claudeInitialized}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
