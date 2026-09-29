import { Context } from '@deepseek-ai/cordis';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm';
import SessionProjections from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';

export const sessionId = SessionId('durable-result-probe');
export const association = { localId: 'client-task', remoteId: 'remote-task' };
export const text = 'Synthetic probe input: task result 42';
// This is test input, not a proposed attribution scheme for generated results.
export const message = () => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } });

export async function context(root) {
  const ctx = new Context();
  try {
    for (const plugin of [LlmRuntime, SessionStore, SessionProjections]) await ctx.plugin(plugin);
    await ctx.plugin(SystemPrompt, {});
    await ctx.plugin(Tools, {});
    await ctx.plugin(AgentRegistry);
    if (root) await ctx.plugin(JsonlPersistence, { root, compression: 'none' });
    await ctx.plugin(AgentLoop, { agents: [] });
    return ctx;
  } catch (error) {
    await ctx.fiber.dispose();
    throw error;
  }
}
