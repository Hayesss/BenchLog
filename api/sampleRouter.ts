import { z } from "zod";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sampleBoxes, samples, projects, records } from "@db/schema";
import { dateStr } from "./zodSchemas";

// 样本类型：9 种固定取值
const sampleTypeEnum = z.enum(["DNA", "RNA", "蛋白", "细胞", "组织", "血清", "质粒", "引物", "其他"]);

/** 孔位坐标字符串：row 0 → 'A'，col 0 → '1'（如 row=0,col=0 → 'A1'；row=7,col=11 → 'H12'） */
function wellLabel(row: number, col: number): string {
  return String.fromCharCode(65 + row) + String(col + 1);
}

/** 归属校验：返回当前用户本人的冻存盒，否则 NOT_FOUND */
async function getOwnedBox(userId: number, id: number) {
  const rows = await getDb()
    .select()
    .from(sampleBoxes)
    .where(and(eq(sampleBoxes.id, id), eq(sampleBoxes.userId, userId)));
  const box = rows[0];
  if (!box) throw new TRPCError({ code: "NOT_FOUND", message: "冻存盒不存在" });
  return box;
}

/** 归属校验：projectId 须为当前用户项目 */
async function assertOwnedProject(userId: number, projectId: number) {
  const p = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  if (!p[0]) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
}

export const sampleRouter = createRouter({
  /** 冻存盒列表：当前用户全部（可按项目过滤），附 occupied 占用孔数与 capacity 容量 */
  listBoxes: authedQuery
    .input(z.object({ projectId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds = [eq(sampleBoxes.userId, ctx.user.id)];
      if (input?.projectId != null) conds.push(eq(sampleBoxes.projectId, input.projectId));
      const boxes = await db
        .select()
        .from(sampleBoxes)
        .where(and(...conds))
        .orderBy(asc(sampleBoxes.createdAt));
      if (boxes.length === 0) return [];
      // 每盒占用孔数：按 boxId 分组聚合后回填
      const counts = await db
        .select({ boxId: samples.boxId, occupied: sql<number>`count(*)` })
        .from(samples)
        .where(eq(samples.userId, ctx.user.id))
        .groupBy(samples.boxId);
      const countMap = new Map(counts.map((c) => [c.boxId, Number(c.occupied)]));
      return boxes.map((b) => ({
        ...b,
        occupied: countMap.get(b.id) ?? 0,
        capacity: b.rows * b.cols,
      }));
    }),

  /** 新建冻存盒：projectId 须为本人项目；默认 8 行 × 12 列 */
  createBox: authedQuery
    .input(
      z.object({
        projectId: z.number(),
        name: z.string().min(1).max(80),
        location: z.string().max(80).optional(),
        rows: z.number().int().min(1).max(26).default(8),
        cols: z.number().int().min(1).max(30).default(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedProject(ctx.user.id, input.projectId);
      const [{ id }] = await getDb()
        .insert(sampleBoxes)
        .values({
          userId: ctx.user.id,
          projectId: input.projectId,
          name: input.name,
          location: input.location ?? null,
          rows: input.rows,
          cols: input.cols,
        })
        .$returningId();
      return { id };
    }),

  /** 重命名 / 改位置：location 传可空串可清空 */
  renameBox: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(80).optional(),
        location: z.string().max(80).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getOwnedBox(ctx.user.id, input.id);
      const patch: { name?: string; location?: string | null } = {};
      if (input.name != null) patch.name = input.name;
      if (input.location != null) patch.location = input.location === "" ? null : input.location;
      if (Object.keys(patch).length > 0) {
        await getDb()
          .update(sampleBoxes)
          .set(patch)
          .where(and(eq(sampleBoxes.id, input.id), eq(sampleBoxes.userId, ctx.user.id)));
      }
      return { ok: true };
    }),

  /** 删除冻存盒：级联删除盒内全部样本 */
  removeBox: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getOwnedBox(ctx.user.id, input.id);
      const db = getDb();
      await db.delete(samples).where(eq(samples.boxId, input.id));
      await db
        .delete(sampleBoxes)
        .where(and(eq(sampleBoxes.id, input.id), eq(sampleBoxes.userId, ctx.user.id)));
      return { ok: true };
    }),

  /** 盒子详情：盒子行 + wells（该盒全部样本） */
  getBox: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const box = await getOwnedBox(ctx.user.id, input.id);
      const wells = await getDb()
        .select({
          row: samples.row,
          col: samples.col,
          name: samples.name,
          type: samples.type,
          concentration: samples.concentration,
          volume: samples.volume,
          sampleDate: samples.sampleDate,
          notes: samples.notes,
          recordId: samples.recordId,
          recordTitle: records.title,
        })
        .from(samples)
        .leftJoin(records, and(eq(records.id, samples.recordId), isNull(records.deletedAt)))
        .where(eq(samples.boxId, box.id))
        .orderBy(asc(samples.row), asc(samples.col));
      return { ...box, wells };
    }),

  /** 放入 / 覆盖样本：row/col 须在盒子范围内；按 (boxId,row,col) upsert，返回该孔行 */
  setSample: authedQuery
    .input(
      z.object({
        boxId: z.number(),
        row: z.number().int().min(0),
        col: z.number().int().min(0),
        name: z.string().min(1).max(120),
        type: sampleTypeEnum,
        concentration: z.string().max(40).optional(),
        volume: z.string().max(40).optional(),
        sampleDate: dateStr.nullish(),
        notes: z.string().max(500).optional(),
        recordId: z.number().nullable().optional(), // 关联实验记录；undefined=保持不变，null=解除关联
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const box = await getOwnedBox(ctx.user.id, input.boxId);
      if (input.row >= box.rows || input.col >= box.cols) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `孔位超出盒子范围（该盒 ${box.rows} 行 × ${box.cols} 列）`,
        });
      }
      // 关联记录归属校验（且排除软删除）
      if (input.recordId != null) {
        const rec = await db
          .select({ id: records.id })
          .from(records)
          .where(and(eq(records.id, input.recordId), eq(records.userId, ctx.user.id), isNull(records.deletedAt)));
        if (!rec[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "关联的实验记录不存在" });
      }
      const values = {
        name: input.name,
        type: input.type,
        concentration: input.concentration ?? null,
        volume: input.volume ?? null,
        sampleDate: input.sampleDate ?? null,
        notes: input.notes ?? null,
        ...(input.recordId !== undefined ? { recordId: input.recordId } : {}),
      };
      const existing = await db
        .select()
        .from(samples)
        .where(
          and(
            eq(samples.boxId, box.id),
            eq(samples.row, input.row),
            eq(samples.col, input.col),
          ),
        );
      if (existing[0]) {
        await db.update(samples).set(values).where(eq(samples.id, existing[0].id));
      } else {
        await db.insert(samples).values({
          userId: ctx.user.id,
          boxId: box.id,
          row: input.row,
          col: input.col,
          ...values,
        });
      }
      const row = await db
        .select()
        .from(samples)
        .where(
          and(
            eq(samples.boxId, box.id),
            eq(samples.row, input.row),
            eq(samples.col, input.col),
          ),
        );
      return row[0];
    }),

  /** 清空孔位：删除该孔样本（无则静默成功） */
  clearSlot: authedQuery
    .input(
      z.object({
        boxId: z.number(),
        row: z.number().int().min(0),
        col: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getOwnedBox(ctx.user.id, input.boxId);
      await getDb()
        .delete(samples)
        .where(
          and(
            eq(samples.boxId, input.boxId),
            eq(samples.row, input.row),
            eq(samples.col, input.col),
          ),
        );
      return { ok: true };
    }),

  /** 跨盒搜索：name/notes/concentration 模糊匹配（lower includes），附盒名/项目名/孔位坐标，上限 50 */
  searchSamples: authedQuery
    .input(z.object({ q: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.q.toLowerCase()}%`;
      const rows = await getDb()
        .select({
          sample: samples,
          boxName: sampleBoxes.name,
          projectId: sampleBoxes.projectId,
          projectName: projects.name,
        })
        .from(samples)
        .innerJoin(sampleBoxes, eq(sampleBoxes.id, samples.boxId))
        .leftJoin(projects, eq(projects.id, sampleBoxes.projectId))
        .where(
          and(
            eq(samples.userId, ctx.user.id),
            sql`(
              lower(${samples.name}) like ${pattern}
              or lower(coalesce(${samples.notes}, '')) like ${pattern}
              or lower(coalesce(${samples.concentration}, '')) like ${pattern}
            )`,
          ),
        )
        .orderBy(asc(samples.createdAt))
        .limit(50);
      return rows.map((r) => ({
        ...r.sample,
        boxName: r.boxName,
        projectId: r.projectId,
        projectName: r.projectName,
        well: wellLabel(r.sample.row, r.sample.col),
      }));
    }),
});
