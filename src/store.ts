import { assertJsonValue } from './json.js';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
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
    return this.change(id, record => {
      if (record.submission !== 'unknown') throw new Error('Task already accepted');
      if (typeof remoteId !== 'string' || !remoteId) throw new Error('Adapter returned an invalid task handle');
      record.remoteId = remoteId;
      record.submission = 'accepted';
      record.snapshot = snapshot;
      record.observationError = null;
    });
  }
  observe(id: string, snapshot: Snapshot): TaskRecord {
    return this.change(id, record => {
      // Never overwrite a settled result with a late poll from another CLI process.
      if (record.snapshot && ['completed', 'failed', 'cancelled'].includes(record.snapshot.status)) return false;
      record.snapshot = snapshot;
      record.observationError = null;
    });
  }
  recordError(id: string, message: string): TaskRecord {
    return this.change(id, record => { record.observationError = message; });
  }
}
