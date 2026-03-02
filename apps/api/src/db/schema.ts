import { pgTable, text, timestamp, integer, bigint, boolean, uuid } from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Sessions ────────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Servers ─────────────────────────────────────────────────────
export const servers = pgTable("servers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  directoryPath: text("directory_path").notNull(),
  port: integer("port").notNull().unique(),
  version: text("version").notNull().default("latest"),
  type: text("type").notNull().default("vanilla"), // vanilla, paper, fabric, forge
  memoryMb: integer("memory_mb").notNull().default(1024),
  statusCache: text("status_cache").default("unknown"), // running, stopped, error, unknown
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Backups ─────────────────────────────────────────────────────
export const backups = pgTable("backups", {
  id: uuid("id").defaultRandom().primaryKey(),
  serverId: uuid("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  filePath: text("file_path").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  isAuto: boolean("is_auto").default(false),
});

// ─── Type exports ────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type Backup = typeof backups.$inferSelect;
export type NewBackup = typeof backups.$inferInsert;
