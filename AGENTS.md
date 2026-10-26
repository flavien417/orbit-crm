# AGENTS.md — orbit-crm

Personal CRM (React + Vite frontend, Express backend, SQLite via Drizzle ORM). Runs fully local; DB at `~/orbit-crm.db`.

## Requirements
- Node.js 22 LTS (nvm-managed on this machine: `nvm use 22`). Node 26 breaks `better-sqlite3@11` builds — don't use it here.

## Commands
- `npm run dev` — dev server with hot reload (use for development)
- `npm run build` — production build (Vite + esbuild)
- `npm start` — run production build, serves http://localhost:5000
- `npm install` — install dependencies (package-lock.json is the source of truth)

## Directory Structure
- `client/` — React frontend (Tailwind, shadcn/ui, TanStack Query)
- `server/` — Express backend
- `shared/` — types shared between client and server
- `script/` — utility scripts
- `drizzle.config.ts` — Drizzle ORM config (SQLite)

## Conventions
- TypeScript throughout; keep shared types in `shared/`, not duplicated in client/server.
- Never commit secrets; no `.env` committed. DB file lives in the home directory, not the repo.
- Verify every new dependency exists in the registry before adding (slopsquatting risk).
- Do not add dependencies without asking first.
- Test changes with `npm run dev`; run `npm run build` before declaring build-level work done.
