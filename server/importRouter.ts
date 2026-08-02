/**
 * CSV / Excel bulk import — server-side logic
 *
 * POST /api/import/preview  — parse file, return headers + sample rows + suggested field mapping
 * POST /api/import/execute  — create all contacts from confirmed mapping
 */

import { Router } from "express";
import * as XLSX from "xlsx";
import { search } from "fast-fuzzy";
import multer from "multer";
import { storage } from "./storage";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const importRouter = Router();

// ── Field catalog ─────────────────────────────────────────────────────────────
// Every field the app understands, with aliases the fuzzy matcher scores against.
export const CONTACT_FIELDS = [
  { id: "firstName",      label: "First Name",       aliases: ["first name", "first", "given name", "forename", "fname", "given"] },
  { id: "lastName",       label: "Last Name",        aliases: ["last name", "last", "surname", "family name", "lname", "family"] },
  { id: "fullName",       label: "Full Name",        aliases: ["name", "full name", "contact name", "person", "display name", "contact"] },
  { id: "email",          label: "Email",            aliases: ["email", "e-mail", "email address", "mail", "e mail"] },
  { id: "phone",          label: "Phone",            aliases: ["phone", "telephone", "mobile", "cell", "phone number", "tel", "cell phone", "mobile number"] },
  { id: "instagram",      label: "Instagram",        aliases: ["instagram", "ig", "insta", "instagram handle"] },
  { id: "linkedin",       label: "LinkedIn",         aliases: ["linkedin", "linked in", "linkedin url", "linkedin profile"] },
  { id: "twitter",        label: "Twitter / X",      aliases: ["twitter", "x", "twitter handle", "tweet", "@twitter"] },
  { id: "birthday",       label: "Birthday",         aliases: ["birthday", "birth date", "date of birth", "dob", "born", "bday", "birth day"] },
  { id: "notes",          label: "Notes",            aliases: ["notes", "note", "comments", "comment", "description", "memo", "about", "bio", "remarks", "info"] },
  { id: "connectionTags", label: "Relationship Tag", aliases: ["relationship", "type", "tag", "category", "connection", "relation", "group", "contact type", "relationship type"] },
  { id: "industryTags",   label: "Industry Tag",     aliases: ["industry", "sector", "field", "profession", "domain", "work area"] },
  { id: "company",        label: "Company / Org",    aliases: ["company", "organization", "organisation", "employer", "org", "business", "workplace", "firm"] },
  { id: "jobTitle",       label: "Job Title",        aliases: ["title", "job title", "position", "role", "occupation", "job", "designation"] },
  { id: "address",        label: "Address",          aliases: ["address", "location", "city", "country", "place", "street", "residence"] },
  { id: "website",        label: "Website",          aliases: ["website", "url", "web", "homepage", "site", "blog"] },
  { id: "skip",           label: "— Skip this column —", aliases: [] },
] as const;

export type FieldId = typeof CONTACT_FIELDS[number]["id"];

// ── Fuzzy mapper ──────────────────────────────────────────────────────────────
function suggestField(header: string): FieldId {
  const h = header.toLowerCase().trim();
  // Exact / direct match first
  for (const f of CONTACT_FIELDS) {
    if (f.id === "skip") continue;
    if (f.aliases.some(a => a === h)) return f.id as FieldId;
  }
  // Fuzzy search across all aliases — build a flat list with back-references
  const allAliases: string[] = [];
  const aliasToField: FieldId[] = [];
  for (const f of CONTACT_FIELDS) {
    if (f.id === "skip") continue;
    for (const a of f.aliases) {
      allAliases.push(a);
      aliasToField.push(f.id as FieldId);
    }
  }
  const results = search(h, allAliases, { returnMatchData: true });
  if (results.length > 0 && results[0].score > 0.6) {
    const idx = allAliases.indexOf(results[0].item);
    return aliasToField[idx];
  }
  return "skip";
}

// ── Date normaliser ───────────────────────────────────────────────────────────
// Accepts any common birthday format and returns YYYY-MM-DD or null.
const MONTH_NAMES: Record<string, string> = {
  january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
  july:"07",august:"08",september:"09",october:"10",november:"11",december:"12",
  jan:"01",feb:"02",mar:"03",apr:"04",jun:"06",jul:"07",aug:"08",
  sep:"09",oct:"10",nov:"11",dec:"12",
};

function normaliseDate(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === "") return null;

  // Excel serial number (days since Dec 30 1899, with Lotus 1-2-3 off-by-2 bug)
  if (typeof raw === "number") {
    const serial = Math.floor(raw);
    // Adjust for the Lotus bug (Excel treats 1900-02-29 as real)
    const adjusted = serial > 59 ? serial - 1 : serial;
    // Days from Dec 30 1899 to Unix epoch = 25569.
    // Add 0.5 day (12h) to avoid UTC midnight rounding to previous day.
    const ms = (adjusted - 25569 + 0.5) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getUTCFullYear();
      const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd   = String(d.getUTCDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY/MM/DD
  const ymdSlash = s.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/);
  if (ymdSlash) {
    return `${ymdSlash[1]}-${ymdSlash[2].padStart(2,"0")}-${ymdSlash[3].padStart(2,"0")}`;
  }

  // DD/MM/YYYY or MM/DD/YYYY — heuristic: if first number > 12 it must be a day
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    let [, a, b, y] = dmyMatch;
    if (y.length === 2) y = parseInt(y) > 30 ? `19${y}` : `20${y}`;
    // if a > 12, it must be the day
    const [month, day] = parseInt(a) > 12 ? [b, a] : [a, b];
    // Validate
    const m = parseInt(month), d2 = parseInt(day), yr = parseInt(y);
    if (m >= 1 && m <= 12 && d2 >= 1 && d2 <= 31 && yr >= 1900 && yr <= 2100) {
      return `${y}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`;
    }
  }

  // "January 5, 1990" or "5 January 1990" or "Jan 5 1990"
  const textMonthFirst = s.match(/^([a-zA-Z]+)\s+(\d{1,2})[,\s]+(\d{4})$/i);
  if (textMonthFirst) {
    const [, mon, day, yr] = textMonthFirst;
    const m = MONTH_NAMES[mon.toLowerCase()];
    if (m) return `${yr}-${m}-${day.padStart(2,"0")}`;
  }
  const textDayFirst = s.match(/^(\d{1,2})\s+([a-zA-Z]+)[,\s]+(\d{4})$/i);
  if (textDayFirst) {
    const [, day, mon, yr] = textDayFirst;
    const m = MONTH_NAMES[mon.toLowerCase()];
    if (m) return `${yr}-${m}-${day.padStart(2,"0")}`;
  }

  return null;
}

// ── Name splitter ─────────────────────────────────────────────────────────────
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  return { firstName, lastName };
}

// ── Parse uploaded file ───────────────────────────────────────────────────────
function parseFile(buffer: Buffer, mimetype: string): { headers: string[]; rows: Record<string, string | number | null>[] } {
  // cellDates:true makes XLSX return JS Date objects for date cells instead of serials.
  // raw:false makes it format numbers/dates as strings, so we get predictable string input.
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // With cellDates:true, date cells become JS Dates — stringify them as ISO YYYY-MM-DD.
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false });
  const rows = rawRows.map(row => {
    const out: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Date) {
        // Format as YYYY-MM-DD using UTC to avoid timezone shifting
        const yyyy = v.getUTCFullYear();
        const mm   = String(v.getUTCMonth() + 1).padStart(2, "0");
        const dd   = String(v.getUTCDate()).padStart(2, "0");
        out[k] = `${yyyy}-${mm}-${dd}`;
      } else {
        out[k] = v as string | number | null;
      }
    }
    return out;
  });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

// ── POST /api/import/preview ──────────────────────────────────────────────────
importRouter.post("/preview", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { headers, rows } = parseFile(req.file.buffer, req.file.mimetype);

    // Suggest a field mapping for each header
    const mapping: Record<string, FieldId> = {};
    for (const h of headers) mapping[h] = suggestField(h);

    // Return headers, mapping, and up to 5 preview rows
    res.json({
      headers,
      mapping,
      sampleRows: rows.slice(0, 5),
      totalRows: rows.length,
      fields: CONTACT_FIELDS.map(f => ({ id: f.id, label: f.label })),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ── POST /api/import/execute ──────────────────────────────────────────────────
importRouter.post("/execute", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const mapping: Record<string, FieldId> = JSON.parse(req.body.mapping ?? "{}");
    const { rows } = parseFile(req.file.buffer, req.file.mimetype);

    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];

        // Collect values by field
        const byField: Record<string, string[]> = {};
        for (const [header, fieldId] of Object.entries(mapping)) {
          if (fieldId === "skip") continue;
          const val = row[header];
          const strVal = val != null && val !== "" ? String(val).trim() : null;
          if (!strVal) continue;
          if (!byField[fieldId]) byField[fieldId] = [];
          byField[fieldId].push(strVal);
        }

        // Resolve first/last name
        let firstName = byField["firstName"]?.[0] ?? "";
        let lastName  = byField["lastName"]?.[0]  ?? "";
        if (!firstName && byField["fullName"]?.[0]) {
          ({ firstName, lastName } = splitName(byField["fullName"][0]));
        }
        if (!firstName) { errors.push(`Row ${i + 2}: no name found, skipped`); continue; }

        // Build notes — include unmapped fields + extra app fields like company/title/address/website
        const notesParts: string[] = [];
        if (byField["notes"]?.[0]) notesParts.push(byField["notes"][0]);
        // Fields with no dedicated column in the schema → fold into notes
        for (const f of ["company","jobTitle","address","website"] as FieldId[]) {
          if (byField[f]?.[0]) {
            const label = CONTACT_FIELDS.find(x => x.id === f)?.label ?? f;
            notesParts.push(`${label}: ${byField[f][0]}`);
          }
        }

        // Build contact methods array
        const contactMethods: { type: string; value: string }[] = [];
        const cmMap: [FieldId, string][] = [
          ["email", "Email"], ["phone", "Phone"], ["instagram", "Instagram"],
          ["linkedin", "LinkedIn"], ["twitter", "Twitter"], ["website", "Website"],
        ];
        for (const [fieldId, label] of cmMap) {
          if (byField[fieldId]?.[0]) contactMethods.push({ type: label, value: byField[fieldId][0] });
        }

        // Birthday
        const birthday = byField["birthday"]?.[0]
          ? normaliseDate(byField["birthday"][0])
          : null;

        // Tags — treat as a single tag string
        const connectionTags = byField["connectionTags"] ?? [];
        const industryTags   = byField["industryTags"]   ?? [];

        const contact = storage.createContact({
          firstName,
          lastName,
          photo: null,
          birthday,
          notes: notesParts.join("\n") || "",
          connectionTags: JSON.stringify(connectionTags),
          industryTags:   JSON.stringify(industryTags),
          contactMethods: JSON.stringify(contactMethods),
          lastContactedAt: null,
        });

        // Auto-log "Contact created" interaction so check-in starts from today
        storage.createInteraction({
          contactId: contact.id!,
          contactedAt: new Date().toISOString(),
          note: "Contact created (imported)",
        });

        // Auto check-in reminder
        storage.createReminder({
          contactId: contact.id!,
          type: "check_in",
          title: `${firstName} ${lastName}`.trim() + " - Check In",
          dueDate: null,
          checkInAfterDays: 180,
          isRecurring: true,
          isDismissed: false,
        });

        created++;
      } catch (rowErr) {
        errors.push(`Row ${i + 2}: ${String(rowErr)}`);
      }
    }

    res.json({ created, errors });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});
