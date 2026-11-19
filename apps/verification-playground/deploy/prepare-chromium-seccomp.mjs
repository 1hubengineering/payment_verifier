import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [upstreamFile, outputFile] = process.argv.slice(2);
const upstreamDigest = 'cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849';

if (!upstreamFile || !outputFile) {
  throw new Error('Usage: node prepare-chromium-seccomp.mjs <upstream.json> <profile.json>');
}

const source = await readFile(upstreamFile);
if (createHash('sha256').update(source).digest('hex') !== upstreamDigest) {
  throw new Error('The upstream Playwright 1.65.1 seccomp profile checksum does not match');
}

const profile = JSON.parse(source);
// Chromium's zygote holds CAP_SYS_CHROOT in its own user namespace. The
// inherited filter must allow the syscall even when the container drops all caps.
profile.syscalls.push({
  comment: 'Allow Chromium to complete its own namespace sandbox',
  names: ['chroot'],
  action: 'SCMP_ACT_ALLOW',
  args: [],
});
await writeFile(outputFile, JSON.stringify(profile, null, 2) + '\n', { mode: 0o600 });
