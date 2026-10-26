// E2E tests for orbit-crm — drive the real server (dist/index.cjs) over HTTP
// against an isolated SQLite DB. Zero external dependencies: node:test + fetch.
// Run: node --test tests/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 5177;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let tmpDir;

before(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "orbit-e2e-"));
  server = spawn(process.execPath, ["dist/index.cjs"], {
    cwd: join(import.meta.dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      CRM_DB_PATH: join(tmpDir, "test.db"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // wait for readiness
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/contacts`);
      if (r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server failed to start");
});

after(() => {
  server?.kill();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

const json = (r) => r.json();

// ── Static app ──────────────────────────────────────────────────────────────
test("serves the SPA at /", async () => {
  const r = await fetch(BASE);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<div id="root"|<script/i);
});

// ── Contact CRUD ────────────────────────────────────────────────────────────
test("create, read, update, delete a contact", async () => {
  const create = await fetch(`${BASE}/api/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" }),
  });
  assert.equal(create.status, 201);
  const contact = await json(create);
  assert.ok(contact.id);

  const got = await json(await fetch(`${BASE}/api/contacts/${contact.id}`));
  assert.equal(got.firstName, "Ada");

  const patched = await fetch(`${BASE}/api/contacts/${contact.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lastName: "King" }),
  });
  assert.ok(patched.status < 400);
  assert.equal((await json(await fetch(`${BASE}/api/contacts/${contact.id}`))).lastName, "King");

  const del = await fetch(`${BASE}/api/contacts/${contact.id}`, { method: "DELETE" });
  assert.ok(del.status < 400);
  const after = await fetch(`${BASE}/api/contacts/${contact.id}`);
  assert.equal(after.status, 404);
});

test("rejects invalid contact payloads", async () => {
  const r = await fetch(`${BASE}/api/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "not-an-email" }),
  });
  assert.equal(r.status, 400);
});

// ── Interactions ────────────────────────────────────────────────────────────
test("log and list interactions for a contact", async () => {
  const c = await json(
    await fetch(`${BASE}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Grace", lastName: "Hopper" }),
    })
  );
  const log = await fetch(`${BASE}/api/contacts/${c.id}/interactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note: "coffee chat", contactedAt: new Date().toISOString() }),
  });
  assert.ok(log.status < 400);
  const list = await json(await fetch(`${BASE}/api/contacts/${c.id}/interactions`));
  assert.ok(Array.isArray(list) && list.length >= 1);
  assert.equal(list[0].note ?? list[list.length - 1].note, "coffee chat");
});

// ── Check-in reminders ──────────────────────────────────────────────────────
// Note: auto-creation of check-in reminders happens client-side; the API
// supports explicit reminder CRUD, which is what we verify here.
test("reminder CRUD: create, list, dismiss, delete", async () => {
  const c = await json(
    await fetch(`${BASE}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Alan", lastName: "Turing" }),
    })
  );
  const create = await fetch(`${BASE}/api/reminders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contactId: c.id,
      type: "check_in",
      title: "Catch up with Alan",
      checkInAfterDays: 180,
      isRecurring: true,
    }),
  });
  assert.equal(create.status, 201);
  const reminder = await json(create);

  const forContact = await json(await fetch(`${BASE}/api/contacts/${c.id}/reminders`));
  assert.ok(forContact.some((r) => r.id === reminder.id));

  const dismiss = await fetch(`${BASE}/api/reminders/${reminder.id}/dismiss`, { method: "POST" });
  assert.equal(dismiss.status, 204);
  const afterDismiss = (await json(await fetch(`${BASE}/api/contacts/${c.id}/reminders`)))
    .find((r) => r.id === reminder.id);
  assert.equal(afterDismiss.isDismissed, true);

  const del = await fetch(`${BASE}/api/reminders/${reminder.id}`, { method: "DELETE" });
  assert.equal(del.status, 204);
  const afterDelete = await json(await fetch(`${BASE}/api/contacts/${c.id}/reminders`));
  assert.ok(!afterDelete.some((r) => r.id === reminder.id));
});

// ── Tags ────────────────────────────────────────────────────────────────────
test("create and list custom tags", async () => {
  const put = await fetch(`${BASE}/api/tags`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connectionTags: ["mentor", "friend"], industryTags: [] }),
  });
  assert.ok(put.status < 400);
  const tags = await json(await fetch(`${BASE}/api/tags`));
  assert.ok(tags.connectionTags.includes("mentor"));
});

// ── Filtering ───────────────────────────────────────────────────────────────
test("contacts list returns all contacts (filtering is client-side)", async () => {
  for (const name of [["Frida", "Kahlo"], ["Diego", "Rivera"]]) {
    await fetch(`${BASE}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: name[0], lastName: name[1] }),
    });
  }
  const all = await json(await fetch(`${BASE}/api/contacts`));
  assert.ok(Array.isArray(all) && all.length >= 2);
  assert.ok(all.some((c) => c.firstName === "Frida") && all.some((c) => c.firstName === "Diego"));
  // API ignores unknown query params rather than erroring
  const ignored = await fetch(`${BASE}/api/contacts?search=Ada`);
  assert.equal(ignored.status, 200);
});

// ── Bulk import ─────────────────────────────────────────────────────────────
test("bulk import: preview then execute a CSV", async () => {
  const csv = "First Name,Last Name,Email\nMarie,Curie,marie@example.com\nNikola,Tesla,nikola@example.com\n";
  const csvPath = join(tmpDir, "contacts.csv");
  writeFileSync(csvPath, csv);

  const preview = await fetch(`${BASE}/api/import/preview`, {
    method: "POST",
    body: (() => {
      const fd = new FormData();
      fd.append("file", new Blob([csv]), "contacts.csv");
      return fd;
    })(),
  });
  assert.equal(preview.status, 200);
  const pv = await json(preview);
  assert.ok(pv.headers?.length >= 2 || pv.sampleRows?.length >= 1 || pv.rows?.length >= 1);

  const mapping = JSON.stringify(
    Object.fromEntries([["First Name", "firstName"], ["Last Name", "lastName"], ["Email", "email"]])
  );
  const exec = await fetch(`${BASE}/api/import/execute`, {
    method: "POST",
    body: (() => {
      const fd = new FormData();
      fd.append("file", new Blob([csv]), "contacts.csv");
      fd.append("mapping", mapping);
      return fd;
    })(),
  });
  assert.ok(exec.status < 400, `import execute failed: ${exec.status}`);
  const list = await json(await fetch(`${BASE}/api/contacts`));
  assert.ok(list.some((c) => c.firstName === "Marie"), "imported contact not found");
});
