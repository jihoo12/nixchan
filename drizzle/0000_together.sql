CREATE TABLE island_saves (owner TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, write_id TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE island_presence (
 owner TEXT NOT NULL, session TEXT NOT NULL, seen INTEGER NOT NULL,
 x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, yaw REAL NOT NULL, pose TEXT NOT NULL,
 PRIMARY KEY (owner, session)
);
--> statement-breakpoint
CREATE INDEX island_presence_seen ON island_presence(seen);
