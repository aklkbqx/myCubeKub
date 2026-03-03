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
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
  autoBackupEnabled: boolean("auto_backup_enabled").notNull().default(false),
  autoBackupIntervalHours: integer("auto_backup_interval_hours").notNull().default(24),
  autoBackupRetentionCount: integer("auto_backup_retention_count").notNull().default(5),
  lastAutoBackupAt: timestamp("last_auto_backup_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Backups ─────────────────────────────────────────────────────
export const backups = pgTable("backups", {
  id: uuid("id").defaultRandom().primaryKey(),
  serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  filePath: text("file_path").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  isAuto: boolean("is_auto").default(false),
});

// ─── Resource Packs ─────────────────────────────────────────────
export const resourcePacks = pgTable("resource_packs", {
  id: uuid("id").defaultRandom().primaryKey(),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  originalFilename: text("original_filename").notNull(),
  storedFilename: text("stored_filename").notNull(),
  filePath: text("file_path").notNull(),
  imageFilename: text("image_filename"),
  imagePublicPath: text("image_public_path"),
  sha1: text("sha1").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const resourcePackBuilds = pgTable("resource_pack_builds", {
  id: uuid("id").defaultRandom().primaryKey(),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  generatedFilename: text("generated_filename").notNull(),
  filePath: text("file_path").notNull(),
  publicPath: text("public_path").notNull(),
  imageFilename: text("image_filename"),
  imagePublicPath: text("image_public_path"),
  sha1: text("sha1").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  conflictCount: integer("conflict_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const resourcePackBuildItems = pgTable("resource_pack_build_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildId: uuid("build_id").notNull().references(() => resourcePackBuilds.id, { onDelete: "cascade" }),
  packId: uuid("pack_id").notNull().references(() => resourcePacks.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
export type ResourcePack = typeof resourcePacks.$inferSelect;
export type NewResourcePack = typeof resourcePacks.$inferInsert;
export type ResourcePackBuild = typeof resourcePackBuilds.$inferSelect;
export type NewResourcePackBuild = typeof resourcePackBuilds.$inferInsert;
export type ResourcePackBuildItem = typeof resourcePackBuildItems.$inferSelect;
export type NewResourcePackBuildItem = typeof resourcePackBuildItems.$inferInsert;
