import { useState, useCallback, memo } from 'react';
import type { TaskEntry } from './Drawer';

interface TaskListProps {
  tasks: TaskEntry[];
  onStatusChange: (taskId: string, status: 'pending' | 'in_progress' | 'completed') => void;
}

interface TaskItemProps {
  task: TaskEntry;
  onStatusChange: (taskId: string, status: 'pending' | 'in_progress' | 'completed') => void;
}

const TaskItem = memo(function TaskItem({ task, onStatusChange }: TaskItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCheckboxChange = useCallback(() => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    onStatusChange(task.id, newStatus);
  }, [task.id, task.status, onStatusChange]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const priorityColors: Record<string, string> = {
    low: '#51cf66',
    medium: '#ffd43b',
    high: '#ff6b6b',
  };

  return (
    <div className={`task-item ${task.status}`}>
      <div className="task-item-header">
        <input
          type="checkbox"
          checked={task.status === 'completed'}
          onChange={handleCheckboxChange}
          className="task-checkbox"
        />
        <span
          className="task-priority"
          style={{ backgroundColor: priorityColors[task.priority] || priorityColors.medium }}
          title={`${task.priority} priority`}
        />
        <span
          className={`task-title ${task.status === 'completed' ? 'completed' : ''}`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {task.title}
        </span>
        <span className="task-time">{formatTime(task.timestamp)}</span>
      </div>

      {isExpanded && task.content && (
        <div className="task-content">
          <p>{task.content}</p>
          {task.tags.length > 0 && (
            <div className="task-tags">
              {task.tags.map((tag) => (
                <span key={tag} className="task-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default function TaskList({ tasks, onStatusChange }: TaskListProps) {
  // Group tasks by status
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress');
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  if (tasks.length === 0) {
    return (
      <div className="task-list-empty">
        <p>No tasks yet</p>
        <p className="task-list-hint">
          Claude can create tasks using the create_task MCP tool
        </p>
      </div>
    );
  }

  return (
    <div className="task-list">
      {inProgressTasks.length > 0 && (
        <div className="task-group">
          <h4 className="task-group-title">In Progress</h4>
          {inProgressTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}

      {pendingTasks.length > 0 && (
        <div className="task-group">
          <h4 className="task-group-title">Pending</h4>
          {pendingTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}

      {completedTasks.length > 0 && (
        <div className="task-group">
          <h4 className="task-group-title">Completed</h4>
          {completedTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
