import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import type { TaskAdapter, TaskRecord } from './types.js';
import { isTerminal, validPollInterval } from './types.js';
import { TaskStore } from './store.js';

export class TaskCoordinator {
  constructor(private readonly store: TaskStore, private readonly adapter: TaskAdapter) {}
  async submit(input: unknown): Promise<TaskRecord> {
    // Commit intent before any remote effect. An exception leaves an unknown
    // submission that recovery must never silently resubmit.
    const record = this.store.create(this.adapter.name, input);
    let submitted: Awaited<ReturnType<TaskAdapter['submit']>>;
    try {
      submitted = await this.adapter.submit(input);
      // Persist the known handle independently of potentially invalid payloads.
      this.store.accept(record.id, submitted.remoteId);
    } catch (error) {
      this.store.recordError(record.id, error instanceof Error ? error.message : String(error));
      throw new Error(`Submission outcome unknown for ${record.id}: ${String(error)}`, { cause: error });
    }
    try {
      return submitted.snapshot === null ? this.store.get(record.id) : this.store.observe(record.id, submitted.snapshot);
    } catch (error) {
      return this.store.recordError(record.id, error instanceof Error ? error.message : String(error));
    }
  }

  async refresh(id: string, signal?: AbortSignal): Promise<TaskRecord> {
    const record = this.store.get(id);
    if (record.adapter !== this.adapter.name) throw new Error(`Adapter mismatch: ${record.adapter}`);
    if (record.submission === 'unknown' || !record.remoteId || isTerminal(record.snapshot)) return record;
    try {
      return this.store.observe(id, await this.adapter.query(record.remoteId, signal));
    } catch (error) {
      // Aborting observation is a local lifecycle event, not a new remote error.
      if (signal?.aborted) return this.store.get(id);
      // A network/adapter error is not a remote task failure.
      return this.store.recordError(id, String(error));
    }
  }
  async cancel(id: string): Promise<TaskRecord> {
    const record = this.store.get(id);
    if (record.adapter !== this.adapter.name) throw new Error(`Adapter mismatch: ${record.adapter}`);
    if (isTerminal(record.snapshot)) return record;
    if (record.submission !== 'accepted' || !record.remoteId) throw new Error('Cannot cancel an unknown submission');
    if (!this.adapter.cancel) throw new Error('Adapter does not support cancellation');
    const attemptId = randomUUID();
    const pending = this.store.requestCancellation(id, attemptId);
    if (isTerminal(pending.snapshot)) return pending;
    try {
      await this.adapter.cancel(record.remoteId);
    } catch (error) {
      return this.store.finishCancellation(id, attemptId, String(error));
    }
    // An acknowledgment is not a terminal observation. Recovery only polls;
    // it never replays a cancellation whose response may have been lost.
    return this.store.finishCancellation(id, attemptId, null);
  }
  async respond(id: string, key: string, response: Record<string, unknown>): Promise<TaskRecord> {
    const record = this.store.get(id);
    if (record.adapter !== this.adapter.name) throw new Error(`Adapter mismatch: ${record.adapter}`);
    if (!this.adapter.respond) throw new Error('Adapter does not support input responses');
    // Reservation and duplicate check share a SQLite transaction across processes.
    const pending = this.store.reserveInput(id, key, response);
    try {
      await this.adapter.respond(pending.remoteId!, key, response);
    } catch (error) {
      return this.store.finishInput(id, key, String(error));
    }
    return this.store.finishInput(id, key, null);
  }
  async wait(id: string, intervalMs = 1000, timeoutMs = 60000, interruption?: AbortSignal): Promise<{ reason: 'terminal' | 'input_required' | 'unknown_submission' | 'timeout' | 'interrupted'; task: TaskRecord }> {
    for (const [name, value] of [['interval', intervalMs], ['timeout', timeoutMs]] as const) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 86400000) throw new Error(`${name} must be an integer from 1 to 86400000 ms`);
    }
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = interruption ? AbortSignal.any([deadline, interruption]) : deadline;
    let task = this.store.get(id);
    if (task.adapter !== this.adapter.name) throw new Error(`Adapter mismatch: ${task.adapter}`);
    while (true) {
      if (isTerminal(task.snapshot)) return { reason: 'terminal', task };
      if (task.submission === 'unknown') return { reason: 'unknown_submission', task };
      if (signal.aborted) return { reason: interruption?.aborted && signal.reason === interruption.reason ? 'interrupted' : 'timeout', task };
      task = await this.refresh(id, signal);
      if (isTerminal(task.snapshot)) return { reason: 'terminal', task };
      if (signal.aborted) return { reason: interruption?.aborted && signal.reason === interruption.reason ? 'interrupted' : 'timeout', task };
      if (!task.observationError && task.snapshot?.status === 'input_required') return { reason: 'input_required', task };
      const hint = task.snapshot?.pollIntervalMs;
      // Cap the timer below Node's overflow threshold; the overall deadline is
      // at most one day and will interrupt any longer recommended wait.
      const pollMs = validPollInterval(hint) ? Math.min(86400000, Math.max(intervalMs, hint)) : intervalMs;
      try { await delay(pollMs, undefined, { signal }); }
      catch (error) { if (!signal.aborted) throw error; }
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
