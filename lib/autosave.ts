export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveSnapshot {
  value: string;
  status: AutosaveStatus;
  error: string;
}

/** One queue per editing session. Closing uses the same queue as the debounce. */
export class AutosaveController {
  private snapshot: AutosaveSnapshot;
  private savedValue: string;
  private queue: Promise<boolean> = Promise.resolve(true);
  private requestedValue: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();

  constructor(
    initialValue: string,
    private save: (value: string) => Promise<void>,
    private delay = 400,
  ) {
    this.savedValue = initialValue;
    this.snapshot = { value: initialValue, status: 'idle', error: '' };
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<AutosaveSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  change = (value: string) => {
    if (value === this.snapshot.value) return;
    clearTimeout(this.timer);
    this.update({ value, status: 'pending', error: '' });
    this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  };

  flush = async (): Promise<boolean> => {
    clearTimeout(this.timer);
    const value = this.snapshot.value;
    // A pending write must finish even when the user undoes to the saved value.
    if (this.requestedValue === value) {
      const success = await this.queue;
      return success && this.snapshot.value === value;
    }
    if (this.requestedValue === undefined && value === this.savedValue) {
      this.update({ status: 'saved', error: '' });
      return true;
    }

    this.requestedValue = value;
    this.update({ status: 'saving', error: '' });
    const task = this.queue.then(async () => {
      try {
        await this.save(value);
        this.savedValue = value;
        if (this.snapshot.value === value) this.update({ status: 'saved', error: '' });
        return true;
      } catch (reason) {
        if (this.snapshot.value === value) {
          this.update({ status: 'error', error: reason instanceof Error ? reason.message : '自动保存失败' });
        }
        return false;
      } finally {
        if (this.queue === task) this.requestedValue = undefined;
      }
    });
    this.queue = task;
    const success = await task;
    return success && this.snapshot.value === value;
  };
}
