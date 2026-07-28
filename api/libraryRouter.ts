import { z } from "zod";
import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { methodChapters, methodEntries, protocols, protocolVersions } from "@db/schema";

/** 列表项（瘦身，不含 steps/purpose/principle 大字段） */
const entryListColumns = {
  id: methodEntries.id,
  entryId: methodEntries.entryId,
  chapterNo: methodEntries.chapterNo,
  section: methodEntries.section,
  nameCn: methodEntries.nameCn,
  nameEn: methodEntries.nameEn,
  type: methodEntries.type,
  journal: methodEntries.journal,
  year: methodEntries.year,
  doi: methodEntries.doi,
  purpose: methodEntries.purpose,
} as const;

export const libraryRouter = createRouter({
  /** 12 章及每章条目数 */
  chapters: authedQuery.query(async () => {
    const db = getDb();
    const [chapters, counts] = await Promise.all([
      db.select().from(methodChapters).orderBy(asc(methodChapters.chapterNo)),
      db
        .select({ chapterNo: methodEntries.chapterNo, count: sql<number>`count(*)` })
        .from(methodEntries)
        .groupBy(methodEntries.chapterNo),
    ]);
    const countMap = new Map(counts.map((c) => [c.chapterNo, Number(c.count)]));
    return chapters.map((c) => ({ ...c, entryCount: countMap.get(c.chapterNo) ?? 0 }));
  }),

  /** 条目列表：按章节过滤，或按关键词在名称/小节/期刊/来源上模糊搜索 */
  entries: authedQuery
    .input(
      z.object({
        chapterNo: z.number().int().optional(),
        q: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const q = input.q?.trim();
      const conds = [];
      if (q) {
        const pattern = `%${q}%`;
        conds.push(
          or(
            like(methodEntries.nameCn, pattern),
            like(methodEntries.nameEn, pattern),
            like(methodEntries.section, pattern),
            like(methodEntries.journal, pattern),
            like(methodEntries.source, pattern),
          ),
        );
      } else if (input.chapterNo != null) {
        conds.push(eq(methodEntries.chapterNo, input.chapterNo));
      }
      const rows = await db
        .select(entryListColumns)
        .from(methodEntries)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(asc(methodEntries.chapterNo), asc(methodEntries.entryId))
        .limit(200);
      // 列表瘦身：去掉 purpose 原文，仅保留卡片摘要
      return rows.map(({ purpose, ...rest }) => ({
        ...rest,
        purposeExcerpt: (purpose ?? "").slice(0, 140),
      }));
    }),

  /** 条目详情（完整字段） */
  entry: authedQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const rows = await getDb().select().from(methodEntries).where(eq(methodEntries.id, input.id));
    return rows[0] ?? null;
  }),

  /** 把方法库条目存为当前用户的 Protocol（pointer 条目拒绝导入） */
  importAsProtocol: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const entry = (
        await db.select().from(methodEntries).where(eq(methodEntries.id, input.id))
      )[0];
      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "未找到该方法条目" });
      }
      if (entry.type === "pointer") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "该条目为跨章指引，仅提供线索，不能存为 Protocol",
        });
      }

      const chapter = (
        await db
          .select()
          .from(methodChapters)
          .where(eq(methodChapters.chapterNo, entry.chapterNo))
      )[0];

      const description = [
        entry.source ?? "",
        "",
        "【目的与用途】",
        entry.purpose ?? "",
        "",
        "【原理】",
        entry.principle ?? "",
      ]
        .join("\n")
        .trim();

      const protocolInput = {
        userId: ctx.user.id,
        name: (entry.nameCn || entry.nameEn || "未命名方法").slice(0, 255),
        category: "方法库导入",
        color: "#3E7C6B",
        description,
        version: "v1.0",
        materials: [],
        stepGroups: [
          {
            title: "核心步骤概要",
            steps: entry.steps.map((text) => ({ text })),
          },
        ],
        params: [],
        tags: [entry.journal, chapter?.title ?? ""].map((t) => t.trim()).filter(Boolean),
      };

      const [{ id }] = await db.insert(protocols).values(protocolInput).$returningId();
      await db.insert(protocolVersions).values({
        protocolId: id,
        userId: ctx.user.id,
        version: protocolInput.version,
        note: "初始版本（方法库导入）",
        snapshot: {
          name: protocolInput.name,
          category: protocolInput.category,
          color: protocolInput.color,
          description: protocolInput.description,
          version: protocolInput.version,
          materials: protocolInput.materials,
          stepGroups: protocolInput.stepGroups,
          params: protocolInput.params,
          tags: protocolInput.tags,
        },
      });
      return { id };
    }),
});
