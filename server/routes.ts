import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { insertContactSchema, insertInteractionSchema, insertReminderSchema } from "@shared/schema";
import { z } from "zod";
import { importRouter } from "./importRouter";

// Default tag lists (used as initial values if no custom list saved)
const DEFAULT_CONNECTION_TAGS = [
  "Friend", "Close Friend", "Acquaintance", "Colleague", "Mentor",
  "Mentee", "Family", "Neighbor", "Client", "Partner", "Alumni",
];
const DEFAULT_INDUSTRY_TAGS = [
  "Technology", "Finance", "Healthcare", "Education", "Legal",
  "Media", "Marketing", "Design", "Engineering", "Science",
  "Government", "Non-profit", "Real Estate", "Retail", "Hospitality",
  "Arts", "Sports", "Consulting", "Startup", "Other",
];

export function registerRoutes(httpServer: ReturnType<typeof createServer>, app: Express) {
  app.use("/api/import", importRouter);


  // ── Contacts ──────────────────────────────────────────────────────────────
  app.get("/api/contacts", (_req, res) => {
    res.json(storage.getContacts());
  });

  app.get("/api/contacts/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const contact = storage.getContact(id);
    if (!contact) return res.status(404).json({ error: "Not found" });
    res.json(contact);
  });

  app.post("/api/contacts", (req, res) => {
    try {
      const data = insertContactSchema.parse(req.body);
      const contact = storage.createContact(data);
      // Auto-log a "Contact created" interaction so the check-in clock
      // starts from today (180 days out), not from the epoch.
      storage.createInteraction({
        contactId: contact.id!,
        contactedAt: new Date().toISOString(),
        note: "Contact created",
      });
      res.status(201).json(contact);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.patch("/api/contacts/:id", (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const data = insertContactSchema.partial().parse(req.body);
      const contact = storage.updateContact(id, data);
      if (!contact) return res.status(404).json({ error: "Not found" });
      res.json(contact);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.delete("/api/contacts/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteContact(id);
    res.status(204).end();
  });

  // ── Interactions ──────────────────────────────────────────────────────────
  app.get("/api/contacts/:id/interactions", (req, res) => {
    const contactId = parseInt(req.params.id);
    res.json(storage.getInteractions(contactId));
  });

  app.post("/api/contacts/:id/interactions", (req, res) => {
    const contactId = parseInt(req.params.id);
    try {
      const data = insertInteractionSchema.parse({ ...req.body, contactId });
      const interaction = storage.createInteraction(data);
      res.status(201).json(interaction);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.delete("/api/interactions/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteInteraction(id);
    res.status(204).end();
  });

  // ── Reminders ──────────────────────────────────────────────────────────────
  app.get("/api/reminders", (_req, res) => {
    res.json(storage.getReminders());
  });

  app.get("/api/contacts/:id/reminders", (req, res) => {
    const contactId = parseInt(req.params.id);
    res.json(storage.getRemindersForContact(contactId));
  });

  app.post("/api/reminders", (req, res) => {
    try {
      const data = insertReminderSchema.parse(req.body);
      const reminder = storage.createReminder(data);
      res.status(201).json(reminder);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.patch("/api/reminders/:id", (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const data = insertReminderSchema.partial().parse(req.body);
      const reminder = storage.updateReminder(id, data);
      if (!reminder) return res.status(404).json({ error: "Not found" });
      res.json(reminder);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.post("/api/reminders/:id/dismiss", (req, res) => {
    const id = parseInt(req.params.id);
    storage.dismissReminder(id);
    res.status(204).end();
  });

  app.delete("/api/reminders/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteReminder(id);
    res.status(204).end();
  });

  // ── Settings / Custom tags ────────────────────────────────────────────────
  app.get("/api/tags", (_req, res) => {
    const connRaw = storage.getSetting("connection_tags");
    const indRaw = storage.getSetting("industry_tags");
    res.json({
      connectionTags: connRaw ? JSON.parse(connRaw) : DEFAULT_CONNECTION_TAGS,
      industryTags: indRaw ? JSON.parse(indRaw) : DEFAULT_INDUSTRY_TAGS,
    });
  });

  app.put("/api/tags", (req, res) => {
    try {
      const { connectionTags, industryTags } = req.body;
      if (Array.isArray(connectionTags)) {
        storage.setSetting("connection_tags", JSON.stringify(connectionTags));
      }
      if (Array.isArray(industryTags)) {
        storage.setSetting("industry_tags", JSON.stringify(industryTags));
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  return httpServer;
}
