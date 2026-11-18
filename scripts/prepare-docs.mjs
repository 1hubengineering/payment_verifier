import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript-docs-parser';
import { guides, releases, pages, repository, version as currentVersion } from './docs-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(root, '.cache/payment-verifier-docs');
await mkdir(cache, { recursive: true });
const scratch = await mkdtemp(join(cache, 'build-'));
const digest = (data) => createHash('sha256').update(data).digest('hex');
const entries = [];

async function prepareRelease(version, packages) {
  const current = version === currentVersion;
  const core = current ? 'verifier' : 'receipt-verifier';
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
      url: current ? `${pages}docs/#${id}` : `${repository}/blob/main/${path}`,
      source: `${repository}/blob/main/${path}`,
    });
  }

  entries.push({
    id: 'compare-receipt-example',
    title: 'Runnable receipt comparison',
    kind: 'example',
    version,
    summary: `Node.js example using @1hubengineering/${core}@${version}`,
    body: example,
    url: current ? `${pages}docs/#quickstart` : `${repository}/blob/main/${examplePath}`,
    source: `${repository}/blob/main/${examplePath}`,
  });

  const scope = join(scratch, version, 'node_modules', '@1hubengineering');
  await mkdir(scope, { recursive: true });
  for (const [name, hash] of Object.entries(packages)) {
    const archiveName = `${name}-${version}.tgz`;
    const archive = join(cache, archiveName);
    const saved = await readFile(archive).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (!saved || digest(saved) !== hash) {
      const sources = [
        `https://registry.npmjs.org/@1hubengineering/${name}/-/${archiveName}`,
        `${repository}/releases/download/v${version}/1hubengineering-${archiveName}`,
      ];
      let bytes;
      for (const source of sources) {
        const response = await fetch(source, { signal: AbortSignal.timeout(30_000) }).catch(
          () => null,
        );
        if (!response?.ok) continue;
        const candidate = Buffer.from(await response.arrayBuffer());
        if (digest(candidate) !== hash)
          throw new Error(`Release checksum mismatch: ${archiveName}`);
        bytes = candidate;
        break;
      }
      if (!bytes) throw new Error(`Cannot download release archive ${archiveName}`);
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
        const folder = current
          ? name === 'verifier'
            ? 'receipt-verifier'
            : `receipt-verifier-${name}`
          : name;
        const sourceUrl = `${repository}/blob/v${version}/packages/${folder}/src/${sourceEntry}.ts`;
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
          url: current ? `${pages}api/#${id}` : sourceUrl,
          source: sourceUrl,
        });
      }
    }
  }
}

try {
  for (const [version, packages] of Object.entries(releases)) {
    await prepareRelease(version, packages);
  }
  if (new Set(entries.map(({ id, version }) => `${version}:${id}`)).size !== entries.length)
    throw new Error('Duplicate documentation IDs');
  const built = join(scratch, 'corpus.json');
  await writeFile(built, JSON.stringify(entries));
  await rename(built, join(cache, 'corpus.json'));
  console.log(
    `Prepared ${entries.length} documentation entries across ${Object.keys(releases).join(', ')}`,
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
