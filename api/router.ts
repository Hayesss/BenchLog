import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { projectRouter, tagRouter } from "./metaRouter";
import { protocolRouter } from "./protocolRouter";
import { recordRouter, imageRouter } from "./recordRouter";
import { flowRouter, todoRouter } from "./scheduleRouter";
import { searchRouter, exportLogRouter } from "./searchRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  project: projectRouter,
  tag: tagRouter,
  protocol: protocolRouter,
  record: recordRouter,
  image: imageRouter,
  flow: flowRouter,
  todo: todoRouter,
  search: searchRouter,
  exportLog: exportLogRouter,
});

export type AppRouter = typeof appRouter;
