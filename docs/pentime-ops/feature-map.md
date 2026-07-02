# Feature And Change Map

This is a high-level map of Pen-Time changes already implemented in the client and New API customizations.

## Client Branding And Release

- Product name changed to `Pen-Time`.
- App ID set to `com.pentime.app`.
- Auto-update points to `https://pentime-new.com`.
- Website stable Windows download endpoint is `/download/windows`.
- Current release version is `1.10.0`.

## Provider/Model Settings

Model service page was simplified to keep only:

- New API
- Ollama
- NVIDIA
- Alibaba Bailian
- Volcengine

Default Pen-Time/New API endpoint target:

- `https://www.pentime-api.com`

## Image Generation

New API painting page:

- Supports `gpt-image-2` and `gpt-image-2-t`.
- `gpt-image-2-t` uses the same options as `gpt-image-2`.
- `gpt-image-2` series max images is fixed at 1; the number-of-images option is hidden when `max_images <= 1`.
- Image sizes include high resolution options such as `1152x2048`.
- Quality option display is localized:
  - `auto` -> automatic
  - `medium` -> medium
  - `standard` -> standard
  - `high` -> high
  - `hd` -> HD
- GPT-image/Gemini-image download/copy behavior was previously adjusted for chat image results.

Key files:

- `src/renderer/src/pages/paintings/NewApiPage.tsx`
- `src/renderer/src/pages/paintings/config/NewApiConfig.ts`
- `src/renderer/src/config/models/vision.ts`
- `src/renderer/src/i18n/label.ts`

## Video Generation

Video page behavior:

- Uses `/v1/videos` for task creation where applicable.
- Uses `/v1/video/generations/{task_id}` for polling where applicable.
- Uses configured New API base URL.
- Real progress/status should be used instead of simulated progress.
- Chinese status labels:
  - `[Pentime] 未开始 请稍候`
  - `[Pentime] 已提交 请稍候`
  - `[Pentime] 排队中 请稍候`
  - `[Pentime] 处理中 请稍候`
  - `[Pentime] 成功`
  - `[Pentime] 失败`
  - `[Pentime] 未知`
- Video history persists locally under `pentime.video.history`.
- Submit button is disabled/gray when prompt is empty.
- Sidebar width aligned closer to image history sidebar.
- Size options are explicit resolution values:
  - `1280x720`
  - `720x1280`
  - `1920x1080`
  - `1080x1920`
- Seed video fallback models are added for Pen-Time New API hosts.
- Seed models support more modes:
  - text to video
  - first frame
  - first-last frame
  - reference images
  - multimodal reference
- Seed duration options are exposed for Seed models.

Key files:

- `src/renderer/src/pages/videos/VideoPage.tsx`
- `src/renderer/src/config/models/video.ts`
- `src/renderer/src/config/models/logo.ts`

## Model Catalog

Pen-Time New API model catalog behavior:

- If `/v1/models` is forbidden/unavailable, fallback to Pen-Time `/api/pricing` catalog.
- Seed video fallback models are supplied for Pen-Time hosts.
- Models should be sorted predictably.
- Seed series icon uses `doubao_mono.svg` with a white background.

Key files:

- `src/renderer/src/aiCore/services/listModels.ts`
- `src/renderer/src/aiCore/services/schemas.ts`
- `src/renderer/src/config/models/video.ts`
- `src/renderer/src/assets/images/models/doubao_mono.svg`

## Chat/Home Behavior

Past fixes:

- Avoid topic naming extra calls when not wanted.
- Topic context menu order changed to fixed topic, edit topic, generate topic.
- Guard against missing/default model causing workspace entry crash.
- Tavily/GPT repeated-call behavior was investigated as topic naming/tool behavior.

## Runtime Packaging Fixes

Windows packaging had missing runtime dependency issues. Current build includes packaging materialization checks for dependencies used by:

- `officeparser`
- Express/body-parser/raw-body
- proxy/runtime parsing
- Claude Agent ripgrep/runtime chain
- `rtk` binary local skip behavior

Key files:

- `scripts/before-pack.js`
- `scripts/after-pack.js`
- `electron-builder.yml`
- `pnpm-workspace.yaml`
- `package.json`

