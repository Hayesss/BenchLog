// 幂等迁移：record_templates 表（实验记录模板：正文/purpose/tags 预填）
// 用法：npx tsx scripts/create-record-templates-table.ts
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS record_templates (
      id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      name varchar(120) NOT NULL,
      contentHtml longtext NULL,
      purpose text NULL,
      tags json NOT NULL,
      useCount int NOT NULL DEFAULT 0,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_rt_user (userId)
    )
  `);
  console.log("[migrate] record_templates 就绪");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] 失败：", err);
  process.exit(1);
});
