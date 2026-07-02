# Pen-Time Ops Handbook

Last updated: 2026-07-03

This handbook is the recovery point for Pen-Time client release, website deployment, auto update, and New API operations. Read it first when context has been compacted or when you need to continue a previous Pen-Time deployment task.

## Start Here

- [servers.md](./servers.md): server inventory, domains, roles, important paths, and what not to commit.
- [client-release.md](./client-release.md): Windows client build, version bump, upload, auto-update, and website download flow.
- [new-api-ops.md](./new-api-ops.md): Pen-Time New API server shape, backup/deploy flow, and database safety notes.
- [feature-map.md](./feature-map.md): main Pen-Time client and New API changes already implemented.
- [workflows.md](./workflows.md): reusable modification and verification workflows.
- [troubleshooting.md](./troubleshooting.md): known failure modes and quick checks.

## Current Snapshot

- Client repository: `https://github.com/wengyuechuan/pentime`
- Current client version: `1.10.0`
- Current Windows release URL: `https://pentime-new.com/pen-time/releases/v1.10.0/Pen-Time-1.10.0-x64-setup.exe`
- Stable Windows download URL: `https://pentime-new.com/download/windows`
- Auto-update config URL: `https://pentime-new.com/app-upgrade-config.json`
- Auto-update feed URL: `https://pentime-new.com/pen-time/releases/v1.10.0`

## Security Rules

Do not write SSH passwords, API keys, database passwords, or session secrets into repository files. This repo is pushed to GitHub. Store credentials only in the user's password manager or deployment notes outside the repo.

When documenting a server, record only:

- IP, domain, service role
- non-secret paths
- command patterns with placeholders
- backup and rollback steps

## Local Working Rules

- Before risky edits or deployment, create a local backup under `C:\Users\wengy\code\PenTime-backups`.
- Keep `.codex-run/` out of Git. It contains temporary extraction/build/debug files.
- Prefer committing source and operational docs, not generated release binaries.
- Use temporary Git proxy disable flags when GitHub access fails because of a dead local proxy:

```powershell
git -c http.proxy= -c https.proxy= fetch origin main
git -c http.proxy= -c https.proxy= push origin main
```

