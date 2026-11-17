import type { Migration } from '../types';

/** Key/value facts about the database itself (when and by which app version it was created). */
export const migration001: Migration = {
  version: 1,
  name: 'app-meta',
  up(db) {
    db.exec(`
      CREATE TABLE app_meta (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      ) STRICT;
    `);
    db.prepare(`INSERT INTO app_meta (key, value) VALUES ('created_at', ?)`).run(
      new Date().toISOString(),
    );
  },
};
