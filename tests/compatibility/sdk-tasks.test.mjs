import assert from 'node:assert/strict';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const version = '2026-07-28';
const extension = 'io.modelcontextprotocol/tasks';
const task = {
  taskId: 'probe-task', status: 'working', createdAt: '2026-09-08T00:00:00Z',
  lastUpdatedAt: '2026-09-08T00:00:00Z', ttlMs: 60000, pollIntervalMs: 1000,
};

// Exercise the real SDK serializer/HTTP transport through its public fetch seam.
// No network socket, real server, persistence, or authorization is simulated.
async function fixture(t, respond) {
  const requests = [];
  const client = new Client({ name: 'compatibility-probe', version: '0.0.0' }, {
    versionNegotiation: { mode: { pin: version } },
    capabilities: { extensions: { [extension]: {} } },
  });
  t.after(() => client.close());
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push({ body, headers: new Headers(init.headers) });
      const result = body.method === 'server/discover'
        ? { resultType: 'complete', supportedVersions: [version], capabilities: { tools: {}, extensions: { [extension]: {} } } }
        : respond(body);
      return Response.json({ jsonrpc: '2.0', id: body.id, result });
    },
  });
  await client.connect(transport);
  return { client, requests };
}

test('modern direct call emits capability metadata and method/name headers', async t => {
  const { client, requests } = await fixture(t, () => ({ resultType: 'complete', content: [{ type: 'text', text: 'ok' }] }));
  assert.deepEqual(await client.callTool({ name: 'probe', arguments: {} }), { content: [{ type: 'text', text: 'ok' }] });
  const { body, headers } = requests.at(-1);
  assert.deepEqual(body.params._meta['io.modelcontextprotocol/clientCapabilities'].extensions, { [extension]: {} });
  assert.equal(headers.get('mcp-protocol-version'), version);
  assert.equal(headers.get('mcp-method'), 'tools/call');
  assert.equal(headers.get('mcp-name'), 'probe');
});

test('published client rejects task-augmented tool results (known compatibility gap)', async t => {
  const { client, requests } = await fixture(t, () => ({ resultType: 'task', ...task }));
  await assert.rejects(client.callTool({ name: 'probe', arguments: {} }), {
    code: 'UNSUPPORTED_RESULT_TYPE',
  });
  assert.equal(requests.at(-1).body.method, 'tools/call');
});

test('published client rejects modern tasks/get before HTTP dispatch (known compatibility gap)', async t => {
  const { client, requests } = await fixture(t, () => ({ resultType: 'complete', ...task }));
  const before = requests.length;
  assert.throws(() => client.request({ method: 'tasks/get', params: { taskId: task.taskId } }), {
    code: 'METHOD_NOT_SUPPORTED_BY_PROTOCOL_VERSION',
  });
  assert.equal(requests.length, before, 'No task request should reach the transport');
});
