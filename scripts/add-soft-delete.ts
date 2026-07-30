import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

/**
 * 幂等迁移：
 *  - records / protocols 加 deleted_at（软删除回收站）
 *  - records / protocols / projects 加 is_demo（示例数据标记）
 * 先查 information_schema 判断列是否存在，可重复执行。
 */

type ColDef = { table: string; column: string; ddl: string };

const COLS: ColDef[] = [
  { table: "records", column: "deleted_at", ddl: "ALTER TABLE records ADD COLUMN deleted_at timestamp NULL DEFAULT NULL" },
  { table: "protocols", column: "deleted_at", ddl: "ALTER TABLE protocols ADD COLUMN deleted_at timestamp NULL DEFAULT NULL" },
  { table: "records", column: "is_demo", ddl: "ALTER TABLE records ADD COLUMN is_demo tinyint(1) NOT NULL DEFAULT 0" },
  { table: "protocols", column: "is_demo", ddl: "ALTER TABLE protocols ADD COLUMN is_demo tinyint(1) NOT NULL DEFAULT 0" },
  { table: "projects", column: "is_demo", ddl: "ALTER TABLE projects ADD COLUMN is_demo tinyint(1) NOT NULL DEFAULT 0" },
];

async function columnExists(db: ReturnType<typeof getDb>, table: string, column: string) {
  const rows = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `);
  const first = (rows[0] as unknown as { cnt: number | string }[])[0];
  return Number(first?.cnt ?? 0) > 0;
}

async function main() {
  const db = getDb();
  for (const c of COLS) {
    if (await columnExists(db, c.table, c.column)) {
      console.log(`已存在，跳过: ${c.table}.${c.column}`);
      continue;
    }
    await db.execute(sql.raw(c.ddl));
    console.log(`已添加: ${c.table}.${c.column}`);
  }
  // 验证：回读各表目标列
  for (const c of COLS) {
    const ok = await columnExists(db, c.table, c.column);
    console.log(`验证 ${c.table}.${c.column}: ${ok ? "OK" : "MISSING"}`);
    if (!ok) throw new Error(`列添加失败: ${c.table}.${c.column}`);
  }
  console.log("迁移完成");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
