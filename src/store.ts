import { assertJsonValue } from './json.js';
import { validateInputResponse } from './input.js';
import { failureDetails } from './errors.js';
import type { FailureDetails } from './errors.js';
import { assertSnapshot } from './snapshot.js';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { isTerminal } from './types.js';
import type { Snapshot, TaskRecord } from './types.js';

export class TaskStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        record TEXT NOT NULL
      );
    `);
  }
  close(): void { this.db.close(); }
  create(adapter: string, input: unknown): TaskRecord {
    assertJsonValue(input, 'Task input');
    const now = new Date().toISOString();
    const record: TaskRecord = {
      id: randomUUID(), adapter, input, remoteId: null, submission: 'unknown',
      snapshot: null, observationError: null, createdAt: now, updatedAt: now,
    };
    this.db.prepare('INSERT INTO tasks (id, record) VALUES (?, ?)').run(record.id, JSON.stringify(record));
    return record;
  }
  get(id: string): TaskRecord {
    const row = this.db.prepare('SELECT record FROM tasks WHERE id = ?').get(id);
    if (!row) throw new Error(`Task not found: ${id}`);
    return JSON.parse(row.record as string) as TaskRecord;
  }
  list(): TaskRecord[] {
    return this.db.prepare('SELECT record FROM tasks ORDER BY rowid').all()
      .map(row => JSON.parse(row.record as string) as TaskRecord);
  }
  private change(id: string, update: (record: TaskRecord) => void | false): TaskRecord {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const record = this.get(id);
      if (update(record) === false) {
        this.db.exec('COMMIT');
        return record;
      }
      record.updatedAt = new Date().toISOString();
      assertJsonValue(record, 'Task record');
      this.db.prepare('UPDATE tasks SET record = ? WHERE id = ?').run(JSON.stringify(record), id);
      this.db.exec('COMMIT');
      return record;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  accept(id: string, remoteId: string, snapshot: Snapshot | null = null): TaskRecord {
    const accepted = this.change(id, record => {
      if (record.submission !== 'unknown') throw new Error('Task already accepted');
      if (typeof remoteId !== 'string' || !remoteId) throw new Error('Adapter returned an invalid task handle');
      record.remoteId = remoteId;
      record.submission = 'accepted';
      record.snapshot = null;
      record.observationError = null;
      delete record.observationErrorDetails;
    });
    // Commit the handle even if the adapter's optional initial state is invalid.
    if (snapshot === null) return accepted;
    try { return this.observe(id, snapshot); }
    catch (error) { return this.recordError(id, error instanceof Error ? error.message : String(error), failureDetails(error)); }
  }
  observe(id: string, snapshot: Snapshot): TaskRecord {
    return this.change(id, record => {
      // Never overwrite a settled result with a late poll from another CLI process.
      if (isTerminal(record.snapshot)) return false;
      assertSnapshot(snapshot);
      record.snapshot = snapshot;
      record.observationError = null;
      delete record.observationErrorDetails;
    });
  }
  requestCancellation(id: string, attemptId: string): TaskRecord {
    return this.change(id, record => {
      if (isTerminal(record.snapshot)) return false;
      if (record.submission !== 'accepted' || !record.remoteId) throw new Error('Cannot cancel an unknown submission');
      record.cancellation = { attemptId, requestedAt: new Date().toISOString(), outcome: 'pending', error: null };
    });
  }
  finishCancellation(id: string, attemptId: string, error: string | null, details?: FailureDetails): TaskRecord {
    return this.change(id, record => {
      if (record.cancellation?.attemptId !== attemptId) return false;
      record.cancellation.outcome = error === null ? 'acknowledged' : 'unknown';
      record.cancellation.error = error;
      if (details) record.cancellation.errorDetails = details;
      else delete record.cancellation.errorDetails;
    });
  }
  reserveInput(id: string, key: string, response: Record<string, unknown>, attemptId = randomUUID(), rejectedAttemptId?: string): TaskRecord {
    assertJsonValue(response, 'Input response');
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Input response must be an object');
    return this.change(id, record => {
      if (record.submission !== 'accepted' || !record.remoteId || record.snapshot?.status !== 'input_required'
        || !Object.hasOwn(record.snapshot.inputRequests ?? {}, key)) throw new Error('Request key is not outstanding');
      const attempts = record.inputResponses?.filter(item => item.key === key) ?? [];
      if (attempts.some(item => item.outcome !== 'rejected' || !item.rejectionEvidence)) throw new Error('Response already attempted; delivery cannot be safely replayed');
      const last = attempts.at(-1);
      if (last && (!last.attemptId || last.attemptId !== rejectedAttemptId)) throw new Error('Rejected response changed; refresh before correction');
      if (record.observationError) throw new Error('Cannot verify outstanding input after an observation failure');
      validateInputResponse(record.snapshot.inputRequests![key]!, response);
      (record.inputResponses ??= []).push({ key, attemptId, response, outcome: 'pending', error: null });
    });
  }
  finishInput(id: string, key: string, attemptId: string, details: FailureDetails | null, rejectionEvidence?: string): TaskRecord {
    return this.change(id, record => {
      const attempt = record.inputResponses?.find(item => item.key === key && item.attemptId === attemptId);
      if (!attempt || attempt.outcome !== 'pending') return false;
      attempt.outcome = details === null ? 'acknowledged' : rejectionEvidence ? 'rejected' : 'unknown';
      attempt.error = details?.message ?? null;
      if (details) attempt.errorDetails = details;
      if (rejectionEvidence) attempt.rejectionEvidence = rejectionEvidence;
    });
  }
  recordError(id: string, message: string, details?: FailureDetails): TaskRecord {
    return this.change(id, record => {
      // Another observer may have settled the task while this query was in flight.
      if (isTerminal(record.snapshot)) return false;
      record.observationError = message;
      if (details) record.observationErrorDetails = details;
      else delete record.observationErrorDetails;
    });
  }
}
