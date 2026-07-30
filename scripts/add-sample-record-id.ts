/**
 * samples 表加 recordId 列（关联实验记录；幂等）
 * 运行：npx tsx scripts/add-sample-record-id.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function columnExists(): Promise<boolean> {
  const rows = await getDb().execute(sql`
    SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'samples' AND COLUMN_NAME = 'recordId'
  `);
  const list = (Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{ cnt: number | string }>;
  return Number(list[0]?.cnt ?? 0) > 0;
}

async function main() {
  if (await columnExists()) {
    console.log("SKIP: samples.recordId 已存在");
  } else {
    await getDb().execute(sql`ALTER TABLE samples ADD COLUMN recordId bigint unsigned NULL`);
    console.log("ALTER: samples.recordId 已添加 (bigint unsigned NULL)");
  }
  const ok = await columnExists();
  console.log("验证 information_schema:", ok ? "recordId 列存在" : "recordId 列缺失（异常）");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
