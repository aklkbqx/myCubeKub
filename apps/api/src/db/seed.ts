/**
 * Seed script — creates default admin user
 * Run: bun run src/db/seed.ts
 */
import { db, schema } from "./index";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("🌱 Seeding database...");

  // Create admin user
  const passwordHash = await bcrypt.hash("admin", 10);

  const [user] = await db
    .insert(schema.users)
    .values({
      username: "admin",
      passwordHash,
    })
    .onConflictDoNothing()
    .returning();

  if (user) {
    console.log(`✅ Created admin user: ${user.username} (password: admin)`);
  } else {
    console.log("ℹ️ Admin user already exists, skipping.");
  }

  console.log("🌱 Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
