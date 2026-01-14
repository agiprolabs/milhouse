import { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_hidden: boolean;
}

interface FileTreeProps {
  onFileSelect: (path: string, content: string) => void;
  projectRoot: string | null;
  showHidden?: boolean;
}

interface FolderNodeProps {
  entry: FileEntry;
  onFileSelect: (path: string, content: string) => void;
  showHidden: boolean;
  level: number;
}

const getFileIcon = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '🔷';
    case 'js':
    case 'jsx':
      return '🟨';
    case 'rs':
      return '🦀';
    case 'json':
      return '📋';
    case 'md':
      return '📝';
    case 'css':
      return '🎨';
    case 'html':
      return '🌐';
    case 'toml':
    case 'yaml':
    case 'yml':
      return '⚙️';
    case 'lock':
      return '🔒';
    default:
      return '📄';
  }
};

const FolderNode = memo(function FolderNode({ entry, onFileSelect, showHidden, level }: FolderNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleFolder = useCallback(async () => {
    if (!isOpen && children.length === 0) {
      setLoading(true);
      try {
        const entries = await invoke<FileEntry[]>('read_directory', { path: entry.path });
        setChildren(entries);
      } catch (err) {
        console.error('Failed to read directory:', err);
      }
      setLoading(false);
    }
    setIsOpen(prev => !prev);
  }, [isOpen, children.length, entry.path]);

  const filteredChildren = useMemo(() => {
    if (showHidden) return children;
    // Always show .claude folder even when hiding dotfiles
    return children.filter(c => !c.is_hidden || c.name === '.claude');
  }, [children, showHidden]);

  const style = useMemo(() => ({ paddingLeft: `${level * 16}px` }), [level]);

  return (
    <div className="folder-node">
      <div className="tree-item folder" style={style} onClick={toggleFolder}>
        <span className="icon">{isOpen ? '▼' : '▶'}</span>
        <span className="name">{entry.name}</span>
        {loading && <span className="loading">...</span>}
      </div>
      {isOpen && (
        <div className="folder-children">
          {filteredChildren.map((child) => (
            child.is_dir ? (
              <FolderNode
                key={child.path}
                entry={child}
                onFileSelect={onFileSelect}
                showHidden={showHidden}
                level={level + 1}
              />
            ) : (
              <FileNode
                key={child.path}
                entry={child}
                onFileSelect={onFileSelect}
                level={level + 1}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
});

interface FileNodeProps {
  entry: FileEntry;
  onFileSelect: (path: string, content: string) => void;
  level: number;
}

const FileNode = memo(function FileNode({ entry, onFileSelect, level }: FileNodeProps) {
  const handleClick = useCallback(async () => {
    try {
      const content = await invoke<string>('read_file', { path: entry.path });
      onFileSelect(entry.path, content);
    } catch (err) {
      console.error('Failed to read file:', err);
    }
  }, [entry.path, onFileSelect]);

  const style = useMemo(() => ({ paddingLeft: `${level * 16}px` }), [level]);
  const icon = useMemo(() => getFileIcon(entry.name), [entry.name]);

  return (
    <div className="tree-item file" style={style} onClick={handleClick}>
      <span className="icon">{icon}</span>
      <span className="name">{entry.name}</span>
    </div>
  );
});

export default function FileTree({ onFileSelect, projectRoot, showHidden = false }: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (projectRoot) {
      loadDirectory(projectRoot);
    } else {
      setEntries([]);
    }
  }, [projectRoot]);

  const loadDirectory = async (path: string) => {
    try {
      const entries = await invoke<FileEntry[]>('read_directory', { path });
      setEntries(entries);
      setError('');
    } catch (err) {
      setError(`Failed to load directory: ${err}`);
    }
  };

  const filteredEntries = showHidden
    ? entries
    : entries.filter(e => !e.is_hidden || e.name === '.claude');

  if (!projectRoot) {
    return (
      <div className="file-tree">
        <div className="no-project">
          <p>No project selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="file-tree">
      {error && <div className="error">{error}</div>}

      <div className="file-tree-content">
        {filteredEntries.map((entry) => (
          entry.is_dir ? (
            <FolderNode
              key={entry.path}
              entry={entry}
              onFileSelect={onFileSelect}
              showHidden={showHidden}
              level={0}
            />
          ) : (
            <FileNode
              key={entry.path}
              entry={entry}
              onFileSelect={onFileSelect}
              level={0}
            />
          )
        ))}
      </div>
    </div>
  );
}
