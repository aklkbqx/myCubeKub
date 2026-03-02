import { db, schema } from "./index";

async function seed() {
  console.log("🌱 Seeding database...");

  const passwordHash = await Bun.password.hash("admin", 'argon2id');

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
