// 幂等迁移：records 表新增 contentHtml 列（Benchling 式富文本正文，LONGTEXT）
// 用法：npx tsx scripts/add-record-content-html.ts
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'records'
      AND COLUMN_NAME = 'contentHtml'
  `);
  const cnt = Number((rows[0] as unknown as { cnt: number }[])[0]?.cnt ?? 0);
  if (cnt > 0) {
    console.log("[migrate] records.contentHtml 已存在，跳过");
    process.exit(0);
  }
  await db.execute(sql`
    ALTER TABLE records ADD COLUMN contentHtml longtext NULL AFTER resultMd
  `);
  console.log("[migrate] records.contentHtml 添加完成");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] 失败：", err);
  process.exit(1);
});
