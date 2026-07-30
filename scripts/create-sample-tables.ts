import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

// 幂等建表：样本管理两表（sample_boxes 冻存盒 / samples 孔位样本），实跑后通过 information_schema 验证打印
async function main() {
  const db = getDb();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sample_boxes (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      projectId bigint unsigned NOT NULL,
      name varchar(80) NOT NULL,
      location varchar(80) NULL,
      \`rows\` int NOT NULL DEFAULT 8,
      cols int NOT NULL DEFAULT 12,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY sample_boxes_user_project_idx (userId, projectId)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS samples (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      boxId bigint unsigned NOT NULL,
      \`row\` int NOT NULL,
      col int NOT NULL,
      name varchar(120) NOT NULL,
      type varchar(24) NOT NULL DEFAULT '其他',
      concentration varchar(40) NULL,
      volume varchar(40) NULL,
      sampleDate varchar(10) NULL,
      notes varchar(500) NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY samples_box_slot_uidx (boxId, \`row\`, col),
      KEY samples_user_idx (userId)
    )
  `);

  for (const table of ["sample_boxes", "samples"]) {
    const cols = await db.execute(sql`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
      WHERE TABLE_NAME = ${table} ORDER BY ORDINAL_POSITION
    `);
    console.log(`表结构 ${table}:`, JSON.stringify(cols[0]));
    const idx = await db.execute(sql`
      SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX FROM information_schema.STATISTICS
      WHERE TABLE_NAME = ${table} ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `);
    console.log(`索引 ${table}:`, JSON.stringify(idx[0]));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
