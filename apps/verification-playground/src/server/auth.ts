import { argon2, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Database } from 'better-sqlite3';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RequestError } from './request-error.ts';

const derive = promisify(argon2);
const lifetime = 8 * 60 * 60;
const accountName = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9@._+-]{3,128}$/u);
const inputPassword = z.string().min(1).max(256);
const newPassword = z.string().min(16).max(256);
const loginInput = z.strictObject({ username: accountName, password: inputPassword });
const passwordInput = z.strictObject({ current: inputPassword, password: newPassword });
const unauthorized = () =>
  new RequestError(401, 'UNAUTHORIZED', 'Sign in with the administrator account.');

interface Account {
  username: string;
  salt: Buffer;
  hash: Buffer;
  must_change: 0 | 1;
}
interface Session {
  digest: string;
  username: string;
  mustChangePassword: boolean;
}

function passwordHash(password: string, salt: Buffer) {
  return derive('argon2id', {
    message: password,
    nonce: salt,
    parallelism: 1,
    tagLength: 32,
    memory: 19_456,
    passes: 2,
  });
}

function accounts(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portal_admin (
      id INTEGER PRIMARY KEY CHECK (id = 1), username TEXT NOT NULL,
      salt BLOB NOT NULL, hash BLOB NOT NULL, must_change INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_sessions (
      digest TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_auth_attempts (at INTEGER NOT NULL);
  `);
  return () =>
    db.prepare('SELECT username, salt, hash, must_change FROM portal_admin WHERE id = 1').get() as
      | Account
      | undefined;
}

export async function setAdministrator(
  db: Database,
  action: 'seed' | 'rotate',
  username: string,
  password: string,
) {
  if (
    !accountName.safeParse(username).success ||
    username !== username.trim() ||
    !newPassword.safeParse(password).success
  )
    throw new Error(
      'Use an administrator name of 3–128 characters and a password of 16–256 characters.',
    );
  const account = accounts(db);
  const salt = randomBytes(16);
  const hash = await passwordHash(password, salt);
  db.transaction(() => {
    const existing = account();
    if (action === 'seed' && existing)
      throw new Error('An administrator already exists. Use rotate for an intentional reset.');
    if (action === 'rotate' && !existing) throw new Error('Seed the administrator first.');
    db.prepare(`INSERT INTO portal_admin VALUES (1, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username, salt=excluded.salt,
      hash=excluded.hash, must_change=1`).run(username, salt, hash);
    db.exec('DELETE FROM portal_sessions; DELETE FROM portal_auth_attempts');
  }).immediate();
}

export function createAuth(db: Database, secure: boolean, now: () => number) {
  const account = accounts(db);
  const cookieName = secure ? '__Host-andhub-session' : 'andhub-loopback-session';
  const attributes = `Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  const sessionDigest = (value: string) => createHash('sha256').update(value).digest('hex');
  const dummySalt = randomBytes(16);
  let authenticating = false;

  function session(req: FastifyRequest): Session | undefined {
    const cookie = req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    if (!cookie || !/^[a-f0-9]{64}$/u.test(cookie)) return;
    const digest = sessionDigest(cookie);
    const current = db
      .prepare(`
      SELECT a.username, a.must_change FROM portal_sessions s CROSS JOIN portal_admin a
      WHERE s.digest = ? AND s.expires_at > ?
    `)
      .get(digest, now()) as Pick<Account, 'username' | 'must_change'> | undefined;
    if (current)
      return { digest, username: current.username, mustChangePassword: current.must_change === 1 };
  }

  function issue(reply: FastifyReply) {
    const cookie = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM portal_sessions WHERE expires_at <= ?').run(now());
    db.prepare(`DELETE FROM portal_sessions WHERE rowid IN
      (SELECT rowid FROM portal_sessions ORDER BY rowid DESC LIMIT -1 OFFSET 7)`).run();
    db.prepare('INSERT INTO portal_sessions VALUES (?, ?)').run(
      sessionDigest(cookie),
      now() + lifetime * 1000,
    );
    reply.header('set-cookie', `${cookieName}=${cookie}; ${attributes}; Max-Age=${lifetime}`);
  }

  async function check<T>(password: string, work: (existing: Account) => T): Promise<T> {
    if (authenticating) throw new RequestError(429, 'AUTH_RATE_LIMIT', 'Wait before trying again.');
    const allowed = db
      .transaction(() => {
        const time = now();
        db.prepare('DELETE FROM portal_auth_attempts WHERE at <= ?').run(time - 60_000);
        const { count } = db
          .prepare('SELECT count(*) AS count FROM portal_auth_attempts')
          .get() as { count: number };
        if (count >= 8) return false;
        db.prepare('INSERT INTO portal_auth_attempts VALUES (?)').run(time);
        return true;
      })
      .immediate();
    if (!allowed)
      throw new RequestError(429, 'AUTH_RATE_LIMIT', 'Wait a minute before trying again.');
    authenticating = true;
    try {
      const existing = account();
      const hash = await passwordHash(password, existing?.salt ?? dummySalt);
      if (!existing || !timingSafeEqual(existing.hash, hash))
        throw new RequestError(
          401,
          'INVALID_CREDENTIALS',
          'The administrator credentials were rejected.',
        );
      return await work(existing);
    } finally {
      authenticating = false;
    }
  }

  function assertCurrent(existing: Account) {
    const current = account();
    if (!current || !timingSafeEqual(current.hash, existing.hash)) throw unauthorized();
  }

  return {
    session,
    async login(req: FastifyRequest, reply: FastifyReply) {
      const input = loginInput.safeParse(req.body);
      if (!input.success)
        throw new RequestError(
          400,
          'INVALID_CREDENTIALS',
          'Enter an administrator name and password.',
        );
      return check(input.data.password, (existing) => {
        if (input.data.username !== existing.username)
          throw new RequestError(
            401,
            'INVALID_CREDENTIALS',
            'The administrator credentials were rejected.',
          );
        db.transaction(() => {
          assertCurrent(existing);
          issue(reply);
        }).immediate();
        return { mustChangePassword: existing.must_change === 1 };
      });
    },
    async change(req: FastifyRequest, reply: FastifyReply) {
      const active = session(req);
      if (!active) throw unauthorized();
      const input = passwordInput.safeParse(req.body);
      if (!input.success || input.data.current === input.data.password)
        throw new RequestError(
          400,
          'INVALID_PASSWORD',
          'Choose a different password of 16–256 characters.',
        );
      return check(input.data.current, async (existing) => {
        const salt = randomBytes(16);
        const hash = await passwordHash(input.data.password, salt);
        db.transaction(() => {
          assertCurrent(existing);
          if (!session(req)) throw unauthorized();
          db.prepare('UPDATE portal_admin SET salt=?, hash=?, must_change=0 WHERE id=1').run(
            salt,
            hash,
          );
          db.exec('DELETE FROM portal_sessions');
          issue(reply);
        }).immediate();
        return { mustChangePassword: false };
      });
    },
    logout(req: FastifyRequest, reply: FastifyReply) {
      const active = session(req);
      if (active) db.prepare('DELETE FROM portal_sessions WHERE digest = ?').run(active.digest);
      return reply
        .header('set-cookie', `${cookieName}=; ${attributes}; Max-Age=0`)
        .code(204)
        .send();
    },
  };
}
