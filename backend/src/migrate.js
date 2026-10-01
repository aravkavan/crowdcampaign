// The database schema. Every statement uses IF NOT EXISTS, so this runs safely on
// every server start: a brand-new empty database gets all its tables automatically.
import { withTransaction } from './db.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  -- Bumped on password change; tokens carrying an older number stop working.
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness: "Alice" and "alice" are the same account.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci ON users (lower(email));

CREATE TABLE IF NOT EXISTS campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand        TEXT NOT NULL,
  title        TEXT NOT NULL,
  brief        TEXT NOT NULL,
  prize        TEXT NOT NULL,
  deadline     TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_organizer_idx ON campaigns (organizer_id);

CREATE TABLE IF NOT EXISTS submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  is_winner   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One idea per person per campaign.
  CONSTRAINT submissions_one_per_author UNIQUE (campaign_id, author_id)
);
-- At most one winner per campaign, enforced by the database itself.
CREATE UNIQUE INDEX IF NOT EXISTS submissions_one_winner ON submissions (campaign_id) WHERE is_winner;
CREATE INDEX IF NOT EXISTS submissions_author_idx ON submissions (author_id);

-- The AI layer writes here and nowhere else. If this table were empty the app
-- would still work; only the shortlist would be missing.
CREATE TABLE IF NOT EXISTS evaluations (
  submission_id       UUID PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  creativity          SMALLINT NOT NULL CHECK (creativity BETWEEN 1 AND 10),
  relevance           SMALLINT NOT NULL CHECK (relevance BETWEEN 1 AND 10),
  feasibility         SMALLINT NOT NULL CHECK (feasibility BETWEEN 1 AND 10),
  marketing_potential SMALLINT NOT NULL CHECK (marketing_potential BETWEEN 1 AND 10),
  overall             REAL NOT NULL,
  summary             TEXT NOT NULL,
  method              TEXT NOT NULL,
  evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function migrate() {
  await withTransaction(async (client) => {
    // If the server and the seed script start at the same moment, this lock makes
    // one wait for the other instead of both creating tables at once.
    await client.query('SELECT pg_advisory_xact_lock(20260924)');
    await client.query(SCHEMA);
  });
}
