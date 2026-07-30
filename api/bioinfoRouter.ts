import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bioinfoAnalyses, projects, gitCommits, gitRefs } from "@db/schema";
import { dateStr } from "./zodSchemas";

const bioinfoStatusSchema = z.enum(["running", "done", "failed"]);

const bioinfoFieldsInput = {
  name: z.string().min(1),
  analysisDate: dateStr,
  projectId: z.number().nullable().optional(),
  pipeline: z.string().default("手动脚本"),
  inputData: z.string().optional(),
  dataPath: z.string().optional(),
  resultPath: z.string().optional(),
  repoUrl: z.string().optional(),
  commitHash: z.string().optional(),
  environment: z.string().optional(),
  command: z.string().optional(),
  status: bioinfoStatusSchema.default("running"),
  resultMd: z.string().optional(),
  conclusion: z.string().optional(),
  nextStep: z.string().optional(),
};

function normalize<T extends Record<string, unknown>>(data: T) {
  const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
  return {
    ...data,
    projectId: data.projectId ?? null,
    inputData: (emptyToUndefined(data.inputData) as string | undefined) ?? null,
    dataPath: (emptyToUndefined(data.dataPath) as string | undefined) ?? null,
    resultPath: (emptyToUndefined(data.resultPath) as string | undefined) ?? null,
    repoUrl: (emptyToUndefined(data.repoUrl) as string | undefined) ?? null,
    commitHash: (emptyToUndefined(data.commitHash) as string | undefined) ?? null,
    environment: (emptyToUndefined(data.environment) as string | undefined) ?? null,
    command: (emptyToUndefined(data.command) as string | undefined) ?? null,
    resultMd: (emptyToUndefined(data.resultMd) as string | undefined) ?? null,
    conclusion: (emptyToUndefined(data.conclusion) as string | undefined) ?? null,
    nextStep: (emptyToUndefined(data.nextStep) as string | undefined) ?? null,
  };
}

async function attachProject(userId: number, rows: (typeof bioinfoAnalyses.$inferSelect)[]) {
  const ps = await getDb().select().from(projects).where(eq(projects.userId, userId));
  const pMap = new Map(ps.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, project: r.projectId ? (pMap.get(r.projectId) ?? null) : null }));
}

export const bioinfoRouter = createRouter({
  list: authedQuery
    .input(
      z
        .object({
          projectId: z.number().optional(),
          status: bioinfoStatusSchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(bioinfoAnalyses.userId, ctx.user.id)];
      if (input?.projectId) conds.push(eq(bioinfoAnalyses.projectId, input.projectId));
      if (input?.status) conds.push(eq(bioinfoAnalyses.status, input.status));
      const rows = await getDb()
        .select()
        .from(bioinfoAnalyses)
        .where(and(...conds))
        .orderBy(desc(bioinfoAnalyses.analysisDate), desc(bioinfoAnalyses.createdAt));
      return attachProject(ctx.user.id, rows);
    }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const rows = await getDb()
      .select()
      .from(bioinfoAnalyses)
      .where(and(eq(bioinfoAnalyses.id, input.id), eq(bioinfoAnalyses.userId, ctx.user.id)));
    if (!rows[0]) return null;
    const [withMeta] = await attachProject(ctx.user.id, [rows[0]]);
    return withMeta;
  }),

  create: authedQuery.input(z.object(bioinfoFieldsInput)).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb()
      .insert(bioinfoAnalyses)
      .values({ ...normalize(input), userId: ctx.user.id })
      .$returningId();
    return { id };
  }),

  update: authedQuery
    .input(z.object({ id: z.number(), ...bioinfoFieldsInput }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb()
        .update(bioinfoAnalyses)
        .set(normalize(data))
        .where(and(eq(bioinfoAnalyses.id, id), eq(bioinfoAnalyses.userId, ctx.user.id)));
      return { ok: true };
    }),

  updateStatus: authedQuery
    .input(z.object({ id: z.number(), status: bioinfoStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(bioinfoAnalyses)
        .set({ status: input.status })
        .where(and(eq(bioinfoAnalyses.id, input.id), eq(bioinfoAnalyses.userId, ctx.user.id)));
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .delete(bioinfoAnalyses)
      .where(and(eq(bioinfoAnalyses.id, input.id), eq(bioinfoAnalyses.userId, ctx.user.id)));
    // 清理站内仓库的引用与提交对象（blob/tree 为内容寻址去重共享池，保留）
    await getDb()
      .delete(gitRefs)
      .where(and(eq(gitRefs.analysisId, input.id), eq(gitRefs.userId, ctx.user.id)));
    await getDb()
      .delete(gitCommits)
      .where(and(eq(gitCommits.analysisId, input.id), eq(gitCommits.userId, ctx.user.id)));
    return { ok: true };
  }),
});
