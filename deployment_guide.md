# OneMapan Deployment Guide

Two supported deployment targets:

1. **Bare VPS** – Node.js + PM2 + PostgreSQL + Nginx (no containers).
2. **Docker on VPS** – clone the repo from GitHub and build with `docker compose`.

Both targets use the same public routing and the same environment variables.

- **Last updated:** 2026-10-29

---

## 1. Architecture

```
Browser ──HTTPS──> Nginx ──┬── /            -> Next.js frontend  (127.0.0.1:3000)
                           ├── /api/        -> Express backend   (127.0.0.1:2025)
                           └── /uploads/    -> Express backend   (127.0.0.1:2025)
                                              │
                                              └──> PostgreSQL
```

| Component  | Location           | Port              | Notes                                        |
| ---------- | ------------------ | ----------------- | -------------------------------------------- |
| Frontend   | `frontend/`        | 3000              | Next.js, binds to 127.0.0.1 behind Nginx      |
| Backend    | `backend/`         | 2025              | Express, `dist/index.js`                      |
| Database   | Postgres 14+ / 16  | 5432 (loopback only) | Prisma migrations                           |
| Nginx      | reverse proxy      | 80/443            | Only public entry point                       |

**Why `/api/` path?** The frontend is served from your domain and the API is
called on the same domain, so everything is *same-origin* and CORS is never
triggered in normal use. The backend still has CORS configured for direct
access (`ALLOWED_ORIGINS`).

### URL design (critical, read before choosing variables)

| Variable                  | Example value                  | Used for                                                                 |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `SERVER_BASE_URL`         | `https://example.com`          | Absolute URLs returned by the API (poster images → `/uploads/...`)        |
| `NEXT_PUBLIC_API_URL`     | `https://example.com/api`      | Where the browser calls the API (must be `SERVER_BASE_URL` + `/api`)      |
| `ALLOWED_ORIGINS`         | `https://example.com`          | CORS allow-list (comma separated)                                         |

`NEXT_PUBLIC_*` values are **inlined at build time**. Changing them requires
rebuilding the frontend.

---

## 2. Prerequisites (both targets)

### Server
- Ubuntu 22.04 / 24.04 LTS (or any Debian-based distro)
- 2 GB RAM minimum (4 GB recommended), 20 GB disk
- A DNS A record pointing `example.com` → server IP (recommended for SSL)
- SSH access with sudo

### Base hardening (run this first in both targets)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw fail2ban unzip

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status

sudo systemctl enable --now fail2ban
```

> Never expose ports 2025, 3000 or 5432 publicly. Both targets bind them to
> `127.0.0.1`; UFW is a second line of defence.

---

# Target 1 — Bare VPS (Node.js + PM2 + Nginx)

## 1.1 Install Node.js 20

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 20
nvm use 20

node --version   # v20.x
npm --version
```

```bash
# Build toolchain: bcrypt may fall back to compiling a native addon.
sudo apt install -y build-essential python3
```

```bash
sudo npm install -g pm2
```

## 1.2 Install and configure PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

sudo -u postgres createuser -s onemapan
sudo -u postgres createdb -O onemapan onemapan
sudo -u postgres psql -c "ALTER USER onemapan WITH PASSWORD 'STRONG_PASSWORD';"
```

Test the connection:

```bash
PGPASSWORD='STRONG_PASSWORD' psql -U onemapan -d onemapan -h 127.0.0.1 -c "select 1;"
```

## 1.3 Clone the application

```bash
sudo mkdir -p /opt/onemapan
sudo chown $USER:$USER /opt/onemapan
cd /opt/onemapan

git clone https://github.com/your-org/onemapan.git .
```

## 1.4 Configure the backend

```bash
cd /opt/onemapan/backend
cp .env.example .env
```

Edit `.env`:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=2025
DATABASE_URL="postgresql://onemapan:STRONG_PASSWORD@127.0.0.1:5432/onemapan"

# Required, minimum 32 characters. Never reuse an old/weak value.
# Generate with: openssl rand -hex 48
JWT_SECRET=...
JWT_EXPIRES_IN=1d

SERVER_BASE_URL=https://example.com
ALLOWED_ORIGINS=https://example.com
TRUST_PROXY=1
UPLOAD_MAX_FILE_SIZE=5242880
```

> The app **fails to start on purpose** if `JWT_SECRET` is missing, shorter
> than 32 characters, or still a placeholder from `.env.example`.

## 1.5 Install dependencies, generate the client, migrate

```bash
cd /opt/onemapan/backend
npm ci                 # reproducible install from package-lock.json
npx prisma generate
npx prisma migrate deploy
npm run build          # emits backend/dist/index.js
test -f dist/index.js && echo "build ok"
```

## 1.6 Install the frontend

```bash
cd /opt/onemapan/frontend

# Configure the API URL (build-time value, inlined into the JS bundle).
# This file is git-ignored, so it must be created on every server.
cat > .env.production <<'EOF'
NEXT_PUBLIC_API_URL=https://example.com/api
EOF

npm ci
npm run build          # next build (inlines NEXT_PUBLIC_API_URL)
test -d .next && echo "build ok"
```

## 1.7 Process management with PM2

Create `/opt/onemapan/ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: "onemapan-api",
      cwd: "/opt/onemapan/backend",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
      error_file: "/var/log/onemapan/api-error.log",
      out_file: "/var/log/onemapan/api-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "onemapan-web",
      cwd: "/opt/onemapan/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
      instances: 1,
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
      error_file: "/var/log/onemapan/web-error.log",
      out_file: "/var/log/onemapan/web-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
```

```bash
sudo mkdir -p /var/log/onemapan && sudo chown $USER /var/log/onemapan

cd /opt/onemapan
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd     # follow the printed sudo command
pm2 list
pm2 logs onemapan-api
```

### Systemd alternative (API only, no PM2)

Create `/etc/systemd/system/onemapan.service`:

```ini
[Unit]
Description=OneMapan API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/onemapan/backend
ExecStart=/home/ubuntu/.nvm/versions/node/v20.19.0/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

> Environment variables come from `/opt/onemapan/backend/.env` (loaded by the
> app itself), so you do not need to repeat them in the unit file.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now onemapan
sudo journalctl -u onemapan -f
```

## 1.8 Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

Create `/etc/nginx/sites-available/onemapan` (used by **both** targets):

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name example.com;

    # Uploads are limited to 5 MB (posters) / ~10 MB (Excel imports)
    client_max_body_size 20m;

    # ---- API: NEXT_PUBLIC_API_URL = https://example.com/api ----
    # Trailing slash on proxy_pass strips the /api prefix.
    location /api/ {
        proxy_pass http://127.0.0.1:2025/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # ---- Images/files uploaded through the API ----
    location /uploads/ {
        proxy_pass http://127.0.0.1:2025;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        expires 1h;
        add_header Cache-Control "public";
    }

    # ---- Frontend ----
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/onemapan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 1.9 SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com --redirect
sudo certbot renew --dry-run
```

## 1.10 Verify

```bash
curl -i http://127.0.0.1:2025/healthz          # HTTP 200 {"status":"ok"}
curl -i http://127.0.0.1:3000/                  # HTTP 200
curl -i https://example.com/api/healthz         # HTTP 200
curl -i https://example.com/                    # frontend
pm2 list
```

## 1.11 Update a bare-VPS deployment

```bash
cd /opt/onemapan
git pull origin main

cd backend && npm ci && npx prisma generate && npx prisma migrate deploy && npm run build && cd ..
cd frontend && npm run build && cd ..

pm2 restart onemapan-api && pm2 restart onemapan-web
pm2 status
```

---

# Target 2 — Docker on VPS (clone from GitHub and build)

## 2.1 Install Docker Engine + Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

## 2.2 Clone the repository

```bash
sudo mkdir -p /opt/onemapan
sudo chown $USER:$USER /opt/onemapan
cd /opt/onemapan

git clone https://github.com/your-org/onemapan.git .
```

## 2.3 Create the Compose environment file

`docker-compose.yml` reads **only** the `.env` file in the repo root:

```bash
cd /opt/onemapan
cp .env.example .env
chmod 600 .env
$EDITOR .env
```

Minimum required values:

```dotenv
POSTGRES_USER=onemapan
POSTGRES_PASSWORD=STRONG_DATABASE_PASSWORD
POSTGRES_DB=onemapan

JWT_SECRET=openssl-rand-hex-48-output-at-least-32-characters
JWT_EXPIRES_IN=1d

SERVER_BASE_URL=https://example.com
ALLOWED_ORIGINS=https://example.com
NEXT_PUBLIC_API_URL=https://example.com/api
```

> `JWT_SECRET` shorter than 32 characters stops the backend container at
> startup — that is intentional.

## 2.4 Build and start everything

```bash
cd /opt/onemapan
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

What the build does:

- **backend**: `npm ci` → `prisma generate` → `tsc` (emits `dist/index.js`) →
  runtime image runs `prisma migrate deploy` then `node dist/index.js`.
- **frontend**: `npm ci` → `next build` with `NEXT_PUBLIC_API_URL` → `next start`.

Persistent data:

| Volume            | Mounted at                | Purpose                          |
| ----------------- | ------------------------- | -------------------------------- |
| `onemapan_db_data` | `/var/lib/postgresql/data` | Database                         |
| `onemapan_uploads` | `/app/public/uploads`      | Uploaded posters/images          |

> Check exact names with `docker volume ls` (prefixed by the directory name).

## 2.5 Ports

`docker-compose.yml` publishes all services on loopback only:

```yaml
ports:
  - "127.0.0.1:2025:2025"   # backend
  - "127.0.0.1:3000:3000"   # frontend
  - "127.0.0.1:5432:5432"   # postgres (local admin tools only)
```

Only Nginx (80/443) is reachable from the internet. Use the **same Nginx
config as Target 1, step 1.8**, and the same SSL steps (1.9).

## 2.6 Verify

```bash
curl -i http://127.0.0.1:2025/healthz
curl -i http://127.0.0.1:3000/
docker compose ps                 # all services "healthy"
curl -i https://example.com/api/healthz
```

## 2.7 Common Docker operations

```bash
docker compose ps                      # status + healthchecks
docker compose logs -f backend         # API logs
docker compose logs -f frontend
docker compose restart backend         # restart one service
docker compose up -d --build           # rebuild after a code change
docker compose down                    # stop (data volumes are kept)
docker compose down -v                 # stop AND delete data  <-- destructive
docker system df                       # image/disk usage
```

### Manual database migration (optional)

Migrations already run automatically at container start. To run them by hand:

```bash
docker compose run --rm backend npx prisma migrate deploy
```

### Database shell

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## 2.8 Update a Docker deployment

```bash
cd /opt/onemapan
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend
```

If only `NEXT_PUBLIC_API_URL` changed:

```bash
docker compose build frontend && docker compose up -d frontend
```

## 2.9 Docker deployment checklist

- [ ] Docker + compose plugin installed, user added to `docker` group
- [ ] Repository cloned from GitHub
- [ ] `.env` created from `.env.example`, `chmod 600`, secrets are strong
- [ ] `docker compose up -d --build` — all services `healthy`
- [ ] Nginx + SSL configured (step 1.8 / 1.9)
- [ ] `https://example.com/api/healthz` returns `{"status":"ok"}`
- [ ] Login works from a browser
- [ ] An image upload (poster) survives `docker compose restart backend`
- [ ] Backups scheduled (2.10)
- [ ] UFW allows only 22/80/443

## 2.10 Backups

Add a cron job (root, daily at 02:00):

```bash
sudo tee /usr/local/bin/backup_onemapan.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/onemapan
TS=$(date +%Y%m%d_%H%M%S)
DEST=/var/backups/onemapan
mkdir -p "$DEST"

# Database dump (runs inside the db container)
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > "$DEST/db_$TS.sql.gz"

# Uploaded images (named volume)
VOLUME=$(docker volume ls -q | grep '_uploads$' | head -n1)
if [ -n "$VOLUME" ]; then
  docker run --rm -v "$VOLUME":/data -v "$DEST":/backup alpine \
    tar czf "/backup/uploads_$TS.tgz" -C /data .
fi

find "$DEST" -name 'db_*.sql.gz' -mtime +30 -delete
find "$DEST" -name 'uploads_*.tgz' -mtime +30 -delete
EOF

sudo chmod +x /usr/local/bin/backup_onemapan.sh
echo "0 2 * * * root /usr/local/bin/backup_onemapan.sh >> /var/log/onemapan-backup.log 2>&1" | sudo tee /etc/cron.d/onemapan-backup
```

**Bare-VPS equivalent** (host `pg_dump` instead of a container):

```bash
# peer authentication as the postgres OS user – no password needed
sudo -u postgres pg_dump onemapan | gzip > /var/backups/onemapan/db_$(date +%F).sql.gz
tar czf /var/backups/onemapan/uploads_$(date +%F).tgz -C /opt/onemapan/backend/public uploads
```

Test a restore before you rely on the backups:

```bash
gunzip -c db_YYYYMMDD.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

---

## 3. Environment variables reference

| Variable               | Required | Default             | Description                                                        |
| ---------------------- | -------- | ------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`             | yes      | `development`       | Set `production` on servers                                        |
| `PORT`                 | no       | `2025`              | API port                                                           |
| `HOST`                 | no       | `0.0.0.0`           | API bind address. Use `127.0.0.1` behind Nginx (bare VPS)           |
| `DATABASE_URL`         | yes      | –                   | Prisma/Postgres connection string                                  |
| `JWT_SECRET`           | yes      | –                   | **Minimum 32 chars**; app refuses to start otherwise               |
| `JWT_EXPIRES_IN`       | no       | `1d`                | Token lifetime                                                     |
| `SERVER_BASE_URL`      | yes      | –                   | Public API base URL (no trailing slash) used for `/uploads/...`     |
| `ALLOWED_ORIGINS`      | no       | `http://localhost:3000` | CORS allow-list, comma separated                               |
| `TRUST_PROXY`          | yes when behind Nginx | –     | `1` makes rate limiting key on the real client IP. Without it all users share one bucket |
| `UPLOAD_MAX_FILE_SIZE` | no       | `5242880` (5 MB)    | Max upload size in bytes                                           |
| `NEXT_PUBLIC_API_URL`  | yes (frontend, build time) | `http://localhost:2025` | Browser API base URL; must end with `/api` for the provided Nginx config |

---

## 4. Security checklist (both targets)

- [ ] `JWT_SECRET` is random, ≥ 32 chars, and stored only in `.env` (`chmod 600`)
- [ ] `.env` is git-ignored (it is) — never committed to GitHub
- [ ] UFW allows only SSH/80/443
- [ ] PostgreSQL bound to loopback / container network, never public
- [ ] Nginx `client_max_body_size` set (20 MB) so imports are not rejected
- [ ] `TRUST_PROXY=1` so per-IP rate limits (login 10/15 min) work correctly
- [ ] TLS enabled with auto-renewal (`certbot renew --dry-run`)
- [ ] Running as non-root: containers drop to `onemapan` user automatically; on bare VPS run PM2 as a normal user
- [ ] Backups scheduled **and a restore tested**
- [ ] `curl https://example.com/api/role` without a token returns `401`
- [ ] `curl https://example.com/api/uploads/..%2f..%2f.env` returns `403/404`
- [ ] App fails to start when `JWT_SECRET` is missing (fail-fast)

---

## 5. Monitoring and health checks

- Backend: `GET /healthz` → `200 {"status":"ok"}` (does not query the database)
- Frontend: `GET /` → `200`
- Docker: built-in `HEALTHCHECK` in both images (`docker compose ps`)
- PM2: `pm2 list`, `pm2 logs onemapan-api`
- External: point UptimeRobot/Pingdom at `https://example.com/api/healthz`

Logs:

| Target      | Location                                                |
| ----------- | ------------------------------------------------------- |
| Docker      | `docker compose logs -f backend` / `frontend` / `db`     |
| PM2         | `/var/log/onemapan/*.log`, `pm2 logs`                    |
| Nginx       | `/var/log/nginx/access.log`, `error.log`                 |
| Certbot     | `/var/log/letsencrypt/`                                 |

Rotate logs with `logrotate` (PM2 path) or Docker's `json-file` driver:

```json
{
  "driver": "json-file",
  "options": { "max-size": "10m", "max-file": "5" }
}
```

Set it in `/etc/docker/daemon.json` and restart Docker.

---

## 6. Troubleshooting

### Backend exits immediately: "Missing required environment variable: JWT_SECRET"
`.env` is missing or not found. The backend always loads `<backend>/.env`.
Create it from `.env.example`, or (Docker) from the repo-root `.env`.

### Backend exits: "JWT_SECRET must be at least 32 characters"
Generate a strong secret: `openssl rand -hex 48`.

### `Can't reach database server at localhost:5432`
- Bare VPS: `sudo systemctl status postgresql`, check `DATABASE_URL` host/user/password.
- Docker: `docker compose ps` (db must be `healthy`), the host must be `db`, not `localhost`.

### `P1000` authentication failed → wrong `POSTGRES_PASSWORD`
The password inside an existing `db_data` volume does not change when you edit
`.env`. Either fix the password to match the existing data or (destructive)
`docker compose down -v && docker compose up -d --build`.

### API answers `403` CORS / browser blocks the call
`ALLOWED_ORIGINS` must contain the exact frontend origin, including scheme.

### All users are locked out after ~10 logins
`TRUST_PROXY` is not set, so rate limiting sees Nginx's IP for every request.
Set `TRUST_PROXY=1` and restart the backend.

### `413 Request Entity Too Large` on import/upload
Add `client_max_body_size 20m;` inside the Nginx `server` block.

### Poster images 404 after a container restart
The uploads volume is missing (`docker compose volumes`), or `SERVER_BASE_URL`
is wrong. Confirm `docker volume ls` shows `<project>_uploads`.

### Frontend still calls `http://localhost:2025`
`NEXT_PUBLIC_API_URL` is inlined at build time. Set it, then rebuild the
frontend image / run `npm run build` again.

### Prisma migration fails on deploy
```bash
npx prisma migrate status     # what is pending
npx prisma migrate deploy     # apply pending migrations only (never resets)
```
Do **not** use `migrate reset` in production — it drops all data.

### Port already in use
```bash
sudo ss -ltnp | grep -E ':(2025|3000|5432)'
# Docker: docker compose down
# Bare VPS: pm2 delete onemapan-api
```

### Rebuild everything from scratch (Docker)
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## 7. Rollback

**Docker**

```bash
cd /opt/onemapan
git log --oneline -5
git checkout <previous-commit>
docker compose up -d --build
# database: restore from a backup dump if a migration must be reverted
```

**Bare VPS**

```bash
cd /opt/onemapan
git checkout <previous-commit>
cd backend && npm ci && npm run build && cd ..
cd frontend && npm run build && cd ..
pm2 restart onemapan-api onemapan-web
```

Rollback steps for the database: restore the dump from section 2.10. Always
prefer *forward* migrations (fix + redeploy) over reverting schema changes.

---

## 8. VPS providers

- **Hetzner** – best value
- **DigitalOcean** – easiest onboarding
- **Linode/Akamai** – stable, good support
- **AWS EC2** – scalable but more moving parts

---

## 9. Final deployment checklist

- [ ] Server updated, UFW + fail2ban enabled
- [ ] Node 20 (Target 1) or Docker (Target 2) installed
- [ ] PostgreSQL up, database/user/password created
- [ ] Repo cloned from GitHub
- [ ] `.env` configured with strong secrets (`chmod 600`)
- [ ] Prisma client generated, migrations applied
- [ ] Backend + frontend built successfully
- [ ] API health check returns `200` on `/healthz`
- [ ] Processes survive a reboot (`pm2 startup` / `restart: unless-stopped`)
- [ ] Nginx routes `/`, `/api/`, `/uploads/` and is reachable over HTTPS
- [ ] Login, CRUD and file upload tested from a browser
- [ ] Backups scheduled and a restore verified
- [ ] Monitoring alerting on `https://example.com/api/healthz`

---

## 10. What was updated and fixed (changelog)

Summary of every change made in this round of work, grouped by area. Anything
listed here is already implemented in the codebase — this section exists so
reviewers and operators know exactly what changed relative to the previous
version.

### 10.1 Security fixes (backend)

| # | Issue (before) | Fix (after) |
| - | -------------- | ----------- |
| 1 | `JWT_SECRET` fell back to a hardcoded weak default when unset | Fail-fast validation in `backend/src/config/env.ts`: the server **refuses to start** if `JWT_SECRET` is missing, shorter than 32 characters, or still the `.env.example` placeholder |
| 2 | Static file serving built by hand with `path.join` + `existsSync` — path traversal possible (e.g. `/uploads/..%2f..%2f.env`) | Replaced with hardened `express.static` (`dotfiles: deny`, `index: false`, `fallthrough: false`) |
| 3 | Poster/image uploads accepted any file type and wrote it to disk | Memory storage + magic-byte validation (JPEG/PNG signatures) before writing; Excel imports validated as ZIP signature; size limited by `UPLOAD_MAX_FILE_SIZE` |
| 4 | Many routers were completely unauthenticated: `/role`, `/export`, `/import`, `/fotang`, `/dianchuanshi`, `/institution`, `/profile/location` | JWT auth middleware added to all of them; `/role` additionally restricted to national roles (`isNationalAccessRole`) |
| 5 | Frontend Excel import calls (`addUmatMenu.js`, `addQiudaoMenu.js`, `umat.js`, `qiudao.js`) sent **no** `Authorization` header | All import fetches now send `Authorization: Bearer <token>` |
| 6 | No password policy on register/change-password | Password policy helper (`backend/src/utils/password.ts`) enforcing minimum length/complexity |
| 7 | Verbose error responses leaked stack traces and internals | Generic error responses via `sendError`/`sendBadRequest` (`backend/src/utils/respond.ts`); central error handler returns a fixed message for 500s |
| 8 | No security headers, no rate limiting, wide-open CORS | `helmet` security headers; `express-rate-limit` (login/register/change-password 10 req/15 min, uploads 30 req/15 min); CORS allow-list from `ALLOWED_ORIGINS`; `x-powered-by` disabled |
| 9 | `user_info_id` type mismatch between Prisma schema and code | Schema/type alignment so relation queries cannot break or be abused |
| 10 | Behind Nginx, `req.ip` was the proxy address, so per-IP rate limits shared one bucket | `TRUST_PROXY` env support (`app.set("trust proxy", ...)`) |

New backend helpers:

- `backend/src/config/env.ts` — validated environment config
- `backend/src/utils/http-error.ts`, `file-types.ts`, `password.ts`, `respond.ts`
- `backend/src/middleware/rate-limit.ts`

### 10.2 Dependency upgrades

| Package | Before | After | Reason |
| ------- | ------ | ----- | ------ |
| `jsonwebtoken` | 8.x | 9.x | v8 has known vulnerabilities / insecure defaults |
| `multer` | 1.x | 2.5.x | old version, security fixes in 2.x |
| `csv-parse` | 5.x | 7.x | current major, fixes advisories |
| `helmet` | — | 8.x | new: security headers |
| `express-rate-limit` | — | 8.x | new: brute-force protection |
| `prisma` | devDependencies | dependencies | needed at runtime for `prisma migrate deploy` in the container |
| `jwt-decode`, `qs` | backend deps | removed | unused |

`npm audit` result: went from **2 critical + 9 high** to **2 moderate**
(both are transitive via `exceljs` → `uuid`, accepted risk; `exceljs` is
unmaintained upstream — consider replacing it later).

### 10.3 Build and startup fixes

- Backend `npm run build` previously emitted `.js` files **next to** the
  TypeScript sources while `npm start` expected `dist/index.js` (start was
  broken). Added `backend/tsconfig.build.json`; build now emits
  `backend/dist/index.js` (verified: 51 files, `node dist/index.js` runs).
- Stray compiled `.js` files under `backend/src` were deleted.
- Added `GET /healthz` (returns `{"status":"ok"}`, no DB access) for Docker
  healthchecks, systemd and uptime monitors.
- Added `HOST` env var so the API can bind to `127.0.0.1` behind Nginx.

### 10.4 Frontend changes

- New `frontend/src/lib/api.js` exporting `API_BASE_URL`, taken from the
  `NEXT_PUBLIC_API_URL` build-time env var (default `http://localhost:2025`).
  The previously hardcoded `http://localhost:2025` in `umat.js`, `qiudao.js`,
  `addUmatMenu.js`, `addQiudaoMenu.js` is gone.
- `frontend/src/lib/axios.js` now uses `API_BASE_URL` and attaches the JWT
  from `localStorage` via a request interceptor.

### 10.5 New deployment files

| File | Purpose |
| ---- | ------- |
| `docker-compose.yml` | Docker target: Postgres 16 + backend + frontend, fixed project name `onemapan`, loopback-only ports, healthchecks, named volumes for DB and uploads |
| `backend/Dockerfile` | Multi-stage: `npm ci` → `prisma generate` → `tsc` → prune dev deps → runtime runs `prisma migrate deploy && node dist/index.js` as non-root user |
| `frontend/Dockerfile` | Multi-stage: `npm ci` → `next build` with `NEXT_PUBLIC_API_URL` arg → `next start` as non-root user |
| `backend/.dockerignore`, `frontend/.dockerignore` | Keep `node_modules`, `.env`, build output out of the build context |
| `.env.example` (repo root) | Template for the Docker `.env` |
| `backend/.env.example` | Updated with new variables (`ALLOWED_ORIGINS`, `HOST`, etc.) |

### 10.6 New and changed environment variables

| Variable | Status | Notes |
| -------- | ------ | ----- |
| `JWT_SECRET` | **required** (was optional w/ weak fallback) | min 32 chars, fail-fast |
| `SERVER_BASE_URL` | **required** | public API base URL used for `/uploads/...` links |
| `DATABASE_URL` | required (unchanged) | |
| `HOST` | new, optional | bind address; `127.0.0.1` behind Nginx |
| `TRUST_PROXY` | new | `1` when behind Nginx so rate limiting keys on real client IPs |
| `ALLOWED_ORIGINS` | new | comma-separated CORS allow-list |
| `UPLOAD_MAX_FILE_SIZE` | new | bytes, default 5 MB |
| `NEXT_PUBLIC_API_URL` | new (frontend, build time) | browser-facing API base URL |

See section 3 for the full reference and `.env.example` files for templates.

### 10.7 Behavioural changes to be aware of

- **All existing JWTs become invalid** after deploy because the new
  `JWT_SECRET` takes effect — users simply log in again. This is intentional.
- Previously public endpoints (`/role`, `/export`, `/import`, ...) now
  require a valid token; any scripts calling them must send
  `Authorization: Bearer <token>`.
- Uploads with non-JPEG/PNG content are now rejected (400), even if they have
  a `.png` extension.
- Rate limits apply: 10 requests / 15 min per IP on login, register and
  change-password; 30 / 15 min on uploads. Set `TRUST_PROXY=1` behind Nginx
  or all users share one bucket (see troubleshooting in section 6).

### 10.8 Validation performed

- Backend: `tsc --noEmit` clean; `npm run build` produces `dist/index.js`;
  runtime smoke tests passed — 401 on protected routes, 403 on
  national-only `/role`, 404/403 on `..%2f` traversal, 429 after exceeding
  the login rate limit, generic (non-leaking) 500 body, CORS behaviour per
  `ALLOWED_ORIGINS`, fake-PNG upload rejected, real PNG accepted, fail-fast
  start without `JWT_SECRET`.
- `docker-compose.yml` validated as YAML (`npx js-yaml`).
- Frontend: dependency install and `next build` run locally; Docker images
  could not be build-tested on the authoring machine (no Docker available) —
  run `docker compose up -d --build` on the VPS as the final integration
  test.

---

*Last Updated: 2026-10-29*
*For OneMapan Backend + Frontend*
