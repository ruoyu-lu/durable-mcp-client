#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { TaskStore } from './store.js';
import { TaskCoordinator } from './coordinator.js';
import { DemoAdapter } from './adapters/demo.js';

const usage = `Durable MCP Client
Usage: node dist/cli.js <submit|status|list|recover> [task-id] [options]
  --db PATH       SQLite database (default: .runtime/tasks.sqlite)
  --text TEXT     Demo result for submit
  --delay-ms N    Demo readiness delay, 0..86400000 (default: 1000)
  --help          Show help
This initial CLI uses the deterministic demo adapter, not a live MCP server.`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    db: { type: 'string', default: '.runtime/tasks.sqlite' },
    text: { type: 'string' }, 'delay-ms': { type: 'string', default: '1000' },
    help: { type: 'boolean', default: false },
  } });
  if (values.help) { console.log(usage); return; }
  const [command, id] = positionals;
  if (!command || !['submit', 'status', 'list', 'recover'].includes(command)) throw new Error(usage);
  if (positionals.length !== (command === 'status' ? 2 : 1)) throw new Error('Invalid command arguments');
  const delayMs = Number(values['delay-ms']);
  if (command === 'submit' && (values.text === undefined || !Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 86400000)) {
    throw new Error('submit requires --text and --delay-ms between 0 and 86400000');
  }
  const store = new TaskStore(values.db);
  try {
    const coordinator = new TaskCoordinator(store, new DemoAdapter());
    const result = command === 'submit' ? await coordinator.submit({ text: values.text, delayMs })
      : command === 'status' ? await coordinator.refresh(id!)
      : command === 'recover' ? await coordinator.recover() : store.list();
    console.log(JSON.stringify(result, null, 2));
  } finally { store.close(); }
}
main().catch(error => { console.error(String(error)); process.exitCode = 1; });
