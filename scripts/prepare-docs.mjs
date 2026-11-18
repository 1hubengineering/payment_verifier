import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript-docs-parser';
import { guides, packages, pages, repository, version } from './docs-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(root, '.cache/payment-verifier-docs');
await mkdir(cache, { recursive: true });
const scratch = await mkdtemp(join(cache, 'build-'));
const digest = (data) => createHash('sha256').update(data).digest('hex');
const entries = [];

try {
  const examplePath = `docs/${version}/examples/compare-receipt.mjs`;
  const example = await readFile(join(root, examplePath), 'utf8');
  for (const [id, title] of guides) {
    const path = `docs/${version}/${id}.md`;
    const markdown = await readFile(join(root, path), 'utf8');
    const body = markdown.replace('<!-- runnable-example -->', () => '```js\n' + example + '```');
    entries.push({
      id,
      title,
      kind: 'guide',
      version,
      summary: body.split('\n\n')[0]?.trim() ?? title,
      body,
      url: `${pages}docs/#${id}`,
      source: `${repository}/blob/main/${path}`,
    });
  }

  entries.push({
    id: 'compare-receipt-example',
    title: 'Runnable receipt comparison',
    kind: 'example',
    version,
    summary: `Node.js example using @1hubengineering/receipt-verifier@${version}`,
    body: example,
    url: `${pages}docs/#quickstart`,
    source: `${repository}/blob/main/${examplePath}`,
  });

  const scope = join(scratch, 'node_modules', '@1hubengineering');
  await mkdir(scope, { recursive: true });
  for (const [name, hash] of Object.entries(packages)) {
    const archiveName = `${name}-${version}.tgz`;
    const archive = join(cache, archiveName);
    const saved = await readFile(archive).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (!saved || digest(saved) !== hash) {
      const response = await fetch(
        `https://registry.npmjs.org/@1hubengineering/${name}/-/${archiveName}`,
        { signal: AbortSignal.timeout(45_000) },
      );
      if (!response.ok) throw new Error(`Cannot download ${archiveName}: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (digest(bytes) !== hash) throw new Error(`Release checksum mismatch: ${archiveName}`);
      const pending = join(scratch, archiveName);
      await writeFile(pending, bytes);
      await rename(pending, archive);
    }
    const unpacked = join(scope, name);
    await mkdir(unpacked);
    execFileSync('tar', [
      '-xzf',
      archive,
      '-C',
      unpacked,
      '--strip-components=1',
      'package/package.json',
      'package/dist',
    ]);
  }
  for (const name of Object.keys(packages)) {
    const packageRoot = join(scope, name);
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    if (manifest.version !== version || manifest.name !== `@1hubengineering/${name}`)
      throw new Error(`Unexpected archive: ${name}`);
    const exports = Object.entries(manifest.exports).filter(
      ([, conditions]) => typeof conditions.types === 'string',
    );
    const program = ts.createProgram(
      exports.map(([, conditions]) => join(packageRoot, conditions.types)),
      {
        module: ts.ModuleKind.NodeNext,
        skipLibCheck: true,
        noLib: true,
        types: [],
      },
    );
    const checker = program.getTypeChecker();
    for (const [subpath, conditions] of exports) {
      const importPath = subpath === '.' ? manifest.name : manifest.name + subpath.slice(1);
      const source = program.getSourceFile(join(packageRoot, conditions.types));
      const symbol = source && checker.getSymbolAtLocation(source);
      if (!symbol) throw new Error(`Cannot read public typings for ${importPath}`);
      const exported = checker.getExportsOfModule(symbol);
      if (!exported.length) throw new Error(`Missing public typings for ${importPath}`);
      for (const item of exported) {
        const target = item.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item;
        const title = item.getName();
        const declarations = target.getDeclarations();
        if (!declarations?.length) throw new Error(`Cannot resolve ${importPath}:${title}`);
        const subpathName = subpath === '.' ? 'index' : subpath.slice(2);
        const sourceEntry = subpathName === 'providers' ? 'providers/index' : subpathName;
        const id = `api-${name}-${subpathName}-${title}`;
        entries.push({
          id,
          title,
          kind: 'api',
          version,
          summary: importPath,
          body: declarations
            .map((entry) => {
              const declaration = ts.isVariableDeclaration(entry) ? entry.parent.parent : entry;
              return declaration.getText();
            })
            .join('\n\n'),
          url: `${pages}api/#${id}`,
          source: `${repository}/blob/v${version}/packages/${name}/src/${sourceEntry}.ts`,
        });
      }
    }
  }
  if (new Set(entries.map(({ id }) => id)).size !== entries.length)
    throw new Error('Duplicate documentation IDs');
  const built = join(scratch, 'corpus.json');
  await writeFile(built, JSON.stringify(entries));
  await rename(built, join(cache, 'corpus.json'));
  console.log(`Prepared ${entries.length} documentation entries for ${version}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
