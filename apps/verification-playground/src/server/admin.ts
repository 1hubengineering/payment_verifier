import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { ENV } from '../../env.ts';
import { setAdministrator } from './auth.ts';

try {
  const [action, username, ...extra] = process.argv.slice(2);
  if (
    (action !== 'seed' && action !== 'rotate') ||
    !username ||
    extra.length ||
    process.stdin.isTTY
  )
    throw new Error('Usage: pipe a password on stdin to admin.ts seed|rotate <username>.');
  let password = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    password += typeof chunk === 'string' ? chunk : String(chunk);
    if (password.length > 257) throw new Error('Password input is too long.');
  }
  process.umask(0o077);
  await mkdir(ENV.PLAYGROUND_DATA_DIR, { recursive: true, mode: 0o700 });
  const db = new Database(join(ENV.PLAYGROUND_DATA_DIR, 'playground.sqlite'), { timeout: 5000 });
  try {
    db.pragma('secure_delete = ON');
    await setAdministrator(db, action, username, password.replace(/\r?\n$/u, ''));
    console.log('Administrator configured. Initial password change is required.');
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Administrator configuration failed.');
  process.exitCode = 1;
}
