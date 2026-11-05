CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  token_hash TEXT,
  token_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  unsubscribed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
CREATE TABLE IF NOT EXISTS notification_deliveries (
  poem_slug TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  provider_message_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (poem_slug, subscriber_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);
