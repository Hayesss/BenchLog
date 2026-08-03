/**
 * 批次#21：teams / team_members / team_shares 三表（幂等）。
 * 已存在则跳过；建完用 information_schema 验证。
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

const db = getDb();

const DDL = [
  `CREATE TABLE IF NOT EXISTS teams (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    ownerId BIGINT UNSIGNED NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX teams_owner_idx (ownerId)
  )`,
  `CREATE TABLE IF NOT EXISTS team_members (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    teamId BIGINT UNSIGNED NOT NULL,
    memberId BIGINT UNSIGNED NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX team_members_unique (teamId, memberId),
    INDEX team_members_member_idx (memberId)
  )`,
  `CREATE TABLE IF NOT EXISTS team_shares (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    teamId BIGINT UNSIGNED NOT NULL,
    ownerId BIGINT UNSIGNED NOT NULL,
    kind ENUM('mouseStock','record','protocol','analysis') NOT NULL,
    role ENUM('viewer','editor') NOT NULL DEFAULT 'viewer',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX team_shares_unique (teamId, ownerId, kind),
    INDEX team_shares_owner_idx (ownerId, kind)
  )`,
];

for (const ddl of DDL) {
  await db.execute(sql.raw(ddl));
}

for (const t of ["teams", "team_members", "team_shares"]) {
  const rows = await db.execute(
    sql`SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${t}`,
  );
  const ok = ((Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{ t: string }>).length > 0;
  if (!ok) throw new Error(`${t} 建表验证失败`);
  console.log(`${t} 表就绪`);
}
process.exit(0);
