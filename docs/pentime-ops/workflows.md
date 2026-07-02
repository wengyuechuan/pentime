# Reusable Workflows

Use these when making future Pen-Time changes.

## Standard Client Change Workflow

1. Read relevant local files first.
2. Make narrow edits with `apply_patch`.
3. Run focused checks:

```powershell
pnpm typecheck:web
pnpm exec vitest run --project renderer <test-file>
```

4. Start local dev client for user validation:

```powershell
pnpm dev
```

5. If accepted, build/upload/release.

## Image Model Change Workflow

For painting model support:

1. Update model allow/config:
   - `src/renderer/src/pages/paintings/config/NewApiConfig.ts`
2. Update page behavior:
   - `src/renderer/src/pages/paintings/NewApiPage.tsx`
3. Update model capability helpers if needed:
   - `src/renderer/src/config/models/vision.ts`
4. Update default/system model list if needed:
   - `src/renderer/src/config/models/default.ts`
5. Add/adjust i18n labels:
   - `src/renderer/src/i18n/label.ts`
   - `src/renderer/src/i18n/locales/*.json`
   - `src/renderer/src/i18n/translate/*.json`
6. Add a focused test under `src/renderer/src/config/models/__tests__/`.

Common rule: if a model can only generate one image, set `max_images: 1` and hide the number input when `max_images <= 1`.

## Video Model Change Workflow

For video model support:

1. Update detection/fallback:
   - `src/renderer/src/config/models/video.ts`
2. Update UI and payload:
   - `src/renderer/src/pages/videos/VideoPage.tsx`
3. Preserve local history:
   - `VIDEO_HISTORY_STORAGE_KEY`
   - `toPersistedVideo`
   - `normalizePersistedVideo`
4. Prefer real task status/progress from upstream.
5. Use Chinese user-facing status labels.
6. Add tests:
   - `src/renderer/src/config/models/__tests__/video.test.ts`

Seed video rules:

- Text-only Seed models can use text-to-video.
- Vision/Seedance variants can expose image/reference modes.
- Duration is Seed-specific; do not show it for all models.
- Ratio/resolution should be mapped from explicit UI values.

## New API Backend Change Workflow

1. Backup database and compose/image metadata.
2. Build new Docker image with timestamp tag.
3. Load/tag image on server.
4. Update compose image only.
5. Restart New API app container.
6. Verify:
   - login
   - register
   - forgot password
   - dashboard
   - model list
   - pricing
   - chat request
   - image/video request
7. Keep rollback image and SQL backup.

## Website Change Workflow

Server: `pentime-new` (`8.218.67.248`)

1. Backup current HTML/assets:

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
cp -a /usr/share/nginx/html/pentime-updates/index.html /usr/share/nginx/html/pentime-updates/index.html.bak-$STAMP
cp -a /usr/share/nginx/html/pentime-updates/assets /usr/share/nginx/html/pentime-updates/assets.bak-$STAMP
```

2. Upload HTML/assets.
3. Do not break stable download endpoints.
4. Verify:

```powershell
curl.exe -I https://pentime-new.com/
curl.exe -I -L https://pentime-new.com/download/windows
```

## GitHub Workflow

If GitHub access fails due to local dead proxy:

```powershell
git -c http.proxy= -c https.proxy= fetch origin main
git -c http.proxy= -c https.proxy= push origin main
```

Commit style:

```powershell
git add <files>
git commit --signoff -m "feat: release Pen-Time <version> client"
```

Do not commit:

- `.codex-run/`
- `dist/*.exe`
- server passwords
- API keys
- database dumps

