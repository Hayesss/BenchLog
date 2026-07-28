import { z } from "zod";

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const materialSchema = z.object({
  name: z.string(),
  catalog: z.string().optional(),
  amount: z.string().optional(),
});

export const stepGroupSchema = z.object({
  title: z.string(),
  steps: z.array(z.object({ text: z.string(), duration: z.string().optional() })),
});

export const paramSchema = z.object({
  name: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  note: z.string().optional(),
});

export const deviationSchema = z.object({
  param: z.string(),
  defaultValue: z.string(),
  actualValue: z.string(),
  reason: z.string().optional(),
});

export const flowNodeSchema = z.object({ date: dateStr, name: z.string() });

export const recordStatusSchema = z.enum(["ongoing", "done", "failed"]);
