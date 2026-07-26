-- Single system of record: one row per app record, JSON payload.
-- Same document shape the app already uses, now with Postgres as the
-- ONLY authority — devices hold PowerSync-managed replicas.
CREATE TABLE records (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX records_company_idx ON records (company_id);

-- PowerSync bucket storage lives in its own database
CREATE DATABASE powersync_storage;
