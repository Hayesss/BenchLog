/**
 * shares 表（只读分享链接）：幂等建表 + information_schema 验证。
 * 运行：npx tsx scripts/create-shares-table.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shares (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      token varchar(32) NOT NULL,
      userId bigint unsigned NOT NULL,
      kind enum('record','analysis') NOT NULL,
      targetId bigint unsigned NOT NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revokedAt timestamp NULL,
      PRIMARY KEY (id),
      UNIQUE KEY shares_token_unique (token),
      KEY shares_user_idx (userId),
      KEY shares_target_idx (kind, targetId)
    )
  `);
  const rows = await db.execute(sql`
    SELECT TABLE_NAME AS t FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shares'
  `);
  const ok = ((Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{ t: string }>).length > 0;
  console.log(ok ? "CREATE TABLE shares: OK" : "CREATE TABLE shares: FAIL");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
