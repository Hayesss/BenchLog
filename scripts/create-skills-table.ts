/**
 * 生信技能库建表（直接 SQL，绕过 drizzle-kit push 交互确认）
 * 运行：npx tsx scripts/create-skills-table.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS bioinfo_skills (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      title varchar(255) NOT NULL,
      category varchar(64) NOT NULL DEFAULT '其他',
      language varchar(32) NOT NULL DEFAULT 'Bash',
      summary text NULL,
      code longtext NOT NULL,
      source varchar(500) NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )
  `);
  await db.execute(sql`CREATE INDEX bioinfo_skills_user_idx ON bioinfo_skills (userId)`).catch(() => {});
  console.log("OK: bioinfo_skills 已就绪");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
