# Servers And Roles

Last verified: 2026-07-03

## Server Inventory

| Name | IP | Domains | Main role |
| --- | --- | --- | --- |
| `pentime-new` | `8.218.67.248` | `pentime-new.com`, `www.pentime-new.com` | Official website, static download page, Electron auto-update metadata and release artifacts |
| `pentime-api` | `47.83.218.38` | `pentime-api.com`, `www.pentime-api.com` | Pen-Time New API panel/backend, MySQL, Redis, model pricing/billing, auth pages |

Do not store server passwords in this repository.

## `pentime-new` Website And Auto Update

Observed shape:

- OS host serves Nginx directly.
- Nginx config: `/etc/nginx/conf.d/pentime-updates.conf`
- Website/update root: `/usr/share/nginx/html/pentime-updates`
- Static official page: `/usr/share/nginx/html/pentime-updates/index.html`
- Auto-update config: `/usr/share/nginx/html/pentime-updates/app-upgrade-config.json`
- Release directory pattern: `/usr/share/nginx/html/pentime-updates/pen-time/releases/v<version>/`
- Backups: `/usr/share/nginx/html/pentime-updates/backups/`
- SSL cert paths:
  - `/etc/nginx/ssl/pentime-new.com.pem`
  - `/etc/nginx/ssl/pentime-new.com.key`

Stable Nginx redirects:

- `/download/windows` -> latest Windows setup package
- `/download/macos-arm64` -> Apple Silicon DMG
- `/download/macos-x64` -> Intel Mac DMG

Current stable Windows redirect target:

```nginx
return 302 /pen-time/releases/v1.10.0/Pen-Time-1.10.0-x64-setup.exe;
```

Validation commands:

```powershell
curl.exe -I https://pentime-new.com/app-upgrade-config.json
curl.exe -I https://pentime-new.com/pen-time/releases/v1.10.0/latest.yml
curl.exe -I -L https://pentime-new.com/download/windows
curl.exe -I -L https://www.pentime-new.com/download/windows
```

Remote Nginx checks:

```bash
nginx -t
systemctl reload nginx
grep -n 'return 302 /pen-time/releases' /etc/nginx/conf.d/pentime-updates.conf
```

## `pentime-api` New API Server

Observed shape:

- Main service is Docker based.
- Current New API container: `newapi_xtak-new-api-1`
- Current image tag observed: `pentime-new-api:v1.0.0-rc.5-pentime-second-price-billing-20260701-1139`
- Port mapping: `0.0.0.0:3000->3000/tcp`
- Supporting containers:
  - `newapi_xtak-mysql-1` (`mysql:8.2`)
  - `newapi_xtak-redis-1` (`redis:latest`)
  - `uptime-kuma` was observed restarting and is not relied on for current model status display.

Important non-secret paths:

- New API data mount: `/www/dk_project/dk_app/newapi/newapi_xtAK/data`
- New API log mount: `/www/dk_project/dk_app/newapi/newapi_xtAK/logs`
- Build archives: `/root/pentime-newapi-builds`
- Backups: `/root/pentime-newapi-backups`

Host `/etc/nginx/conf.d` was empty when checked on 2026-07-03, so domain ingress may be managed elsewhere on that server stack. Verify before editing reverse proxy behavior.

Useful read-only checks:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
docker logs --tail=200 newapi_xtak-new-api-1
docker inspect newapi_xtak-new-api-1 --format '{{.Config.Image}}'
docker inspect newapi_xtak-new-api-1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
```

Do not paste `docker inspect` environment output into docs because it can contain database passwords and secrets.

