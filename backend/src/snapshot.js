// Durable copy of the SQLite database in Postgres (Neon), because Render's free disk is wiped on every
// deploy, restart and sleep. Boot: restore the latest snapshot before the DB opens. Running: save every 20 s
// when something changed, and once more on SIGTERM (Render stops the old instance on deploy).
// ponytail: whole-file snapshots, fine for a demo-sized DB (MBs). Move the app to Postgres proper before real scale;
// up to ~20 s of writes can be lost if the instance dies hard.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const URL = process.env.DATABASE_URL;
const FILE = process.env.KREWZO_DB || path.join(import.meta.dirname, '..', 'data', 'krewzo.db');
const pool = URL ? new pg.Pool({ connectionString: URL, ssl: { rejectUnauthorized: false }, max: 2 }) : null;

export async function restoreSnapshot() {
  if (!pool || FILE === ':memory:') return;
  await pool.query('CREATE TABLE IF NOT EXISTS krewzo_snapshot (id INT PRIMARY KEY, data BYTEA NOT NULL, saved_at TIMESTAMPTZ NOT NULL)');
  const { rows } = await pool.query('SELECT data, saved_at FROM krewzo_snapshot WHERE id = 1');
  if (!rows[0]) return console.log('snapshot: none yet, starting fresh');
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  for (const f of [FILE, FILE + '-wal', FILE + '-shm']) fs.rmSync(f, { force: true });
  fs.writeFileSync(FILE, rows[0].data);
  console.log(`snapshot: restored ${rows[0].data.length} bytes from ${rows[0].saved_at.toISOString()}`);
}

export async function startSnapshots() {
  if (!pool || FILE === ':memory:') return;
  const { db } = await import('./db.js'); // only after restore: importing opens the database
  let saved = -1, busy = false;
  const save = async (force) => {
    const n = db.prepare('SELECT total_changes() AS n').get().n;
    if (busy || (!force && n === saved)) return;
    busy = true;
    const tmp = FILE + '.snap';
    try {
      fs.rmSync(tmp, { force: true });
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); // consistent copy, WAL included
      await pool.query(`INSERT INTO krewzo_snapshot (id, data, saved_at) VALUES (1, $1, now())
        ON CONFLICT (id) DO UPDATE SET data = excluded.data, saved_at = excluded.saved_at`, [fs.readFileSync(tmp)]);
      saved = n;
    } catch (e) { console.error('snapshot save failed', e.message); }
    finally { busy = false; fs.rmSync(tmp, { force: true }); }
  };
  setInterval(save, 20e3).unref();
  setTimeout(() => save(true), 5e3).unref(); // first save right after boot (covers a fresh seed)
  process.once('SIGTERM', async () => { busy = false; await save(true); process.exit(0); });
}
