import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: varchar("submission_id", { length: 64 }).notNull(),
    tenantId: varchar("tenant_id", { length: 32 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    body: jsonb("body").notNull(),
    status: text("status").notNull().default("received"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("reports_submission_id_key").on(table.submissionId),
    index("idx_reports_tenant").on(table.tenantId),
  ],
);

export const auditLog = pgTable("audit_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  reportId: uuid("report_id").references(() => reports.id),
  action: varchar("action", { length: 40 }).notNull(),
  actorEmail: varchar("actor_email", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
