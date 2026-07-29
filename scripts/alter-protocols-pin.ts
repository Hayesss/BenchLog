/**
 * protocols 表加星标置顶列（直接 SQL，绕过 drizzle-kit push 交互确认）
 * 运行：npx tsx scripts/alter-protocols-pin.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function main() {
  const db = getDb();
  await db.execute(sql`ALTER TABLE protocols ADD COLUMN pinned tinyint(1) NOT NULL DEFAULT 0`).catch((e) => {
    if (!String(e).includes("Duplicate column")) throw e;
  });
  await db.execute(sql`ALTER TABLE protocols ADD COLUMN pinnedAt timestamp NULL`).catch((e) => {
    if (!String(e).includes("Duplicate column")) throw e;
  });
  console.log("OK: protocols.pinned / protocols.pinnedAt 已就绪");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
