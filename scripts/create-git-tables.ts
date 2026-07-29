/**
 * 站内 Git 对象库建表（直接 SQL，绕过 drizzle-kit push 的交互确认）
 * 运行：npx tsx scripts/create-git-tables.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function main() {
  const db = getDb();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS git_blobs (
      sha varchar(40) NOT NULL,
      userId bigint unsigned NOT NULL,
      content longtext NOT NULL,
      size int NOT NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (sha)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS git_trees (
      sha varchar(40) NOT NULL,
      userId bigint unsigned NOT NULL,
      entries json NOT NULL,
      fileCount int NOT NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (sha)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS git_commits (
      sha varchar(40) NOT NULL,
      userId bigint unsigned NOT NULL,
      analysisId bigint unsigned NOT NULL,
      parentSha varchar(40) NULL,
      treeSha varchar(40) NOT NULL,
      message text NOT NULL,
      authorName varchar(100) NOT NULL DEFAULT 'BenchLog',
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (sha)
    )
  `);
  await db.execute(sql`CREATE INDEX git_commits_analysis_idx ON git_commits (analysisId)`).catch(() => {});
  await db.execute(sql`CREATE INDEX git_commits_user_idx ON git_commits (userId)`).catch(() => {});

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS git_refs (
      analysisId bigint unsigned NOT NULL,
      userId bigint unsigned NOT NULL,
      headSha varchar(40) NOT NULL,
      commitCount int NOT NULL DEFAULT 1,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (analysisId)
    )
  `);

  console.log("OK: git_blobs / git_trees / git_commits / git_refs 已就绪");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
