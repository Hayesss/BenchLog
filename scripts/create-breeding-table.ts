/**
 * 小鼠配种对表 mouse_breeding（幂等：CREATE TABLE IF NOT EXISTS + information_schema 验证）
 * 运行：npx tsx scripts/create-breeding-table.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mouse_breeding (
      id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      strainId bigint unsigned NOT NULL,
      maleId bigint unsigned NOT NULL,
      femaleId bigint unsigned NOT NULL,
      cageId bigint unsigned NULL,
      startDate varchar(10) NOT NULL,
      status varchar(12) NOT NULL DEFAULT 'active',
      endDate varchar(10) NULL,
      endReason varchar(200) NULL,
      litters int NOT NULL DEFAULT 0,
      notes varchar(500) NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX breeding_user_idx (userId),
      INDEX breeding_strain_idx (strainId)
    )
  `);
  const chk = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mouse_breeding'
  `);
  const list = (Array.isArray(chk) ? chk[0] : chk) as unknown as Array<{ cnt: number | string }>;
  const ok = Number(list[0]?.cnt ?? 0) > 0;
  console.log(ok ? "OK: mouse_breeding 表已就绪" : "FAIL: mouse_breeding 表缺失");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
