# Troubleshooting

## GitHub Push Fails With `127.0.0.1:30912`

Cause: global Git proxy points to a local proxy that is not running.

Fix for one command:

```powershell
git -c http.proxy= -c https.proxy= push origin main
```

Do not remove the user's global proxy unless asked.

## `pnpm build:win:x64` Tries To Download RTK From GitHub

Current packaging scripts should skip download when local `rtk` exists.

Check:

```powershell
Get-ChildItem resources\binaries\win32-x64
Get-Content resources\binaries\win32-x64\.rtk-version
```

Expected local version around `0.30.1`.

## Build Succeeds But Installed App Crashes On Missing Dependency

Likely cause: a package used at runtime was excluded from asar or not materialized into packaged `node_modules`.

Check:

- `scripts/before-pack.js`
- `scripts/after-pack.js`
- `electron-builder.yml`
- packaged `dist/win-unpacked/resources/app.asar.unpacked`

Add isolated runtime audit before packaging when adding new runtime dependency chains.

## Auto Update Does Not Detect New Version

Check all four places:

```text
package.json version
electron-builder.yml publish.url
app-upgrade-config.json versions/latest/feedUrls
remote latest.yml version
```

Then verify:

```powershell
curl.exe -s https://pentime-new.com/app-upgrade-config.json
curl.exe -s https://pentime-new.com/pen-time/releases/v<version>/latest.yml
```

If local installed version is the same as remote `latest.yml`, no update prompt is expected.

## Website Download Gets Old Version

Check Nginx stable redirect:

```bash
grep -n 'return 302 /pen-time/releases' /etc/nginx/conf.d/pentime-updates.conf
nginx -t
systemctl reload nginx
```

Then:

```powershell
curl.exe -I -L https://pentime-new.com/download/windows
```

## New API Data Could Be Lost

Do not recreate MySQL volumes or run destructive Docker compose operations without a dump.

Before backend deployment:

```bash
docker ps
docker inspect newapi_xtak-new-api-1 > backup-inspect.json
mysqldump ... > mysql-new-api.sql
```

## Uptime Kuma Is Restarting

Observed on `pentime-api`: `uptime-kuma` container was restarting. Current Pen-Time model status strategy should use New API request/task data instead of relying on Uptime Kuma.

## Image Quality Shows English Values

Quality display comes from:

- `src/renderer/src/pages/paintings/config/NewApiConfig.ts`
- `src/renderer/src/i18n/label.ts`
- `src/renderer/src/i18n/locales/*.json`

If a new value is added to `quality`, add it to `paintingsQualityOptionsKeyMap` and locale files.

## Seed Models Missing Or Hide Other Models

Check model list path:

- `src/renderer/src/aiCore/services/listModels.ts`
- `src/renderer/src/config/models/video.ts`
- `src/renderer/src/config/models/logo.ts`

Rules:

- Preserve upstream model list.
- Append fallback video models only for Pen-Time New API hosts.
- Sort predictably after merge.
- Do not replace all models with fallback list.

