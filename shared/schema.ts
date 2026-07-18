import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Contacts ──────────────────────────────────────────────────────────────────
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull().default(""),
  photo: text("photo"), // base64 data-URL or relative path
  birthday: text("birthday"), // ISO date string YYYY-MM-DD
  notes: text("notes").default(""),
  // JSON arrays stored as text
  connectionTags: text("connection_tags").notNull().default("[]"), // ["friend","colleague",...]
  industryTags: text("industry_tags").notNull().default("[]"),    // ["tech","finance",...]
  contactMethods: text("contact_methods").notNull().default("[]"),// [{type,value}]
  lastContactedAt: text("last_contacted_at"), // ISO datetime
  createdAt: text("created_at").notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// ── Interactions (log of contact events) ─────────────────────────────────────
export const interactions = sqliteTable("interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id").notNull(),
  contactedAt: text("contacted_at").notNull(), // ISO datetime
  note: text("note").default(""),
});

export const insertInteractionSchema = createInsertSchema(interactions).omit({
  id: true,
});
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;
export type Interaction = typeof interactions.$inferSelect;

// ── Reminders ─────────────────────────────────────────────────────────────────
// type: "birthday" | "event" | "check_in"
// checkInAfterDays: only used for type=check_in (e.g. 180 = 6 months)
export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id"), // null = global reminder
  type: text("type").notNull(), // "birthday" | "event" | "check_in"
  title: text("title").notNull(),
  dueDate: text("due_date"), // ISO date for event/birthday
  checkInAfterDays: integer("check_in_after_days"), // for check_in type
  isRecurring: integer("is_recurring", { mode: "boolean" }).default(false),
  isDismissed: integer("is_dismissed", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
});

export const insertReminderSchema = createInsertSchema(reminders).omit({
  id: true,
  createdAt: true,
});
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof reminders.$inferSelect;
