import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { searchDocs, version } from './docs-catalog.mjs';

const corpus = new URL('../.cache/payment-verifier-docs/corpus.json', import.meta.url);
const entries = JSON.parse(
  await readFile(corpus, 'utf8').catch((error) => {
    if (error.code === 'ENOENT')
      throw new Error(
        'Documentation corpus missing. Run pnpm docs:prepare from the repository root.',
      );
    throw error;
  }),
);
const byId = new Map(entries.map((entry) => [entry.id, entry]));
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const reply = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });

serveStdio(() => {
  const server = new McpServer({ name: 'payment-verifier-docs', version });
  server.registerTool(
    'search_docs',
    {
      description:
        'Find Payment Verifier guides, public TypeScript exports, or runnable examples by name or topic. Omit version to search the only supported release, 0.1.0.',
      inputSchema: z.object({
        query: z.string().trim().min(1).max(160),
        version: z.literal(version).optional(),
        kind: z.enum(['guide', 'api', 'example']).optional(),
      }),
      annotations,
    },
    ({ query, kind }) => reply(searchDocs(entries, query, kind)),
  );
  server.registerTool(
    'get_doc',
    {
      description:
        'Retrieve the Markdown, TypeScript declaration or example for an exact ID from search_docs, with version and source links.',
      inputSchema: z.object({
        id: z.string().min(1).max(200),
        version: z.literal(version).optional(),
      }),
      annotations,
    },
    ({ id }) => {
      const entry = byId.get(id);
      return entry
        ? reply(entry)
        : {
            ...reply({ error: 'Unknown documentation ID. Use search_docs to find an ID.' }),
            isError: true,
          };
    },
  );
  return server;
});
