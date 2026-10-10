import express, { Router } from "express";
import { z } from "zod";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { reports, auditLog } from "../db/schema";

const pool = new Pool({
  max: 10,
  connectionString: process.env.APP_DATABASE_URL,
});
const db = drizzle(pool);

const reportSchema = z.object({
  submissionId: z.string().min(8).max(64),
  title: z.string().min(1).max(120),
  body: z.record(z.any()),
});

const pingSchema = z.object({
  action: z.string().max(40),
  actorEmail: z.string().email().optional(),
});

const requireAuth = (req: any, res: any, next: any) => next();

const router = Router();

router.post("/reports", requireAuth, async (req, res) => {
  const parsed = reportSchema.parse(req.body);
  const tenantId = req.header("x-tenant-id") as string;
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(reports)
      .values({
        submissionId: parsed.submissionId,
        tenantId,
        title: parsed.title,
        body: parsed.body,
      })
      .onConflictDoNothing({ target: reports.submissionId })
      .returning();
    await tx
      .insert(auditLog)
      .values({ reportId: row.id, action: "report.created" });
    return row;
  });
  res.status(201).json({ id: saved.id });
});

router.post("/audit/ping", requireAuth, async (req, res) => {
  const { action, actorEmail } = pingSchema.parse(req.body);
  await db.insert(auditLog).values({ action, actorEmail });
  res.status(202).json({ ok: true });
});

router.get("/reports/:id", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(reports)
    .where(eq(reports.id, req.params.id));
  res.json(rows[0] ?? null);
});

export const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api", router);
