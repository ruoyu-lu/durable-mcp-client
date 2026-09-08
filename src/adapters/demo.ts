import type { Snapshot, TaskAdapter } from '../types.js';

// A deterministic mock boundary, not MCP or a background worker. The handle
// encodes a ready time and result so a separate process can query it later.
export class DemoAdapter implements TaskAdapter {
  readonly name = 'demo-v1';
  async submit(input: unknown): Promise<{ remoteId: string; snapshot: Snapshot }> {
    const value = input as { text?: unknown; delayMs?: unknown } | null;
    if (!value || typeof value.text !== 'string' || !Number.isSafeInteger(value.delayMs) ||
        (value.delayMs as number) < 0 || (value.delayMs as number) > 86400000) {
      throw new Error('Demo input requires text and an integer delayMs between 0 and 86400000');
    }
    const remoteId = JSON.stringify({ readyAt: Date.now() + (value.delayMs as number), text: value.text });
    return { remoteId, snapshot: await this.query(remoteId) };
  }
  async query(remoteId: string): Promise<Snapshot> {
    const handle = JSON.parse(remoteId) as { readyAt?: unknown; text?: unknown };
    if (typeof handle.readyAt !== 'number' || !Number.isFinite(handle.readyAt) || typeof handle.text !== 'string') {
      throw new Error('Invalid demo handle');
    }
    return Date.now() < handle.readyAt
      ? { status: 'working' }
      : { status: 'completed', result: { text: handle.text } };
  }
}
