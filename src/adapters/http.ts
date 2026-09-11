import { createHash, randomUUID } from 'node:crypto';
import type { Snapshot, TaskAdapter } from '../types.js';

const version = '2026-07-28';
const extension = 'io.modelcontextprotocol/tasks';
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object response');
  return value as Record<string, any>;
}

/** Minimal modern MCP JSON-over-HTTP shim until the SDK supports Tasks. */
export class HttpTaskAdapter implements TaskAdapter {
  readonly name: string;
  private readonly endpoint: URL;
  constructor(endpoint: string, private readonly timeoutMs = 30000) {
    this.endpoint = new URL(endpoint);
    if (!['http:', 'https:'].includes(this.endpoint.protocol) || this.endpoint.username || this.endpoint.password || this.endpoint.search || this.endpoint.hash) {
      throw new Error('Server must be an HTTP(S) URL without credentials, query or fragment');
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid request timeout');
    this.name = `mcp-http-${version}:${createHash('sha256').update(this.endpoint.href).digest('hex')}`;
  }

  private async request(method: string, params: Record<string, unknown>, name?: string): Promise<Record<string, any>> {
    const id = randomUUID();
    const response = await fetch(this.endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        'Mcp-Protocol-Version': version, 'Mcp-Method': method, ...(name ? { 'Mcp-Name': name } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: {
        'io.modelcontextprotocol/protocolVersion': version,
        'io.modelcontextprotocol/clientInfo': { name: 'durable-mcp-client', version: '0.0.0' },
        'io.modelcontextprotocol/clientCapabilities': { extensions: { [extension]: {} } },
      } } }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`MCP HTTP ${response.status}`); }
    if (response.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
      await response.body?.cancel(); throw new Error('Only JSON MCP responses are currently supported');
    }
    const envelope = object(await response.json());
    if (envelope.jsonrpc !== '2.0' || envelope.id !== id) throw new Error('Invalid JSON-RPC response identity');
    if ('error' in envelope) throw new Error(`MCP error: ${JSON.stringify(envelope.error)}`);
    return object(envelope.result);
  }

  async submit(input: unknown): Promise<{ remoteId: string; snapshot: Snapshot | null }> {
    const call = object(input);
    if (typeof call.name !== 'string' || !call.name.trim()) throw new Error('Tool name is required');
    object(call.arguments);
    const discovery = await this.request('server/discover', {});
    if (discovery.resultType !== 'complete' || !Array.isArray(discovery.supportedVersions) || !discovery.supportedVersions.includes(version)
      || !discovery.capabilities?.extensions?.[extension]) throw new Error('Server does not advertise the pinned MCP Tasks extension');
    const result = await this.request('tools/call', { name: call.name, arguments: call.arguments }, call.name);
    if (result.resultType === 'task' && typeof result.taskId === 'string' && result.taskId.length) {
      // Commit the handle before parsing task state. Even malformed initial state
      // must remain recoverable; tasks/get supplies the authoritative snapshot.
      return { remoteId: result.taskId, snapshot: null };
    }
    if (result.resultType === 'complete' && Array.isArray(result.content)) {
      return { remoteId: `direct:${randomUUID()}`, snapshot: { status: 'completed', result } };
    }
    throw new Error('Unsupported tool result');
  }

  async query(remoteId: string): Promise<Snapshot> {
    const result = await this.request('tasks/get', { taskId: remoteId }, remoteId);
    if (result.resultType !== 'complete' || result.taskId !== remoteId || !['working', 'input_required', 'completed', 'failed', 'cancelled'].includes(result.status)) {
      throw new Error('Invalid task snapshot');
    }
    if (result.status === 'completed' && !('result' in result)) throw new Error('Completed task has no result');
    if (result.status === 'failed' && !('error' in result)) throw new Error('Failed task has no error');
    if (result.status === 'completed') object(result.result);
    if (result.status === 'failed') object(result.error);
    return { status: result.status, ...(result.status === 'completed' ? { result: result.result } : {}),
      ...(result.status === 'failed' ? { error: JSON.stringify(result.error) } : {}) };
  }
}
