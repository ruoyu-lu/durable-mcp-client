export type RemoteStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled';
export interface Snapshot {
  status: RemoteStatus;
  /** Plain JSON data; validated before persistence. */
  result?: unknown;
  error?: string;
  /** Server polling hint in non-negative integer milliseconds. */
  pollIntervalMs?: number;
  /** Outstanding server requests, retained as data rather than executed. */
  inputRequests?: Record<string, { method: string; params?: Record<string, unknown> }>;
}
export interface TaskRecord {
  id: string;
  adapter: string;
  /** Plain JSON data; validated before remote submission. */
  input: unknown;
  remoteId: string | null;
  submission: 'unknown' | 'accepted';
  snapshot: Snapshot | null;
  observationError: string | null;
  /** Latest explicit cancellation attempt; absent on older/untouched records. */
  cancellation?: { attemptId: string; requestedAt: string; outcome: 'pending' | 'acknowledged' | 'unknown'; error: string | null };
  inputResponses?: Array<{ key: string; response: Record<string, unknown>; outcome: 'pending' | 'acknowledged' | 'unknown'; error: string | null }>;
  createdAt: string;
  updatedAt: string;
}
export interface TaskAdapter {
  readonly name: string;
  submit(input: unknown): Promise<{ remoteId: string; snapshot: Snapshot | null }>;
  respond?(remoteId: string, key: string, response: Record<string, unknown>): Promise<void>;
  cancel?(remoteId: string): Promise<void>;
  /** Implementations must honor the signal to enforce wait deadlines. */
  query(remoteId: string, signal?: AbortSignal): Promise<Snapshot>;
}
export function isTerminal(snapshot: Snapshot | null): boolean {
  return snapshot !== null && ['completed', 'failed', 'cancelled'].includes(snapshot.status);
}

/** Treat malformed advisory metadata as absent, not a failed observation. */
export function validPollInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
