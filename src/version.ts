import { readFileSync } from 'node:fs';

const { name, version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string; version: string };
/** One version for the installed CLI and its MCP client metadata. */
export const clientInfo = { name, version };
