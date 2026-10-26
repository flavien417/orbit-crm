# Orbit — Personal CRM

A self-hosted personal CRM to keep track of friends, acquaintances, and contacts. Runs entirely on your local machine — your data never leaves your computer.

## Features

- **Contact management** — store photos, contact methods (phone, email, Instagram, LinkedIn, etc.), relationship tags, and industry tags
- **Custom tags** — create and delete your own relationship and industry tags
- **Interaction logging** — log contact with one click; optionally add a note
- **Check-in reminders** — auto-created for every contact (default: every 6 months); reset automatically when you log an interaction
- **Dashboard** — see upcoming check-ins, overdue contacts, and recent activity at a glance
- **Filter contacts** — filter by relationship type and/or industry
- **Dark mode** — full dark/light mode support
- **Bulk import** — mass import contacts from any CSV or Excel file


## Requirements

- [Node.js](https://nodejs.org) v18 or newer

## Getting Started

```bash
git clone https://github.com/FlavienPMoise/orbit-crm.git
cd orbit-crm
npm install
npm run build
npm start
```

Then open **http://localhost:5000** in your browser.

## Development

Run the dev server with hot reload:

```bash
npm install
npm run dev
```

## Upgrading (existing installs)

If you already have Orbit installed, updating is safe and non-destructive — your database lives at `~/orbit-crm.db` outside the repo, so it's never touched by a pull or rebuild.

```bash
git pull
npm install
npm run build
```

Then restart the server. If you run it manually, stop the old process (`Ctrl+C`) and run `npm start` again. If you use the optional systemd auto-start:

```bash
systemctl --user restart orbit-crm
```

No database migration is needed — data carries over automatically.

## Data

Your database is stored at `~/orbit-crm.db` (your home directory). It persists across restarts and updates — just don't delete that file.

## Auto-start on Linux (optional)

Create `~/.config/systemd/user/orbit-crm.service`:

```ini
[Unit]
Description=Orbit Personal CRM

[Service]
WorkingDirectory=/path/to/orbit-crm
ExecStart=node dist/index.cjs
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
```

Then run:

```bash
npm run build
systemctl --user enable --now orbit-crm
```

## Tech Stack

- **Frontend:** React, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend:** Express.js
- **Database:** SQLite via Drizzle ORM
- **Build:** Vite + esbuild
