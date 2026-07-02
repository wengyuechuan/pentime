# Pen-Time New API Operations

This document is for the `pentime-api` server and New API backend/custom panel work.

## Current Runtime Shape

- Server IP: `47.83.218.38`
- Domains: `pentime-api.com`, `www.pentime-api.com`
- Main app container: `newapi_xtak-new-api-1`
- Current image observed: `pentime-new-api:v1.0.0-rc.5-pentime-second-price-billing-20260701-1139`
- Main port mapping: `0.0.0.0:3000->3000/tcp`
- Data mount: `/www/dk_project/dk_app/newapi/newapi_xtAK/data`
- Log mount: `/www/dk_project/dk_app/newapi/newapi_xtAK/logs`
- Backups: `/root/pentime-newapi-backups`
- Build archives: `/root/pentime-newapi-builds`

Supporting containers:

- `newapi_xtak-mysql-1`
- `newapi_xtak-redis-1`
- `uptime-kuma` exists but was observed restarting; current model health UI should not depend on it.

## Backup First

Before changing New API:

1. Save container metadata and current compose file if present.
2. Dump MySQL.
3. Archive current source/build inputs.
4. Record current Docker image tag.

Command patterns:

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP=/root/pentime-newapi-backups/$STAMP
mkdir -p "$BACKUP"
docker ps > "$BACKUP/docker-ps.txt"
docker inspect newapi_xtak-new-api-1 > "$BACKUP/new-api-container-inspect.json"
docker inspect newapi_xtak-new-api-1 --format '{{.Config.Image}}' > "$BACKUP/new-api-image.txt"
docker exec newapi_xtak-mysql-1 sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" new-api' > "$BACKUP/mysql-new-api.sql"
```

The exact database password is environment-specific. Do not write it into repo files.

## Deploy Pattern

The safest path used so far:

1. Build or prepare a new Docker image with a timestamped tag.
2. Upload/keep source tarball under `/root/pentime-newapi-builds/<stamp>/`.
3. Backup current compose/config/database.
4. Update compose image tag.
5. Restart only New API first; keep MySQL and Redis volumes intact.
6. Validate health, login/register, dashboard, model list, pricing, and video generation.

Core commands:

```bash
docker ps
docker logs --tail=200 newapi_xtak-new-api-1
docker compose ps
docker compose up -d new-api
```

If the server does not have the active compose file in an obvious location, inspect `/root/pentime-newapi-backups/*/docker-compose*.yml` and current Docker labels before editing.

## Implemented Backend/Panel Themes

Major New API changes previously made:

- Login/register pages replaced with Pen-Time visual style.
- Login/register left-side animation integrated from provided HTML.
- Forgot password API connected to real reset flow.
- Reset email URL changed to `https://www.pentime-api.com/`.
- Dashboard layout customized:
  - overview restored
  - balance/history/request count cards restored
  - announcement and FAQ repositioned
  - model status/operation detail panel added
- Model status panel based on recent customer request data:
  - no recent calls means green/normal
  - chat/reasoning normal threshold around 21s
  - image model normal threshold around 210s
- Video billing added/extended:
  - fixed price remains available
  - second-based billing added for video models
  - pre-charge should happen at submit time to prevent insufficient balance after generation
- Seed/Veo video proxy logic adjusted for upstream task APIs.

## Model Health Strategy

Current direction: use real customer request data from New API logs/tasks rather than Uptime Kuma synthetic checks.

Reasoning:

- Synthetic checks for every model can be costly.
- Customer traffic reflects actual availability.
- If nobody calls a model, show green/normal.
- Failed recent calls or abnormal latency can lower displayed status.

When modifying this:

1. Define the time window.
2. Define success/failure status codes.
3. Define latency thresholds by model family.
4. Query from indexed request/task tables or cache aggregate results.
5. Return compact status data to the dashboard and AI-MODEL page.

## Database Safety

Do not drop or recreate MySQL volumes during panel/source updates. The user's configuration and customer data live in the database.

Before any risky backend deployment:

```bash
docker ps
docker exec newapi_xtak-mysql-1 sh -c 'mysqldump ...' > backup.sql
gzip backup.sql
```

Also preserve:

- compose file
- current image tag
- mounted data directory
- logs

