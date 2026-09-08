import type { TaskAdapter, TaskRecord } from './types.js';
import { isTerminal } from './types.js';
import { TaskStore } from './store.js';

export class TaskCoordinator {
  constructor(private readonly store: TaskStore, private readonly adapter: TaskAdapter) {}
  async submit(input: unknown): Promise<TaskRecord> {
    // Commit intent before any remote effect. An exception leaves an unknown
    // submission that recovery must never silently resubmit.
    const record = this.store.create(this.adapter.name, input);
    try {
      const submitted = await this.adapter.submit(input);
      return this.store.accept(record.id, submitted.remoteId, submitted.snapshot);
    } catch (error) {
      this.store.recordError(record.id, error instanceof Error ? error.message : String(error));
      throw new Error(`Submission outcome unknown for ${record.id}: ${String(error)}`, { cause: error });
    }
  }
  async refresh(id: string): Promise<TaskRecord> {
    const record = this.store.get(id);
    if (record.adapter !== this.adapter.name) throw new Error(`Adapter mismatch: ${record.adapter}`);
    if (record.submission === 'unknown' || !record.remoteId || isTerminal(record.snapshot)) return record;
    try {
      return this.store.observe(id, await this.adapter.query(record.remoteId));
    } catch (error) {
      // A network/adapter error is not a remote task failure.
      return this.store.recordError(id, String(error));
    }
  }
  async recover(): Promise<TaskRecord[]> {
    const results: TaskRecord[] = [];
    for (const record of this.store.list()) {
      if (record.adapter === this.adapter.name && !isTerminal(record.snapshot)) {
        results.push(await this.refresh(record.id));
      }
    }
    return results;
  }
}
