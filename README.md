# GreyHub

GreyHub is a private work and order tracker for a Minecraft company. Employees can claim work, form crews, submit image proof and track their record. Managers review completed work, manage accounts and roles, and record payments made outside the site.

## Requirements

- Node.js 20 or newer
- npm

## Install and run

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The SQLite database and demo records are created automatically on first run.

## Environment

| Variable        | Default             | Purpose              |
| --------------- | ------------------- | -------------------- |
| `DATABASE_PATH` | `./data/greyhub.db` | SQLite database file |

Profile pictures and proof images are stored under `public/uploads` during development. Keep that directory persistent when deploying, or replace it with object storage later.

## Development accounts

| Username | Password   | Access   |
| -------- | ---------- | -------- |
| `admin`  | `greyhub`  | Admin    |
| `alex`   | `trail123` | Employee |
| `rowan`  | `trail123` | Employee |

Change these passwords before using the site with real data.

## Checks

```bash
npm run check
```

For a production-style local run, use `npm run build` followed by `npm start`.
