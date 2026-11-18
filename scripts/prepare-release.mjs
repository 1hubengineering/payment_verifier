import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
assert.equal(
  git('status', '--porcelain'),
  '',
  'Release artifacts require a clean reviewed checkout',
);
execFileSync('pnpm', ['build'], { cwd: root, stdio: 'pipe' });
assert.equal(git('status', '--porcelain'), '', 'Release build changed tracked source');
const commit = git('rev-parse', 'HEAD');
const folders = [
  'receipt-verifier',
  'receipt-verifier-storage-sql',
  'receipt-verifier-adapter-drizzle',
  'receipt-verifier-adapter-prisma',
  'receipt-verifier-provider-cbe',
];
const names = ['verifier', 'storage-sql', 'adapter-drizzle', 'adapter-prisma', 'provider-cbe'];
const manifests = folders.map((folder) =>
  JSON.parse(readFileSync(join(root, 'packages', folder, 'package.json'), 'utf8')),
);
const version = manifests[0].version;
assert.match(version, /^\d+\.\d+\.\d+$/);
const directory = resolve(root, 'artifacts', `v${version}-${commit.slice(0, 12)}`);
mkdirSync(directory, { recursive: true });
const packages = [];
for (let index = 0; index < folders.length; index++) {
  const folder = folders[index],
    manifest = manifests[index];
  assert.equal(manifest.name, `@1hubengineering/${names[index]}`);
  assert.equal(manifest.version, version);
  assert.equal(manifest.license, 'ISC');
  assert.equal(
    manifest.repository.url,
    'git+https://github.com/1hubengineering/payment_verifier.git',
  );
  assert.equal(manifest.repository.directory, `packages/${folder}`);
  assert.equal(manifest.publishConfig.access, 'public');
  execFileSync('pnpm', ['pack', '--pack-destination', directory], {
    cwd: join(root, 'packages', folder),
    stdio: 'pipe',
  });
  const filename = `1hubengineering-${names[index]}-${version}.tgz`,
    file = join(directory, filename);
  const paths = execFileSync('tar', ['-tzf', file], { encoding: 'utf8' }).trim().split('\n');
  for (const path of paths) {
    assert.ok(!path.split('/').includes('..'), 'Unexpected tar traversal');
    assert.match(
      path,
      /^package\/(?:dist\/[A-Za-z0-9_./-]+|README\.md|LICENSE|package\.json|schema\/(?:postgres|mysql|sqlite)\.prisma)$/,
    );
  }
  for (const required of ['package/package.json', 'package/README.md', 'package/LICENSE'])
    assert.ok(paths.includes(required));
  const packed = JSON.parse(
    execFileSync('tar', ['-xOf', file, 'package/package.json'], { encoding: 'utf8' }),
  );
  for (const [name, range] of Object.entries(packed.dependencies ?? {}))
    if (name.startsWith('@1hubengineering/')) assert.equal(range, version);
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublishOnly'])
    assert.equal(packed.scripts?.[hook], undefined);
  const checkExport = (value) => {
    if (typeof value === 'string') {
      if (value === './schema/*') {
        for (const engine of ['postgres', 'mysql', 'sqlite'])
          assert.ok(paths.includes(`package/schema/${engine}.prisma`));
      } else {
        assert.ok(value.startsWith('./dist/'));
        assert.ok(paths.includes(`package/${value.slice(2)}`));
      }
    } else for (const target of Object.values(value)) checkExport(target);
  };
  checkExport(packed.exports);
  const bytes = readFileSync(file),
    sha256 = createHash('sha256').update(bytes).digest('hex'),
    sha512 = createHash('sha512').update(bytes).digest('base64');
  packages.push({
    name: packed.name,
    version,
    filename,
    eligibleForPublish: packed.private === false,
    sha256,
    integrity: `sha512-${sha512}`,
    files: paths.length,
  });
}
const result = {
  sourceCommit: commit,
  version,
  eligibleForPublish: packages.every((pkg) => pkg.eligibleForPublish),
  packages,
};
writeFileSync(join(directory, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(
  join(directory, 'SHA256SUMS'),
  packages.map((pkg) => `${pkg.sha256}  ${pkg.filename}`).join('\n') + '\n',
);
assert.equal(readdirSync(directory).filter((name) => name.endsWith('.tgz')).length, 5);
process.stdout.write(JSON.stringify({ directory, ...result }, null, 2) + '\n');
