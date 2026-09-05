# Setup & deployment

## Requirements
* Node.js **22.5+** (uses the built-in `node:sqlite`; no native compilation)
* ~120 MB disk for a school of a few hundred users plus uploads
* No external services required

## Install & run

```bash
git clone <this repo> && cd AfghanSchool_Dari
npm install            # only 6 small dependencies
npm start              # http://localhost:4000
```

On first start the database is created at `data/app.db`, migrated, and seeded with the two
demo organisations. The server binds `0.0.0.0` and prints the orgs it found.

```
npm run seed     # seed without starting the server
npm run reset    # wipe all rows and reseed the demo data
npm test         # jsdom smoke test (see docs/API.md)  — optional
```

## Environment variables (`.env`)

```ini
PORT=4000
HOST=0.0.0.0
DATA_DIR=./data                 # sqlite db + uploads live here
DB_PATH=./data/app.db
MAX_UPLOAD_MB=20
COOKIE_SECURE=1                 # set to 1 when served over HTTPS
REMINDER_INTERVAL_MIN=30        # homework / appointment / stock reminders
LOG_FORMAT=tiny

# --- AI tutor -------------------------------------------------------------
# Leave empty to use the built-in offline engine (works with no internet).
OPENAI_API_KEY=
AI_MODEL=gpt-4o-mini
AI_BASE_URL=https://api.openai.com/v1   # or http://localhost:11434/v1 for Ollama
AI_TIMEOUT_MS=25000
AI_ENABLED=1
```

A ready-to-copy template is in `.env.example`.

## Running for real (VPS / local server)

Any always-on machine works — a small VPS, a mini PC in the school, or a Raspberry Pi-class
device for a single site.

### systemd unit
```ini
[Unit]
Description=Afghan Care & School
After=network.target

[Service]
WorkingDirectory=/opt/afghan-care
ExecStart=/usr/bin/node --experimental-sqlite server.js
Restart=always
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=COOKIE_SECURE=1

[Install]
WantedBy=multi-user.target
```

### nginx reverse proxy (HTTPS)
```nginx
server {
  listen 443 ssl http2;
  server_name school.example.af;

  ssl_certificate     /etc/letsencrypt/live/school.example.af/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/school.example.af/privkey.pem;

  client_max_body_size 25m;     # homework photos / audio

  location / {
    proxy_pass         http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header   Host $host;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}
```

### Docker (optional)
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=4000
VOLUME /app/data
EXPOSE 4000
CMD ["node", "--experimental-sqlite", "server.js"]
```

> **Vercel / serverless note:** the app writes to a SQLite file and to disk, so it needs a
> persistent filesystem. It runs fine on any VM, Fly.io/Render-style container, or a machine
> in the school. On pure serverless platforms, point `DATA_DIR` at a mounted volume or move
> to a managed Postgres (the query layer is isolated in `src/db.js`).

## Backups

Everything user-generated lives in `data/`:

```bash
# nightly cron — SQLite safe-copy while running
sqlite3 data/app.db ".backup '/backup/app-$(date +%F).db'"
rsync -a data/uploads /backup/uploads
```

## Adding your own school or clinic

1. Sign in as `demo.admin` (or create an admin) and use the admin screens for classes,
   subjects, timetable, holidays and users.
2. For bulk onboarding use **CSV import** (`Admin → Import CSV`):

```csv
username,name,role,class_id,parent_username,phone
ahmadi.ahmad,Ahmad Ahmadi,student,cls_xxx,ahmadi.parent,+93700000000
ahmadi.parent,Mr Ahmadi,parent,,, +93700000001
rahimi.maryam,Maryam Rahimi,teacher,,,+93700000002
```
   `class_id` comes from `GET /api/school/classes`; `parent_username` links the child.
   Default password for imported accounts: `secret123` (change it in the row or afterwards).
3. Delete the demo accounts when you go live:
   `DELETE FROM users WHERE username LIKE 'demo.%';` (plus their sessions), or simply
   `npm run reset` and re-create your data.

## AI tutor configuration

| Mode | Setting | Behaviour |
|---|---|---|
| Offline (default) | no key | Rule-based tutor with the built-in curriculum bank; no internet needed |
| OpenAI | `OPENAI_API_KEY=sk-…` | LLM answers with the same Socratic system prompt |
| Compatible / local | `AI_BASE_URL=http://localhost:11434/v1` + `AI_MODEL=llama3` | Any OpenAI-compatible server, e.g. Ollama, running on your own hardware |

If the LLM call fails or times out the engine silently falls back to the offline answers, so
students are never blocked. Guardrails (never solving the student's own task) are applied
before and after the LLM call.

## SMS reminders 🔜

`src/notify.js` builds the reminder text in all three languages; add a gateway call inside
`runReminders()` (Kannel, Africa's Talking, a local GSM modem gateway) and set the patient's
`phone`. The text is already localised per user, so nothing else has to change.

## Hardening checklist before going live

- [ ] `COOKIE_SECURE=1` and HTTPS only
- [ ] Change or delete every `demo.*` account
- [ ] Replace default passwords from CSV imports (`secret123`)
- [ ] Nightly backup of `data/`
- [ ] `MAX_UPLOAD_MB` tuned to your storage
- [ ] Restrict `/admin` screens to trusted staff (roles `admin` / `principal`)
- [ ] Review the audit log periodically
