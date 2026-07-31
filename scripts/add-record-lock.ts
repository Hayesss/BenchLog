// 幂等迁移：records 表新增 lockedAt / lockedNote 列（签署锁定，Benchling 式 review lock 简化版）
// 用法：npx tsx scripts/add-record-lock.ts
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function hasColumn(db: ReturnType<typeof getDb>, name: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'records'
      AND COLUMN_NAME = ${name}
  `);
  return Number((rows[0] as unknown as { cnt: number }[])[0]?.cnt ?? 0) > 0;
}

async function main() {
  const db = getDb();
  if (!(await hasColumn(db, "lockedAt"))) {
    await db.execute(sql`ALTER TABLE records ADD COLUMN lockedAt timestamp NULL`);
    console.log("[migrate] records.lockedAt 添加完成");
  } else {
    console.log("[migrate] records.lockedAt 已存在，跳过");
  }
  if (!(await hasColumn(db, "lockedNote"))) {
    await db.execute(sql`ALTER TABLE records ADD COLUMN lockedNote varchar(255) NULL`);
    console.log("[migrate] records.lockedNote 添加完成");
  } else {
    console.log("[migrate] records.lockedNote 已存在，跳过");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] 失败：", err);
  process.exit(1);
});
