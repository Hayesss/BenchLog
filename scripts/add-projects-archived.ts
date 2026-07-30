/**
 * projects 表加归档列 archived（幂等：先查 information_schema 再 ALTER）
 * 运行：npx tsx scripts/add-projects-archived.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function columnExists(): Promise<boolean> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'projects'
      AND COLUMN_NAME = 'archived'
  `);
  // mysql2: rows[0] 为结果行数组
  const list = (Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{ cnt: number | string }>;
  return Number(list[0]?.cnt ?? 0) > 0;
}

async function main() {
  const db = getDb();
  if (await columnExists()) {
    console.log("SKIP: projects.archived 已存在，无需变更");
  } else {
    await db.execute(
      sql`ALTER TABLE projects ADD COLUMN archived tinyint(1) NOT NULL DEFAULT 0`,
    );
    console.log("ALTER: projects.archived 已添加 (tinyint(1) NOT NULL DEFAULT 0)");
  }
  // 验证：复读 information_schema 并抽查一行数据
  const ok = await columnExists();
  console.log("验证 information_schema:", ok ? "archived 列存在" : "archived 列缺失（异常）");
  const sample = await db.execute(sql`SELECT id, name, archived FROM projects LIMIT 3`);
  const rows = (Array.isArray(sample) ? sample[0] : sample) as unknown as unknown[];
  console.log("抽查数据:", JSON.stringify(rows));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
