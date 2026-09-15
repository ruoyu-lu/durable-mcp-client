export type RemoteStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled';
export interface Snapshot {
  status: RemoteStatus;
  /** Plain JSON data; validated before persistence. */
  result?: unknown;
  error?: string;
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
  createdAt: string;
  updatedAt: string;
}
export interface TaskAdapter {
  readonly name: string;
  submit(input: unknown): Promise<{ remoteId: string; snapshot: Snapshot | null }>;
  cancel?(remoteId: string): Promise<void>;
  query(remoteId: string): Promise<Snapshot>;
}
export function isTerminal(snapshot: Snapshot | null): boolean {
  return snapshot !== null && ['completed', 'failed', 'cancelled'].includes(snapshot.status);
}
