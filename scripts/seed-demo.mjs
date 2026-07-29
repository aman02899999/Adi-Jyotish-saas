// Idempotent demo-account seeder for manual QA.
// Usage: DATABASE_URL=postgres://... node scripts/seed-demo.mjs
import { randomBytes, scryptSync } from "node:crypto";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const ADMIN_EMAIL = "admin@demo.jyotish.app";
const ADMIN_PASSWORD = "DemoAdmin2026!";
const MEMBER_EMAIL = "member@demo.jyotish.app";
const MEMBER_PASSWORD = "DemoMember2026!";
const WALLET_BALANCE = 2000; // INR, enough for several minutes of demo chat

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  const admin = await pool.query(
    `INSERT INTO admin_users (name, email, password_hash, role, active)
     VALUES ($1, $2, $3, 'owner', true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true
     RETURNING id`,
    ["Demo Admin", ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD)],
  );

  const member = await pool.query(
    `INSERT INTO member_users (name, email, password_hash, birth_date, birth_time, birth_place, onboarding_complete, active)
     VALUES ($1, $2, $3, '1990-01-15', '08:30', 'New Delhi, India', true, true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, onboarding_complete = true, active = true
     RETURNING id`,
    ["Demo Member", MEMBER_EMAIL, hashPassword(MEMBER_PASSWORD)],
  );
  const memberId = member.rows[0].id;

  await pool.query(
    `INSERT INTO wallets (member_id, currency, balance)
     VALUES ($1, 'INR', $2)
     ON CONFLICT (member_id) DO UPDATE SET balance = $2`,
    [memberId, WALLET_BALANCE],
  );

  const practitioner = await pool.query(
    `INSERT INTO practitioners (name, slug, email, title, bio, specialties, languages, consultation_modes, experience_years, verified, verification_level, active, featured, online, chat_rate_per_minute)
     VALUES ('Anika Sharma', 'anika-sharma', 'anika@jyotish.studio', 'Senior Vedic Astrologer',
       'Anika brings classical Parashari technique into grounded conversations about purpose, timing, and visible growth.',
       'Birth charts, Career & dharma, Planetary periods', 'English, Hindi, Sanskrit', 'Video, Audio, Chat', 14,
       true, 'senior-panel', true, true, true, 19)
     ON CONFLICT (slug) DO UPDATE SET online = true, active = true
     RETURNING id, name, chat_rate_per_minute`,
    [],
  );

  console.log("Demo accounts ready:\n");
  console.log(`  Admin    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}  (id ${admin.rows[0].id})`);
  console.log(`  Member   ${MEMBER_EMAIL} / ${MEMBER_PASSWORD}  (id ${memberId}, wallet balance INR ${WALLET_BALANCE})`);
  console.log(`  Practitioner online for chat: ${practitioner.rows[0].name} (id ${practitioner.rows[0].id}, INR ${practitioner.rows[0].chat_rate_per_minute}/min)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
