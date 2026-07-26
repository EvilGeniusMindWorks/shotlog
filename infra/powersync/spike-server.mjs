// Spike backend: issues PowerSync JWTs and applies client write-queues to
// Postgres — the server is the only writer, so ordering is authoritative and
// device clocks are irrelevant. ~60 lines replacing the entire custom sync
// engine's write path.
import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const SECRET = 'spike-shared-secret-for-local-dev-only';
const KID = 'shotlog-spike';
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:spikepass@localhost:5434/shotlog',
});

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function signToken(userId, companyId) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: KID }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({ sub: userId, cid: companyId, aud: 'powersync', iat: now, exp: now + 3600 }),
  );
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();

  if (req.url === '/token') {
    // Spike: fixed identity. Real version: derived from the app session.
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ token: signToken('spike-user', 'spike-co') }));
  }

  if (req.url === '/upload' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { ops } = JSON.parse(body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const op of ops) {
        if (op.op === 'PUT' || op.op === 'PATCH') {
          await client.query(
            `INSERT INTO records (id, company_id, table_name, payload, updated_at)
             VALUES ($1, 'spike-co', $2, $3, $4)
             ON CONFLICT (id) DO UPDATE SET
               table_name = EXCLUDED.table_name,
               payload = COALESCE(EXCLUDED.payload, records.payload),
               updated_at = EXCLUDED.updated_at`,
            [op.id, op.data.table_name ?? '', op.data.payload ?? null, new Date().toISOString()],
          );
        } else if (op.op === 'DELETE') {
          await client.query('DELETE FROM records WHERE id = $1', [op.id]);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: String(err) }));
    } finally {
      client.release();
    }
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  }

  res.statusCode = 404;
  res.end('not found');
});

server.listen(4100, () => console.log('spike backend on :4100'));
