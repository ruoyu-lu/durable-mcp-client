import assert from 'node:assert/strict';
import { context, message, sessionId } from './host.mjs';

const ctx = await context(process.argv[2]);
const agent = await ctx.agentLoop.create(sessionId);
agent.inject(message());
assert.equal(await ctx.sessions.flush(agent.session), true);
assert.equal(agent.inbox.nextStep.length, 1);
// Keep the process alive so the parent verifies a real SIGKILL, not natural exit.
setInterval(() => {}, 1000);
process.send({ flushed: true });
