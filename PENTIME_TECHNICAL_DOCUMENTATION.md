# PenTime 技术文档

## 1. 项目概览

PenTime 当前是基于 Cherry Studio 官方最新版 `v1.9.9` 的桌面应用分支。项目主体是 Electron + React + TypeScript，用于桌面端 AI 助手、模型管理、绘图、翻译、知识库、文件、Code 工具、OpenClaw 和新增视频生成入口。

当前开发目录：

```text
C:\Users\wengy\code\pentime-on-upstream-latest
```

当前分支：

```text
pentime-on-v1.9.9
```

版本：

```text
PenTime@1.9.9
```

## 2. 顶层技术栈

- Electron：桌面主进程、preload、窗口和系统能力
- React 19：渲染进程 UI
- TypeScript：主进程、渲染进程和共享包
- Redux Toolkit + redux-persist：前端状态和持久化
- Ant Design + styled-components：主要 UI 组件和样式
- Vite/electron-vite：开发与构建
- Vitest：单元测试
- pnpm workspace：包管理
- packages/aiCore：新版 AI SDK provider 抽象
- packages/ai-sdk-provider：CherryIN / AI SDK provider bundle

## 3. 目录结构

核心目录：

```text
src/
  main/                 Electron 主进程服务
  preload/              preload IPC bridge
  renderer/src/         React 前端
packages/
  aiCore/               AI SDK middleware/provider 抽象
  ai-sdk-provider/      CherryIN provider bundle
  shared/               跨进程共享类型、常量和工具
resources/              静态资源、数据库迁移、内置数据等
scripts/                构建、i18n、OpenAPI、测试辅助脚本
```

## 4. Electron 运行方式

开发启动命令：

```cmd
pnpm.cmd dev
```

启动流程：

1. 生成 OpenAPI spec。
2. electron-vite 编译 main。
3. electron-vite 编译 preload。
4. 启动 renderer dev server。
5. 启动 Electron 主进程并打开窗口。

重要说明：renderer 页面依赖 preload 暴露的 `window.api`。普通浏览器直接打开 `localhost` 会缺失 Electron IPC 能力，所以不能用普通浏览器白屏来判断桌面应用失败。

## 5. 本次 PenTime 功能改动概览

### 5.1 导航和入口

相关文件：

- `src/renderer/src/config/sidebar.ts`
- `src/renderer/src/components/app/Sidebar.tsx`
- `src/renderer/src/pages/launchpad/LaunchpadPage.tsx`
- `src/renderer/src/components/Tab/TabContainer.tsx`
- `src/renderer/src/Router.tsx`
- `src/renderer/src/i18n/label.ts`

实现内容：

- 新增 `video` 侧栏图标类型。
- 将“小程序”主入口替换为“视频”。
- 启动台顺序改为：笔记、绘画、翻译、视频、知识库、助手库、文件、Code、OpenClaw。
- 保留上游 `agents` 能力，但不插入文档指定主顺序中。
- 新增 `/videos` 与 `/videos/:providerId` 路由。

### 5.2 视频生成页面

新增文件：

- `src/renderer/src/pages/videos/VideoPage.tsx`

页面能力：

- NewAPI provider 选择。
- 模型选择与候选过滤。
- 默认 Veo 候选模型兜底。
- 比例、分辨率、秒数配置。
- 首图/尾图上传，上传后转 data URL。
- 提示词输入。
- 翻译按钮和双空格触发翻译。
- 生成音频、优化提示词开关。
- 任务创建、轮询、进度展示。
- 视频播放、历史记录、下载、删除。

视频 API 当前按常见 NewAPI 形态兼容：

```text
POST /v1/video/generations
POST /v1/videos
GET  endpoint/{taskId}
```

请求 payload 主要字段：

```json
{
  "model": "veo-3.1-generate-preview",
  "prompt": "...",
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "duration": 8,
  "duration_seconds": 8,
  "generate_audio": true,
  "enhance_prompt": true,
  "image": "...",
  "first_frame": "...",
  "last_frame": "..."
}
```

返回解析兼容字段：

- `id`
- `task_id`
- `data.id`
- `url`
- `video_url`
- `download_url`
- `output`
- `data.url`
- `data.video_url`
- `data[0].url`
- `progress`
- `status`

### 5.3 NewAPI 视频端点类型

相关文件：

- `src/renderer/src/types/index.ts`
- `src/renderer/src/config/endpointTypes.ts`
- `src/renderer/src/aiCore/provider/custom/newapi-provider.ts`
- `packages/ai-sdk-provider/src/cherryin-provider.ts`
- `src/renderer/src/i18n/locales/*.json`
- `src/renderer/src/i18n/translate/*.json`

新增 endpoint type：

```text
video-generation
```

目的：

- 让 NewAPI 模型配置可以标记为视频生成模型。
- 视频页可以优先筛选 `video-generation` 模型。
- provider 层把该类型按 OpenAI compatible 路径处理，避免聊天能力误判类型。

### 5.4 NewAPI 图片模型扩展

相关文件：

- `src/renderer/src/pages/paintings/config/NewApiConfig.ts`
- `src/renderer/src/pages/paintings/NewApiPage.tsx`

新增/扩展能力：

- GPT-image 系列候选。
- Gemini image 系列候选。
- `1K` / `2K` 与比例组合。
- 将 UI 中的组合值拆分为 `size` 与 `aspect_ratio` 发给接口。

新增 helper：

- `getNewApiModelConfig(model?: string)`
- `parseNewApiImageSize(value?: string)`

### 5.5 image2 base64 输入修复

相关文件：

- `src/renderer/src/aiCore/AiProvider.ts`

修复思路：

- 图片编辑输入如果是 data URL，先解析。
- 将 `data:image/...;base64,...` 规范化为纯 base64。
- 避免 AI SDK 编辑接口收到完整 data URL 后报 `Content string is not a base64-encoded media`。

### 5.6 聊天视频 URL 播放和下载

相关文件：

- `src/renderer/src/pages/home/Messages/MessageVideo.tsx`

实现内容：

- 支持 `block.url` 远程视频直接播放。
- 支持 `block.filePath` / `metadata.video.path` 本地视频播放。
- 保留开始时间行为。
- 增加下载按钮。
- 保留缺失/不支持视频时的错误展示。

### 5.7 模型显示去 provider 后缀

相关文件：

- `src/renderer/src/pages/home/components/SelectModelButton.tsx`
- `src/renderer/src/pages/agents/components/SelectAgentBaseModelButton.tsx`
- `src/renderer/src/services/ModelService.ts`
- `src/renderer/src/pages/home/Inputbar/MentionModelsInput.tsx`

实现内容：

- UI 显示只保留模型名。
- 移除类似 `| NewAPI` 的 provider 后缀。

### 5.8 GPT/Sora 图标统一

相关文件：

- `src/renderer/src/config/models/logo.ts`

实现内容：

- GPT 系列、GPT image 系列、Sora 模型统一使用现有 ChatGPT 图标。
- 移除模型专属 GPT 图标映射。

### 5.9 redux-persist 迁移

相关文件：

- `src/renderer/src/store/index.ts`
- `src/renderer/src/store/migrate.ts`

实现内容：

- persist version 更新到 `209`。
- 增加历史 sidebar 配置迁移：
  - 将旧的 `minapp` 主入口替换为 `video`。
  - 按 PenTime 默认顺序重新整理可见图标。
  - 去重。

## 6. i18n

新增/同步语言包：

- `src/renderer/src/i18n/locales/zh-cn.json`
- `src/renderer/src/i18n/locales/en-us.json`
- `src/renderer/src/i18n/locales/zh-tw.json`
- `src/renderer/src/i18n/translate/*.json`

新增 key 主要包括：

- `video.*`
- `endpoint_type.video-generation`
- sidebar/title label 的 `video`

语言包已通过：

```cmd
pnpm.cmd i18n:check
```

## 7. 验证结果

打包前通过：

```cmd
pnpm.cmd typecheck
pnpm.cmd i18n:check
pnpm.cmd test:lint
```

定向测试通过：

```cmd
pnpm.cmd exec vitest run src/renderer/src/aiCore/services/__tests__/listModels.test.ts src/renderer/src/services/__tests__/ErrorDiagnosisService.test.ts src/renderer/src/config/models/__tests__/reasoning.test.ts src/renderer/src/aiCore/provider/__tests__/providerConfig.test.ts
```

结果：

- 4 个测试文件通过。
- 487 个测试通过。
- 应用已实际用 `pnpm dev` 启动。
- Electron 主界面不是白屏。
- 启动台顺序已截图验证。
- 视频页面已截图验证。

## 8. 已知限制

- 视频生成接口是 best-effort 兼容，需要真实 NewAPI 视频服务进一步联调。
- 未实现生产级打包/更新服务器改造。
- 用户后续确认不需要修改的 `4.1` 项未修改。
- 当前 zip 是源码迁移包，不包含 `node_modules` 和构建出的安装包。
- 若目标电脑没有合适的 Python / VS Build Tools，Windows 原生模块 rebuild 可能失败。

## 9. 后续建议

优先级建议：

1. 在目标电脑完成 `pnpm install` 与 `pnpm dev`。
2. 配置 NewAPI provider 和真实视频模型。
3. 用真实 API 验证视频任务创建、轮询、播放和下载。
4. 若 NewAPI 视频协议不同，再按实际响应调整 `VideoPage.tsx` 的 endpoint 和 result parser。
5. 最后再做正式安装包、自动更新和签名流程。

