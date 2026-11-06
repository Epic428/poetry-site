CREATE TABLE IF NOT EXISTS notification_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS poem_announcements (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('baseline','active'))
);
