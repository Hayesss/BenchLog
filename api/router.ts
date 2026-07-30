import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { projectRouter, tagRouter } from "./metaRouter";
import { protocolRouter } from "./protocolRouter";
import { recordRouter, imageRouter, attachmentRouter } from "./recordRouter";
import { flowRouter, todoRouter } from "./scheduleRouter";
import { searchRouter, exportLogRouter } from "./searchRouter";
import { libraryRouter } from "./libraryRouter";
import { activityRouter } from "./activityRouter";
import { bioinfoRouter } from "./bioinfoRouter";
import { bioinfoSkillRouter } from "./bioinfoSkillRouter";
import { gitRouter } from "./gitRouter";
import { demoRouter } from "./demoRouter";
import { quickNoteRouter } from "./quickNoteRouter";
import { sampleRouter } from "./sampleRouter";
import { mouseRouter } from "./mouseRouter";
import { aiRouter } from "./aiRouter";
import { aiProfileRouter } from "./aiProfileRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  project: projectRouter,
  tag: tagRouter,
  protocol: protocolRouter,
  record: recordRouter,
  image: imageRouter,
  attachment: attachmentRouter,
  flow: flowRouter,
  todo: todoRouter,
  search: searchRouter,
  exportLog: exportLogRouter,
  library: libraryRouter,
  activity: activityRouter,
  bioinfo: bioinfoRouter,
  bioinfoSkill: bioinfoSkillRouter,
  git: gitRouter,
  demo: demoRouter,
  quickNote: quickNoteRouter,
  sample: sampleRouter,
  mouse: mouseRouter,
  ai: aiRouter,
  aiProfile: aiProfileRouter,
});

export type AppRouter = typeof appRouter;
