import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

// 幂等建表：小鼠库存管理三表（mouse_strains 品系 / mouse_cages 笼位 / mice 个体），实跑后通过 information_schema 验证打印
async function main() {
  const db = getDb();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mouse_strains (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      name varchar(80) NOT NULL,
      background varchar(80) NULL,
      genotypeDesc varchar(200) NULL,
      maintenance varchar(24) NULL,
      color varchar(7) NOT NULL DEFAULT '#3E7C6B',
      lowStockThreshold int NOT NULL DEFAULT 0,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY mouse_strains_user_idx (userId)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mouse_cages (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      cageNo varchar(40) NOT NULL,
      room varchar(60) NULL,
      rack varchar(60) NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY mouse_cages_user_idx (userId)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mice (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      strainId bigint unsigned NOT NULL,
      earNo varchar(40) NOT NULL,
      gender varchar(8) NOT NULL DEFAULT 'unknown',
      birthDate varchar(10) NULL,
      genotype varchar(40) NULL,
      cageId bigint unsigned NULL,
      source varchar(24) NULL,
      status varchar(12) NOT NULL DEFAULT 'alive',
      statusDate varchar(10) NULL,
      statusReason varchar(200) NULL,
      notes varchar(500) NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY mice_strain_earno_uidx (userId, strainId, earNo),
      KEY mice_user_strain_idx (userId, strainId),
      KEY mice_user_status_idx (userId, status)
    )
  `);

  for (const table of ["mouse_strains", "mouse_cages", "mice"]) {
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
