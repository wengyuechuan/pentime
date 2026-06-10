# PenTime 迁移与使用说明

本文档用于把当前开发目录迁移到另一台 Windows 电脑后继续测试和开发。

## 1. 包内容

本压缩包是源码迁移包，基于 Cherry Studio 官方最新版分支重做的 PenTime 开发版本。

- 项目目录：`pentime-on-upstream-latest`
- 当前版本：`PenTime@1.9.9`
- 当前分支：`pentime-on-v1.9.9`
- 上游基线：Cherry Studio 官方最新版 `v1.9.9`
- 包内不包含：`node_modules`、`.git`、`out`、临时日志、临时截图、构建缓存

如果你需要迁移后继续使用 Git 提交、拉取和推送，请使用 `PenTime-git-v1.9.9-*.zip` Git 开发包，并阅读 `README_GIT_MIGRATION.md`。普通源码测试包不带 `.git`，只适合安装依赖后运行和测试。

压缩包内的关键新增文档：

- `README_PENTIME_MIGRATION.md`：迁移、安装、启动、排错说明
- `README_GIT_MIGRATION.md`：Git 开发包、远程仓库和推送说明
- `PENTIME_TECHNICAL_DOCUMENTATION.md`：项目技术文档和本次 PenTime 功能改动说明
- `scripts/pentime-windows-setup.cmd`：Windows 快速安装依赖与检查脚本

## 2. 目标电脑环境要求

推荐环境：

- Windows 10/11 x64
- Node.js `>= 24.11.1`
- pnpm `10.27.0`
- Git，可选但建议安装
- Python 3.10+，用于原生依赖编译，推荐通过 `uv` 安装
- Visual Studio Build Tools 2022，勾选 `Desktop development with C++`

注意：当前测试机安装的是 Visual Studio Community 2026，应用可以运行，但 `node-gyp` 对 VS 2026 的识别仍可能有兼容问题。另一台电脑若需要重新编译原生模块，更推荐安装 VS Build Tools 2022。

## 3. 解压位置建议

建议解压到路径较短、没有特殊权限限制的位置，例如：

```cmd
C:\Projects\pentime-on-upstream-latest
```

不建议直接放到系统目录、OneDrive 同步目录或特别深的中文路径下。

## 4. 安装依赖

进入解压后的项目根目录：

```cmd
cd /d C:\Projects\pentime-on-upstream-latest
```

如果已经有 Node.js 24，可以先启用 pnpm：

```cmd
corepack prepare pnpm@10.27.0 --activate
```

如果 PowerShell 提示 `pnpm.ps1 cannot be loaded`，请在 `cmd.exe` 里运行，或显式使用：

```cmd
pnpm.cmd --version
```

安装依赖：

```cmd
pnpm.cmd install
```

不要使用 `--ignore-scripts`。如果跳过 install scripts，Electron 和 Windows 原生模块可能无法启动。

## 5. 快速启动

安装完成后运行：

```cmd
pnpm.cmd dev
```

正常启动后会打开 Electron 桌面窗口。不要只用普通浏览器打开 `http://localhost:5173/` 来判断是否成功，因为普通浏览器没有 Electron preload 注入的 `window.api`，会出现白屏或 `ipcRenderer` 相关报错。

首次启动可能会出现 Windows 防火墙弹窗。允许或取消都不会影响本机 Electron preload 的基本渲染；如果需要局域网访问 API，再按实际网络策略选择。

## 6. 一键准备脚本

也可以直接运行包内脚本：

```cmd
scripts\pentime-windows-setup.cmd
```

脚本会尝试：

- 检查 Node.js
- 启用 pnpm `10.27.0`
- 通过 `uv` 自动寻找 Python
- 安装依赖
- 重建 Electron 与常见 Windows 原生模块
- 执行 `pnpm typecheck`

脚本成功后，再运行：

```cmd
pnpm.cmd dev
```

## 7. 常用验证命令

迁移后建议至少跑下面三条：

```cmd
pnpm.cmd typecheck
pnpm.cmd i18n:check
pnpm.cmd test:lint
```

本机打包前验证结果：

- `pnpm typecheck`：通过
- `pnpm i18n:check`：通过
- `pnpm test:lint`：通过，仅保留一个上游既有 warning
- 定向 Vitest：4 个测试文件、487 个测试通过

定向测试命令：

```cmd
pnpm.cmd exec vitest run src/renderer/src/aiCore/services/__tests__/listModels.test.ts src/renderer/src/services/__tests__/ErrorDiagnosisService.test.ts src/renderer/src/config/models/__tests__/reasoning.test.ts src/renderer/src/aiCore/provider/__tests__/providerConfig.test.ts
```

## 8. 迁移后如何查看 PenTime 功能

启动桌面应用后：

1. 点击顶部 `+` 打开启动台。
2. 启动台顺序应为：笔记、绘画、翻译、视频、知识库、助手库、文件、Code、OpenClaw。
3. 点击“视频”进入视频生成页面。
4. 在“设置 -> 提供商/模型”中配置 NewAPI 提供商和视频模型。
5. 视频模型建议设置端点类型为 `video-generation`，或模型名包含 `veo` / `video` / `gemini` 等关键词。

视频页当前支持：

- NewAPI 提供商选择
- Veo/Gemini 视频模型候选
- 比例：`16:9`、`9:16`、`1:1`
- 分辨率：`720p`、`1080p`
- 时长秒数
- 生成音频开关
- 优化提示词开关
- 首图/尾图上传
- 生成历史
- 返回视频 URL 后播放和下载

## 9. 常见问题

### 9.1 普通浏览器打开 localhost 白屏

这是预期现象。该项目是 Electron 桌面应用，普通浏览器没有 `window.api`、`ipcRenderer` 等 preload 能力。

正确方式：

```cmd
pnpm.cmd dev
```

然后看自动打开的 Electron 桌面窗口。

### 9.2 报 `Electron uninstall`

通常是安装依赖时跳过了 Electron 的 postinstall。

处理：

```cmd
pnpm.cmd rebuild electron
```

如果仍失败，删除 `node_modules` 后重新执行：

```cmd
pnpm.cmd install
```

### 9.3 报 `PaymoWinShutdownHandler.node` 或 `registry.node` 找不到

这是 Windows 原生模块缺失，通常由 install scripts 被跳过或 node-gyp 编译失败导致。

先尝试：

```cmd
pnpm.cmd rebuild @paymoapp/electron-shutdown-handler
pnpm.cmd rebuild registry-js
```

如果 node-gyp 找不到 Python，可以用 `uv`：

```cmd
uv python install 3.12
for /f "delims=" %i in ('uv python find 3.12') do set PYTHON=%i
set npm_config_python=%PYTHON%
pnpm.cmd rebuild @paymoapp/electron-shutdown-handler
pnpm.cmd rebuild registry-js
```

如果 node-gyp 找不到 Visual Studio，建议安装 Visual Studio Build Tools 2022，并勾选 `Desktop development with C++`。

### 9.4 端口被占用

如果已有旧应用占用 `5173`，Vite 会尝试换端口。也可以关闭旧的 Electron/Node 进程后重试。

### 9.5 视频生成失败

当前视频 API 是按 NewAPI 常见协议做的 best-effort 兼容：

- `POST /v1/video/generations`
- `POST /v1/videos`
- 后续轮询 `GET endpoint/{taskId}`

不同 NewAPI 部署的视频协议可能有差异。需要真实 API key、真实视频模型和实际返回格式进一步联调。

## 10. 本次特意未修改的内容

- 文档中用户后来说明“不需要修改”的 `4.1` 项未改。
- 打包/自动更新服务器相关内容未做生产化改造。
- 未把 `node_modules` 放入 zip，避免体积过大和目标电脑平台不兼容。
