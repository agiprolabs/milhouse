import { useState, useEffect, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Store } from '@tauri-apps/plugin-store';

const STORE_PATH = 'settings.json';
const PROJECT_KEY = 'projectPath';

interface UseProjectReturn {
  projectPath: string | null;
  projectName: string | null;
  isLoading: boolean;
  selectProject: () => Promise<void>;
  clearProject: () => Promise<void>;
}

export function useProject(): UseProjectReturn {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [store, setStore] = useState<Store | null>(null);

  // Initialize store and load saved project
  useEffect(() => {
    async function init() {
      try {
        const s = await Store.load(STORE_PATH);
        setStore(s);

        const savedPath = await s.get<string>(PROJECT_KEY);
        if (savedPath) {
          setProjectPath(savedPath);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const selectProject = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      });

      if (selected && typeof selected === 'string') {
        setProjectPath(selected);
        if (store) {
          await store.set(PROJECT_KEY, selected);
          await store.save();
        }
      }
    } catch (err) {
      console.error('Failed to select project:', err);
    }
  }, [store]);

  const clearProject = useCallback(async () => {
    setProjectPath(null);
    if (store) {
      await store.delete(PROJECT_KEY);
      await store.save();
    }
  }, [store]);

  const projectName = projectPath ? projectPath.split('/').pop() || null : null;

  return {
    projectPath,
    projectName,
    isLoading,
    selectProject,
    clearProject,
  };
}
