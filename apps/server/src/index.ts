import express from 'express';
import cors from 'cors';
import { authRouter, ensureAdminUser } from './auth.js';
import { syncRouter } from './sync.js';
import { usersRouter } from './users.js';

const app = express();
app.use(cors());
// Payloads carry base64 blobs (signatures, map snapshots, printout photos)
app.use(express.json({ limit: '30mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'shotlog-sync', time: new Date().toISOString() });
});

app.use('/auth', authRouter);
app.use('/sync', syncRouter);
app.use('/users', usersRouter);

const port = Number(process.env.PORT ?? 4000);

async function main() {
  await ensureAdminUser();
  app.listen(port, () => {
    console.log(`ShotLog sync server listening on :${port}`);
  });
}

void main();
