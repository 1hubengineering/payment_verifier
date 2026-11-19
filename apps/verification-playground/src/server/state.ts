import { randomBytes } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import type { ProviderId } from '@1hubengineering/verifier';
import type { Draft, HistoryItem, Mode, Report, SavedDraft } from '../contracts.ts';

interface Scenario {
  id: string;
  mode: Mode;
  provider: ProviderId;
}
type Attempt = Omit<HistoryItem, 'startedAt' | 'report'> & {
  started: number;
  binding: string;
  report: string | null;
};

function historyItem(row: Attempt): HistoryItem {
  const { mode, paymentId, attemptId, provider, started, mockCase, inputProvider, report } = row;
  return {
    mode,
    paymentId,
    attemptId,
    provider,
    startedAt: new Date(started).toISOString(),
    mockCase,
    inputProvider,
    report: report === null ? null : (JSON.parse(report) as Report),
  };
}

export function createState(db: Database, retentionMs: number) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS playground_settings (id INTEGER PRIMARY KEY, secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS playground_drafts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, draft TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playground_scenarios (
      id TEXT PRIMARY KEY, mode TEXT NOT NULL, provider TEXT NOT NULL, created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playground_attempts (
      attemptId TEXT PRIMARY KEY, paymentId TEXT NOT NULL, mode TEXT NOT NULL,
      provider TEXT NOT NULL, started INTEGER NOT NULL, binding TEXT NOT NULL,
      mockCase TEXT NOT NULL, inputProvider TEXT NOT NULL, report TEXT
    );
    CREATE INDEX IF NOT EXISTS playground_attempts_started ON playground_attempts (started);
    CREATE INDEX IF NOT EXISTS playground_attempts_payment ON playground_attempts (paymentId);
  `);
  db.prepare('INSERT OR IGNORE INTO playground_settings VALUES (1, ?)').run(
    randomBytes(32).toString('hex'),
  );
  const { secret } = db.prepare('SELECT secret FROM playground_settings WHERE id = 1').get() as {
    secret: string;
  };

  return {
    secret,
    prune(now: number) {
      const cutoff = now - retentionMs;
      db.transaction(() => {
        db.prepare('DELETE FROM playground_attempts WHERE started < ?').run(cutoff);
        db.prepare(`DELETE FROM playground_scenarios WHERE created < ?
          AND NOT EXISTS (SELECT 1 FROM playground_attempts WHERE paymentId = playground_scenarios.id)`).run(
          cutoff,
        );
      })();
    },
    scenario(id: string): Scenario | undefined {
      return db
        .prepare('SELECT id, mode, provider FROM playground_scenarios WHERE id = ?')
        .get(id) as Scenario | undefined;
    },
    addScenario(scenario: Scenario, now: number) {
      db.prepare('INSERT INTO playground_scenarios VALUES (?, ?, ?, ?)').run(
        scenario.id,
        scenario.mode,
        scenario.provider,
        now,
      );
    },
    attempt(id: string): Attempt | undefined {
      return db.prepare('SELECT * FROM playground_attempts WHERE attemptId = ?').get(id) as
        | Attempt
        | undefined;
    },
    addAttempt(value: Omit<Attempt, 'report'>) {
      db.prepare(`INSERT INTO playground_attempts
        (attemptId, paymentId, mode, provider, started, binding, mockCase, inputProvider)
        VALUES (@attemptId, @paymentId, @mode, @provider, @started, @binding, @mockCase, @inputProvider)`).run(
        value,
      );
    },
    finish(report: Report) {
      db.prepare('UPDATE playground_attempts SET report = ? WHERE attemptId = ?').run(
        JSON.stringify(report),
        report.attemptId,
      );
    },
    history() {
      return (
        db
          .prepare('SELECT * FROM playground_attempts ORDER BY started DESC, rowid DESC LIMIT 100')
          .all() as Attempt[]
      ).map(historyItem);
    },
    detail(id: string) {
      const row = this.attempt(id);
      return row && historyItem(row);
    },
    drafts(): SavedDraft[] {
      const rows = db.prepare('SELECT * FROM playground_drafts ORDER BY rowid DESC').all() as (Omit<
        SavedDraft,
        'draft'
      > & { draft: string })[];
      return rows.map((row) => ({ ...row, draft: JSON.parse(row.draft) as Draft }));
    },
    saveDraft(value: SavedDraft) {
      db.prepare(`INSERT INTO playground_drafts VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, draft = excluded.draft`).run(
        value.id,
        value.name,
        JSON.stringify(value.draft),
      );
    },
    deleteDraft(id: string) {
      db.prepare('DELETE FROM playground_drafts WHERE id = ?').run(id);
    },
  };
}
