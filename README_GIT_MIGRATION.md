# PenTime Git 开发包说明

如果你拿到的是 `PenTime-git-v1.9.9-*.zip`，它和普通源码测试包不同：

- 包内包含完整 `.git` 目录。
- 解压后可以直接运行 `git status`。
- 当前 PenTime 改动已经提交为本地 commit。
- 当前分支为 `pentime-on-v1.9.9`。
- 默认远程 `origin` 指向 Cherry Studio 官方上游：`https://gitcode.com/CherryHQ/cherry-studio.git`。

## 1. 解压后检查

```cmd
cd /d C:\Projects\PenTime-git-v1.9.9
git status
git branch --show-current
git remote -v
```

预期：

- `git status` 显示干净工作区。
- 当前分支是 `pentime-on-v1.9.9`。
- `origin` 指向官方上游。

## 2. 推送到你自己的远程仓库

官方上游通常没有你的写权限。如果你要把这个项目迁移成自己的开发仓库，推荐先在 GitCode/GitHub/Gitee 创建一个空仓库，然后执行：

```cmd
git remote rename origin upstream
git remote add origin <你的新仓库地址>
git push -u origin pentime-on-v1.9.9
```

这样：

- `upstream` 保留官方 Cherry Studio 上游，用来拉新版本。
- `origin` 是你自己的仓库，用来推送 PenTime 分支。

后续拉取官方更新：

```cmd
git fetch upstream
```

再根据需要把官方新版 tag 或分支合并到你的 PenTime 分支。

## 3. 如果只想保留官方 origin

如果你只是想继续跟踪官方仓库，不急着推送，可以保持默认 remote 不变：

```cmd
git fetch origin
```

但直接 `git push origin pentime-on-v1.9.9` 需要你对官方仓库有写权限。

## 4. 迁移后安装和启动

Git 包仍然不包含 `node_modules`。解压后请按 `README_PENTIME_MIGRATION.md` 安装依赖：

```cmd
scripts\pentime-windows-setup.cmd
pnpm.cmd dev
```

## 5. 为什么普通源码包不带 `.git`

之前的 clean 源码包是为了运行测试，特意不带 `.git`、`node_modules` 和缓存，体积小且不依赖原机器路径。

当前开发目录本身是 Git worktree，它的 `.git` 文件只是类似下面的指针：

```text
gitdir: C:/Users/wengy/code/cherry-studio-upstream/.git/worktrees/pentime-on-upstream-latest
```

这个指针迁移到另一台电脑会失效，所以不能直接把 worktree 的 `.git` 文件打进 zip。Git 开发包会重新制作成独立仓库，避免这个问题。

