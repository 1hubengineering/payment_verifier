import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'payment-verifier-docs-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./docs-mcp.mjs', import.meta.url))],
  stderr: 'inherit',
});
const invoke = (name, args) => client.callTool({ name, arguments: args }, { timeout: 5000 });
const content = (result) => {
  assert.notEqual(result.isError, true);
  assert.equal(result.content[0]?.type, 'text');
  return JSON.parse(result.content[0].text);
};

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name).sort(), ['get_doc', 'search_docs']);
  assert.ok(tools.every(({ annotations }) => annotations?.readOnlyHint));
  const [match] = content(
    await invoke('search_docs', {
      query: 'drizzlePostgresTransaction',
      kind: 'api',
      version: '0.1.0',
    }),
  );
  assert.equal(match.title, 'drizzlePostgresTransaction');
  const api = content(await invoke('get_doc', { id: match.id, version: '0.1.0' }));
  assert.match(api.body, /drizzlePostgresTransaction/);
  assert.match(api.source, /\/blob\/v0\.1\.0\//);
  const quickstart = content(await invoke('get_doc', { id: 'quickstart' }));
  assert.match(quickstart.body, /compareReceipt/);
  assert.match(quickstart.body, /@1hubengineering\/verifier@0\.1\.1/);
  const archived = content(await invoke('get_doc', { id: 'quickstart', version: '0.1.0' }));
  assert.match(archived.body, /receipt-verifier@0\.1\.0/);
  const [current] = content(
    await invoke('search_docs', { query: 'drizzlePostgresTransaction', kind: 'api' }),
  );
  assert.equal(current.summary, '@1hubengineering/adapter-drizzle/postgres');
  assert.match(current.source, /\/blob\/v0\.1\.1\/packages\/receipt-verifier-adapter-drizzle\//);
  const [example] = content(await invoke('search_docs', { query: 'runnable', kind: 'example' }));
  assert.match(content(await invoke('get_doc', { id: example.id })).body, /assert\.equal/);
  assert.ok((await invoke('get_doc', { id: '../../.env' })).isError);
  assert.ok((await invoke('search_docs', { query: 'prisma', version: '9.9.9' })).isError);
  console.log(
    'MCP stdio: connected; API, guide, and example lookup passed; unknown IDs and versions rejected.',
  );
} finally {
  await client.close();
}
