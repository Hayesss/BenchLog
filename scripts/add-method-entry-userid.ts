/**
 * method_entries 表加 userId 列（null=预置全局条目，非 null=用户自建；幂等）
 * 运行：npx tsx scripts/add-method-entry-userid.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function columnExists(): Promise<boolean> {
  const rows = await getDb().execute(sql`
    SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'method_entries' AND COLUMN_NAME = 'userId'
  `);
  const list = (Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{ cnt: number | string }>;
  return Number(list[0]?.cnt ?? 0) > 0;
}

async function main() {
  if (await columnExists()) {
    console.log("SKIP: method_entries.userId 已存在");
  } else {
    await getDb().execute(
      sql`ALTER TABLE method_entries ADD COLUMN userId bigint unsigned NULL AFTER entryId`,
    );
    console.log("ALTER: method_entries.userId 已添加 (bigint unsigned NULL)");
  }
  const ok = await columnExists();
  console.log("验证 information_schema:", ok ? "userId 列存在" : "userId 列缺失（异常）");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
