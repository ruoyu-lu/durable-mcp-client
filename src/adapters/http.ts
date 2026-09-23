import { AdapterError } from '../errors.js';
import { createHash, randomUUID } from 'node:crypto';
import { validPollInterval } from '../types.js';
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

  private async request(method: string, params: Record<string, unknown>, name?: string, signal?: AbortSignal): Promise<Record<string, any>> {
    const id = randomUUID();
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          'Mcp-Protocol-Version': version, 'Mcp-Method': method, ...(name ? { 'Mcp-Name': name } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: {
          'io.modelcontextprotocol/protocolVersion': version,
          'io.modelcontextprotocol/clientInfo': { name: 'durable-mcp-client', version: '0.0.0' },
          'io.modelcontextprotocol/clientCapabilities': { extensions: { [extension]: {} } },
        } } }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new AdapterError({ kind: 'transport', method, message: String(error) }, { cause: error });
    }
    if (!response.ok) { await response.body?.cancel(); throw new AdapterError({ kind: 'http', method, status: response.status, message: `MCP HTTP ${response.status}` }); }
    if (response.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
      await response.body?.cancel(); throw new AdapterError({ kind: 'invalid_response', method, message: 'Only JSON MCP responses are currently supported' });
    }
    let body: unknown;
    try { body = await response.json(); }
    catch (error) {
      if (signal?.aborted) throw error;
      throw new AdapterError({ kind: error instanceof SyntaxError ? 'invalid_response' : 'transport', method, message: String(error) }, { cause: error });
    }
    try {
      const envelope = object(body);
      if (envelope.jsonrpc !== '2.0' || envelope.id !== id || ('error' in envelope && 'result' in envelope)) throw new Error('Invalid JSON-RPC response identity');
      if ('error' in envelope) {
        const error = object(envelope.error);
        if (!Number.isSafeInteger(error.code) || typeof error.message !== 'string') throw new Error('Invalid JSON-RPC error');
        // Error codes alone do not establish that a task update had no effects.
        throw new AdapterError({ kind: 'protocol', method, code: error.code, message: error.message,
          ...('data' in error ? { data: error.data } : {}) });
      }
      return object(envelope.result);
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError({ kind: 'invalid_response', method, message: String(error) });
    }
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

  async respond(remoteId: string, key: string, response: Record<string, unknown>): Promise<void> {
    const result = await this.request('tasks/update', { taskId: remoteId, inputResponses: { [key]: response } }, remoteId);
    if (result.resultType !== 'complete') throw new AdapterError({ kind: 'invalid_response', method: 'tasks/update', message: 'Invalid input acknowledgment' });
  }

  async cancel(remoteId: string): Promise<void> {
    const result = await this.request('tasks/cancel', { taskId: remoteId }, remoteId);
    if (result.resultType !== 'complete') throw new Error('Invalid cancellation acknowledgment');
  }

  async query(remoteId: string, signal?: AbortSignal): Promise<Snapshot> {
    const result = await this.request('tasks/get', { taskId: remoteId }, remoteId, signal);
    if (result.resultType !== 'complete' || result.taskId !== remoteId || !['working', 'input_required', 'completed', 'failed', 'cancelled'].includes(result.status)) {
      throw new Error('Invalid task snapshot');
    }
    if (result.status === 'completed' && !('result' in result)) throw new Error('Completed task has no result');
    if (result.status === 'failed' && !('error' in result)) throw new Error('Failed task has no error');
    if (result.status === 'completed') object(result.result);
    if (result.status === 'failed') object(result.error);
    let inputRequests: Snapshot['inputRequests'];
    if (result.status === 'input_required') {
      inputRequests = object(result.inputRequests);
      for (const request of Object.values(inputRequests)) {
        const entry = object(request);
        if (typeof entry.method !== 'string' || !entry.method) throw new Error('Invalid input request method');
        if ('params' in entry) object(entry.params);
      }
    }
    return { ...(validPollInterval(result.pollIntervalMs) ? { pollIntervalMs: result.pollIntervalMs } : {}), ...(inputRequests ? { inputRequests } : {}), status: result.status, ...(result.status === 'completed' ? { result: result.result } : {}),
      ...(result.status === 'failed' ? { error: JSON.stringify(result.error) } : {}) };
  }
}
