import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import { association, context, message, sessionId, text } from './host.mjs';

// Characterization of a pinned host, not assertions of general MCP support.
test('built-in bridge refuses required Tasks and drops an optional task handle', async () => {
  let calls = 0;
  const tool = (taskRequired) => createMcpToolDefinition({}, {
    name: 'probe', rawName: 'probe', description: 'probe', inputSchema: { type: 'object' }, taskRequired,
    call: async () => {
      calls++;
      return { resultType: 'task', taskId: 'remote-task', status: 'working',
        createdAt: '2026-09-29T00:00:00Z', lastUpdatedAt: '2026-09-29T00:00:00Z', ttl: 60000 };
    },
  });
  const execution = { signal: new AbortController().signal };
  await assert.rejects(tool(true).execute({}, execution), /requires task-based execution/);
  assert.equal(calls, 0);
  assert.deepEqual(await tool(false).execute({}, execution), { content: [] });
  assert.equal(calls, 1);
});

test('a successful flush with no persistence listener is not a durable acknowledgment', async () => {
  const ctx = await context();
  try {
    const agent = await ctx.agentLoop.create(sessionId);
    agent.session.append('durable-mcp/task', association);
    assert.equal(await ctx.sessions.flush(agent.session), false);
  } finally { await ctx.fiber.dispose(); }
});

test('queued input survives SIGKILL after a real JSONL flush', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'durable-harness-crash-'));
  const worker = fork(new URL('./crash-worker.mjs', import.meta.url), [root], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const exited = once(worker, 'exit');
  let ctx;
  let timer;
  try {
    const ready = await Promise.race([
      once(worker, 'message').then(([value]) => value),
      exited.then(([code, signal]) => { throw new Error(`Worker exited before flush: ${code}/${signal}`); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Worker flush timed out')), 15000); }),
    ]);
    clearTimeout(timer);
    assert.deepEqual(ready, { flushed: true });
    assert.equal(worker.kill('SIGKILL'), true);
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    ctx = await context(root);
    const { agent } = await ctx.agents.resume({ resumeSessionId: sessionId });
    assert.equal(agent.inbox.nextStep.length, 1);
    assert.equal(agent.inbox.nextStep[0].content[0].text, text);
  } finally {
    clearTimeout(timer);
    if (worker.exitCode === null && worker.signalCode === null) { worker.kill('SIGKILL'); await exited; }
    if (ctx) await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('normal host disposal records cancellation and removes flushed pending input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'durable-harness-shutdown-'));
  let ctx;
  try {
    ctx = await context(root);
    const agent = await ctx.agentLoop.create(sessionId);
    agent.inject(message());
    assert.equal(await ctx.sessions.flush(agent.session), true);
    await ctx.fiber.dispose();
    ctx = await context(root);
    const resumed = (await ctx.agents.resume({ resumeSessionId: sessionId })).agent;
    assert.equal(resumed.inbox.nextStep.length, 0);
    assert.ok(resumed.session.snapshotEvents().some((event) =>
      event.type === 'agent/inbox/spliced' && event.data.outcome === 'canceled' && event.data.removedCount === 1));
  } finally {
    if (ctx) await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('message identity deduplicates pending input, not historical delivery', async () => {
  const ctx = await context();
  try {
    const agent = await ctx.agentLoop.create(sessionId);
    const input = message();
    agent.inject(input);
    assert.throws(() => agent.inject(input), /already pending/);
    assert.equal(agent.inbox.remove(input.id), true);
    agent.inject(input);
    assert.equal(agent.inbox.nextStep.length, 1);
  } finally { await ctx.fiber.dispose(); }
});

test('directly appended custom task associations make the persisted session unresumable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'durable-harness-association-'));
  let ctx;
  try {
    ctx = await context(root);
    const agent = await ctx.agentLoop.create(sessionId);
    const event = agent.session.append('durable-mcp/task', association);
    assert.equal(event.ignorable, undefined);
    assert.equal(await ctx.sessions.flush(agent.session), true);
    await ctx.fiber.dispose();
    ctx = await context(root);
    await assert.rejects(ctx.agents.resume({ resumeSessionId: sessionId }), (error) =>
      error.name === 'SessionFormatUnsupportedError' && /unknown to this harness and not marked ignorable/.test(error.message));
  } finally {
    if (ctx) await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
