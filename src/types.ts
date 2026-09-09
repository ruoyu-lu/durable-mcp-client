export type RemoteStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled';
export interface Snapshot {
  status: RemoteStatus;
  /** Plain JSON data; validated before persistence. */
  result?: unknown;
  error?: string;
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
  createdAt: string;
  updatedAt: string;
}
export interface TaskAdapter {
  readonly name: string;
  submit(input: unknown): Promise<{ remoteId: string; snapshot: Snapshot }>;
  query(remoteId: string): Promise<Snapshot>;
}
export function isTerminal(snapshot: Snapshot | null): boolean {
  return snapshot !== null && ['completed', 'failed', 'cancelled'].includes(snapshot.status);
}
