import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";
import path from "path";
import {
  contacts, interactions, reminders,
  type Contact, type InsertContact,
  type Interaction, type InsertInteraction,
  type Reminder, type InsertReminder,
} from "@shared/schema";

// Store DB in user home dir so the dev file-watcher doesn't restart
// the server every time a write happens (the watcher ignores paths
// outside the project directory).
const DB_PATH = process.env.CRM_DB_PATH
  ?? path.join(process.env.HOME ?? "/tmp", "orbit-crm.db");
const sqlite = new Database(DB_PATH);
console.log("[db] using", DB_PATH);
export const db = drizzle(sqlite);

// ── Migrate (create tables) ───────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    photo TEXT,
    birthday TEXT,
    notes TEXT DEFAULT '',
    connection_tags TEXT NOT NULL DEFAULT '[]',
    industry_tags TEXT NOT NULL DEFAULT '[]',
    contact_methods TEXT NOT NULL DEFAULT '[]',
    last_contacted_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    contacted_at TEXT NOT NULL,
    note TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    due_date TEXT,
    check_in_after_days INTEGER,
    is_recurring INTEGER DEFAULT 0,
    is_dismissed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export interface IStorage {
  // Contacts
  getContacts(): Contact[];
  getContact(id: number): Contact | undefined;
  createContact(data: InsertContact): Contact;
  updateContact(id: number, data: Partial<InsertContact>): Contact | undefined;
  deleteContact(id: number): void;

  // Interactions
  getInteractions(contactId: number): Interaction[];
  createInteraction(data: InsertInteraction): Interaction;
  deleteInteraction(id: number): void;

  // Reminders
  getReminders(): Reminder[];
  getRemindersForContact(contactId: number): Reminder[];
  createReminder(data: InsertReminder): Reminder;
  updateReminder(id: number, data: Partial<InsertReminder>): Reminder | undefined;
  deleteReminder(id: number): void;
  dismissReminder(id: number): void;

  // Settings (custom tags)
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
}

export const storage: IStorage = {
  // ── Contacts ──────────────────────────────────────────────────────────────
  getContacts() {
    return db.select().from(contacts).orderBy(contacts.firstName).all();
  },
  getContact(id) {
    return db.select().from(contacts).where(eq(contacts.id, id)).get();
  },
  createContact(data) {
    return db.insert(contacts).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning().get();
  },
  updateContact(id, data) {
    return db.update(contacts).set(data).where(eq(contacts.id, id)).returning().get();
  },
  deleteContact(id) {
    db.delete(interactions).where(eq(interactions.contactId, id)).run();
    db.delete(reminders).where(eq(reminders.contactId, id)).run();
    db.delete(contacts).where(eq(contacts.id, id)).run();
  },

  // ── Interactions ──────────────────────────────────────────────────────────
  getInteractions(contactId) {
    return db.select().from(interactions)
      .where(eq(interactions.contactId, contactId))
      .orderBy(desc(interactions.contactedAt))
      .all();
  },
  createInteraction(data) {
    const interaction = db.insert(interactions).values(data).returning().get();
    // Update lastContactedAt on contact
    db.update(contacts)
      .set({ lastContactedAt: data.contactedAt })
      .where(eq(contacts.id, data.contactId))
      .run();

    // Reset check-in due dates for this contact:
    // For every recurring check_in reminder for this contact, set dueDate to
    // contactedAt + checkInAfterDays, and un-dismiss it if it was dismissed.
    const contactReminders = db.select().from(reminders)
      .where(eq(reminders.contactId, data.contactId))
      .all();

    for (const r of contactReminders) {
      if (r.type === "check_in" && r.checkInAfterDays) {
        const interactedDate = new Date(data.contactedAt);
        interactedDate.setDate(interactedDate.getDate() + r.checkInAfterDays);
        const newDueDate = interactedDate.toISOString().split("T")[0];
        db.update(reminders)
          .set({ dueDate: newDueDate, isDismissed: false })
          .where(eq(reminders.id, r.id!))
          .run();
      }
    }

    return interaction;
  },
  deleteInteraction(id) {
    db.delete(interactions).where(eq(interactions.id, id)).run();
  },

  // ── Reminders ──────────────────────────────────────────────────────────────
  getReminders() {
    return db.select().from(reminders)
      .orderBy(reminders.dueDate)
      .all();
  },
  getRemindersForContact(contactId) {
    return db.select().from(reminders)
      .where(eq(reminders.contactId, contactId))
      .all();
  },
  createReminder(data) {
    return db.insert(reminders).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning().get();
  },
  updateReminder(id, data) {
    return db.update(reminders).set(data).where(eq(reminders.id, id)).returning().get();
  },
  deleteReminder(id) {
    db.delete(reminders).where(eq(reminders.id, id)).run();
  },
  dismissReminder(id) {
    db.update(reminders).set({ isDismissed: true }).where(eq(reminders.id, id)).run();
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  getSetting(key) {
    const row = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  },
  setSetting(key, value) {
    sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  },
};
