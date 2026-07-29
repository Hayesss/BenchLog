import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS bioinfo_analyses (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      projectId bigint unsigned NULL,
      name varchar(255) NOT NULL,
      analysisDate varchar(10) NOT NULL,
      pipeline varchar(64) NOT NULL DEFAULT '手动脚本',
      inputData text NULL,
      repoUrl varchar(500) NULL,
      commitHash varchar(64) NULL,
      environment text NULL,
      command text NULL,
      status enum('running','done','failed') NOT NULL DEFAULT 'running',
      resultMd text NULL,
      conclusion text NULL,
      nextStep text NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY bioinfo_user_idx (userId),
      KEY bioinfo_project_idx (projectId)
    )
  `);
  const rows = await db.execute(sql`SHOW TABLES LIKE 'bioinfo_analyses'`);
  console.log("建表结果:", JSON.stringify(rows[0]));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
