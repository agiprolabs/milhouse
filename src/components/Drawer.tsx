import { useState, useEffect, useCallback, useRef } from 'react';
import TaskList from './TaskList';
import DocsList from './DocsList';

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

interface DrawerProps {
  projectPath: string | null;
  onFetchTasks: () => Promise<TaskEntry[]>;
  onFetchDocuments: () => Promise<DocumentEntry[]>;
  onUpdateTaskStatus: (taskId: string, status: 'pending' | 'in_progress' | 'completed') => Promise<void>;
}

type DrawerTab = 'tasks' | 'docs';

export default function Drawer({
  projectPath,
  onFetchTasks,
  onFetchDocuments,
  onUpdateTaskStatus,
}: DrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>('tasks');
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Load persisted state
  useEffect(() => {
    const savedOpen = localStorage.getItem('drawer-open');
    const savedWidth = localStorage.getItem('drawer-width');
    const savedTab = localStorage.getItem('drawer-tab');

    if (savedOpen !== null) {
      setIsOpen(savedOpen === 'true');
    }
    if (savedWidth !== null) {
      const width = parseInt(savedWidth, 10);
      if (width >= 200 && width <= 500) {
        setDrawerWidth(width);
      }
    }
    if (savedTab === 'tasks' || savedTab === 'docs') {
      setActiveTab(savedTab);
    }
  }, []);

  // Persist state
  useEffect(() => {
    localStorage.setItem('drawer-open', String(isOpen));
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem('drawer-width', String(drawerWidth));
  }, [drawerWidth]);

  useEffect(() => {
    localStorage.setItem('drawer-tab', activeTab);
  }, [activeTab]);

  // Fetch data when drawer opens or project changes
  const fetchData = useCallback(async () => {
    if (!isOpen || !projectPath) return;

    setIsLoading(true);
    try {
      const [tasksData, docsData] = await Promise.all([
        onFetchTasks(),
        onFetchDocuments(),
      ]);
      setTasks(tasksData);
      setDocuments(docsData);
    } catch (error) {
      console.error('Failed to fetch drawer data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, projectPath, onFetchTasks, onFetchDocuments]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keyboard shortcut (Cmd/Ctrl + D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setDrawerWidth(Math.max(200, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleTaskStatusChange = useCallback(
    async (taskId: string, status: 'pending' | 'in_progress' | 'completed') => {
      try {
        await onUpdateTaskStatus(taskId, status);
        // Update local state
        setTasks((prev) =>
          prev.map((task) =>
            task.id === taskId ? { ...task, status } : task
          )
        );
      } catch (error) {
        console.error('Failed to update task status:', error);
      }
    },
    [onUpdateTaskStatus]
  );

  const toggleDrawer = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <>
      {/* Collapsed Tab */}
      {!isOpen && (
        <button
          className="drawer-tab-collapsed"
          onClick={toggleDrawer}
          title="Open drawer (Cmd+D)"
        >
          <span className="drawer-tab-icon">☰</span>
          <span className="drawer-tab-text">Tasks</span>
        </button>
      )}

      {/* Drawer Panel */}
      <div
        ref={drawerRef}
        className={`drawer ${isOpen ? 'open' : ''}`}
        style={{ width: isOpen ? drawerWidth : 0 }}
      >
        {/* Resize Handle */}
        <div
          className="drawer-resize-handle"
          onMouseDown={handleResizeStart}
        />

        <div className="drawer-header">
          <div className="drawer-tabs">
            <button
              className={`drawer-tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
              onClick={() => setActiveTab('tasks')}
            >
              Tasks
              {tasks.filter((t) => t.status !== 'completed').length > 0 && (
                <span className="drawer-badge">
                  {tasks.filter((t) => t.status !== 'completed').length}
                </span>
              )}
            </button>
            <button
              className={`drawer-tab-btn ${activeTab === 'docs' ? 'active' : ''}`}
              onClick={() => setActiveTab('docs')}
            >
              Docs
              {documents.length > 0 && (
                <span className="drawer-badge">{documents.length}</span>
              )}
            </button>
          </div>
          <button
            className="drawer-close-btn"
            onClick={toggleDrawer}
            title="Close drawer (Cmd+D)"
          >
            ×
          </button>
        </div>

        <div className="drawer-content">
          {isLoading ? (
            <div className="drawer-loading">Loading...</div>
          ) : !projectPath ? (
            <div className="drawer-empty">
              <p>Open a project to view tasks and documents</p>
            </div>
          ) : activeTab === 'tasks' ? (
            <TaskList
              tasks={tasks}
              onStatusChange={handleTaskStatusChange}
            />
          ) : (
            <DocsList documents={documents} />
          )}
        </div>

        <div className="drawer-footer">
          <button
            className="drawer-refresh-btn"
            onClick={fetchData}
            disabled={isLoading}
            title="Refresh data"
          >
            ↻ Refresh
          </button>
        </div>
      </div>
    </>
  );
}
