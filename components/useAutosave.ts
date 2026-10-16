import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AutosaveController } from '../lib/autosave';

/** Mount with a key for the record ID to keep drafts and save queues isolated. */
export function useAutosave(initialValue: string, onSave: (value: string) => Promise<void>) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [controller] = useState(() => new AutosaveController(initialValue, (value) => onSaveRef.current(value)));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    const flush = () => { void controller.flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [controller]);

  return { ...snapshot, change: controller.change, flush: controller.flush };
}
