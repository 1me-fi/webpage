PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS surveys (
 id INTEGER PRIMARY KEY,
 public_token TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 organisation TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('draft','open','closed')),
 definition_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 published_at TEXT,
 closed_at TEXT
);
CREATE TABLE IF NOT EXISTS submissions (
 id INTEGER PRIMARY KEY,
 survey_id INTEGER NOT NULL REFERENCES surveys(id),
 idempotency_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 first_name TEXT NOT NULL,
 feedback TEXT NOT NULL,
 submitted_at TEXT NOT NULL,
 UNIQUE(survey_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS answers (
 submission_id INTEGER NOT NULL REFERENCES submissions(id),
 question_id TEXT NOT NULL,
 option_id TEXT NOT NULL CHECK(option_id IN ('basics','refresh','sufficient','not_needed','unsure')),
 team_need_flag INTEGER NOT NULL CHECK(team_need_flag IN (0,1)),
 PRIMARY KEY(submission_id,question_id)
);
CREATE TABLE IF NOT EXISTS rate_limits (
 bucket TEXT PRIMARY KEY,
 window_start INTEGER NOT NULL,
 count INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS immutable_published_definition
BEFORE UPDATE OF definition_json,title,organisation,public_token ON surveys
WHEN OLD.published_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Published survey is immutable'); END;
