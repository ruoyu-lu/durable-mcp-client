#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { TaskStore } from './store.js';
import { TaskCoordinator } from './coordinator.js';
import { HttpTaskAdapter } from './adapters/http.js';
import { DemoAdapter } from './adapters/demo.js';

const usage = `Durable MCP Client
Usage: node dist/cli.js <submit|status|list|recover> [task-id] [options]
  --db PATH       SQLite database (default: .runtime/tasks.sqlite)
  --text TEXT     Demo result for submit
  --delay-ms N    Demo readiness delay, 0..86400000 (default: 1000)
  --help          Show help
--server URL    Use a modern MCP JSON HTTP endpoint (also required for status/recover)
  --tool NAME     Remote tool for submit
  --arguments JSON  Remote tool arguments (default: {})`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    server: { type: 'string' }, tool: { type: 'string' }, arguments: { type: 'string', default: '{}' },
    db: { type: 'string', default: '.runtime/tasks.sqlite' },
    text: { type: 'string' }, 'delay-ms': { type: 'string', default: '1000' },
    help: { type: 'boolean', default: false },
  } });
  if (values.help) { console.log(usage); return; }
  const [command, id] = positionals;
  if (!command || !['submit', 'status', 'list', 'recover'].includes(command)) throw new Error(usage);
  if (positionals.length !== (command === 'status' ? 2 : 1)) throw new Error('Invalid command arguments');
  const delayMs = Number(values['delay-ms']);
  if (command === 'submit' && !values.server && (values.text === undefined || !Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 86400000)) {
    throw new Error('submit requires --text and --delay-ms between 0 and 86400000');
  }
  const adapter = values.server ? new HttpTaskAdapter(values.server) : new DemoAdapter();
  const input = values.server ? { name: values.tool, arguments: JSON.parse(values.arguments) } : { text: values.text, delayMs };
  if (command === 'submit' && values.server && !values.tool) throw new Error('--server submit requires --tool');
  const store = new TaskStore(values.db);
  try {
    const coordinator = new TaskCoordinator(store, adapter);
    const result = command === 'submit' ? await coordinator.submit(input)
      : command === 'status' ? await coordinator.refresh(id!)
      : command === 'recover' ? await coordinator.recover() : store.list();
    console.log(JSON.stringify(result, null, 2));
  } finally { store.close(); }
}
main().catch(error => { console.error(String(error)); process.exitCode = 1; });
