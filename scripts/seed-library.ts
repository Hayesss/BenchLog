/**
 * 方法库种子脚本：读取 api/seed/methods.json，重建 method_chapters / method_entries。
 * 幂等 —— 先清空两表再批量写入，可重复运行。
 *
 * 运行：npx tsx scripts/seed-library.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../api/queries/connection";
import { methodChapters, methodEntries } from "@db/schema";

interface SeedChapter {
  chapterNo: number;
  title: string;
}

interface SeedEntry {
  id: number;
  chapterNo: number;
  section: string;
  nameCn: string;
  nameEn: string;
  type: string;
  source: string;
  journal: string;
  year: string;
  doi: string;
  refNum: number | null;
  steps: string[];
  purpose: string;
  principle: string;
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const data = JSON.parse(
    readFileSync(join(here, "../api/seed/methods.json"), "utf-8"),
  ) as { chapters: SeedChapter[]; entries: SeedEntry[] };

  const db = getDb();

  await db.delete(methodEntries);
  await db.delete(methodChapters);

  await db.insert(methodChapters).values(
    data.chapters.map((c) => ({ chapterNo: c.chapterNo, title: c.title })),
  );

  const CHUNK = 50;
  for (let i = 0; i < data.entries.length; i += CHUNK) {
    await db.insert(methodEntries).values(
      data.entries.slice(i, i + CHUNK).map((e) => ({
        entryId: e.id,
        chapterNo: e.chapterNo,
        section: e.section ?? "",
        nameCn: (e.nameCn ?? "").slice(0, 255),
        nameEn: (e.nameEn ?? "").slice(0, 255),
        type: e.type === "pointer" ? "pointer" : "full",
        source: e.source ?? "",
        journal: (e.journal ?? "").slice(0, 64),
        year: e.year ?? "",
        doi: e.doi ?? "",
        steps: Array.isArray(e.steps) ? e.steps : [],
        purpose: e.purpose ?? "",
        principle: e.principle ?? "",
      })),
    );
  }

  console.log(`chapters=${data.chapters.length} entries=${data.entries.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seed-library 失败:", err?.cause?.message ?? err?.message ?? err);
  process.exit(1);
});
