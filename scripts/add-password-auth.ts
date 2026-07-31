// 幂等迁移：users 表新增 passwordHash 列（本地账号密码登录）
// 用法：npx tsx scripts/add-password-auth.ts
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'passwordHash'
  `);
  const cnt = Number((rows[0] as unknown as { cnt: number }[])[0]?.cnt ?? 0);
  if (cnt > 0) {
    console.log("[migrate] users.passwordHash 已存在，跳过");
    return;
  }
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN passwordHash varchar(255) NULL AFTER avatar
  `);
  console.log("[migrate] users.passwordHash 添加完成");
}

main().catch((err) => {
  console.error("[migrate] 失败：", err);
  process.exit(1);
});
