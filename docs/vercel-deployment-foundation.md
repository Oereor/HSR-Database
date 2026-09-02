# Vercel Deployment Foundation

## Architecture

```text
source-controlled upstream.lock.json
        ↓
pinned sparse checkouts in .upstream/
        ↓
existing data/assets ensure pipeline
        ↓
static SvelteKit build/
```

`deploy:build` 在 build time 准备两个固定 SHA 的 shallow Git checkout。构建完成后，`build/` 只包含静态站点和生成数据/资源。

## Files

- `upstream.lock.json`：两个公开 upstream 的 schema 1、repository URL 和完整 commit SHA。
- `.upstream/`：本地 deployment-only checkout，已加入 `.gitignore`，不会进入 source 或 output。
- `scripts/deployment/lock.ts`：lock 读取与验证。
- `scripts/deployment/git.ts`：跨平台 Git 执行、SHA/remote/path 验证、临时目录替换和复用。
- `scripts/deployment/prepare.ts`：TurnBasedGameData 保守 sparse checkout 与 StarRailRes 两阶段 sparse checkout。
- `scripts/deployment/build.ts`：deployment 编排入口。

## Local Development

普通 `pnpm dev`、`pnpm build`、`pnpm data:sync` 和 `pnpm assets:sync` 的 sibling 默认路径保持不变：`../TurnBasedGameData` 与 `../StarRailRes`。本地开发不需要联网准备 `.upstream/`。

## Deployment Build

正式 deployment build command：

```text
pnpm deploy:build
```

该命令验证 lock，准备或复用 `.upstream/`，设置 `HSR_DATA_ROOT`/`HSR_ASSET_ROOT`，运行现有 ensure 脚本，最后执行 `vite build` 输出 `build/`。它不会调用 `pnpm build`，因此不会递归触发自身；原有 `build`/`prebuild` 保持不变。

## Updating Upstreams

1. 获取新的 upstream 完整 commit SHA。
2. 修改 `upstream.lock.json`。
3. 运行 `pnpm deploy:build`。
4. 运行现有 `data:validate`、`assets:verify` 和相关测试。
5. 检查生成结果后提交 lock 变更。

禁止将 branch、tag、`HEAD` 或 `latest` 写入 lock。

## Cold / Warm Build Measurements

实测环境为 Windows、Node.js 22、pnpm 11，并通过 `http://127.0.0.1:7890` 代理访问 GitHub。

Clean cold build（删除 `.upstream/` 与生成/缓存输出后）：

- TurnBasedGameData preparation：36.860s
- data generation：7.705s
- StarRailRes preparation：138.184s
- asset generation：43.323s
- SvelteKit build：27.528s
- deployment script overall：253.604s
- 外部计时总耗时：254.436s

Warm build（保留 `.upstream/` 与 ensure cache）：

- TurnBasedGameData reuse：0.091s
- data ensure：0.783s
- StarRailRes reuse：0.411s
- asset ensure：0.723s
- SvelteKit build：25.986s
- deployment script overall：27.995s
- 外部计时总耗时：28.794s

产物与 checkout 测量：

- `build/`：424,899,833 bytes，3,420 files
- TurnBasedGameData sparse worktree：414,827,197 bytes，4,675 files；Git metadata：66,337,620 bytes
- StarRailRes sparse worktree：755,259,994 bytes，826 files；Git metadata：755,063,418 bytes

Warm build 日志确认两个 checkout 均被复用，没有重新完整 clone；data/assets ensure 也复用了现有 cache 语义。

## Build Independence

`build/` 中没有 `.upstream/`、upstream `.git` 或原始 checkout 路径。构建产物保留了必要的 upstream 来源署名和 StarRailRes AGPL-3.0 许可证文件，但不包含原始 repository 内容。

将 `.upstream/` 临时重命名后，以未设置 `HSR_DATA_ROOT`/`HSR_ASSET_ROOT` 的环境启动静态 preview，首页请求返回 HTTP 200；随后已恢复 `.upstream/`。因此运行时不需要 upstream checkout、Git 或 GitHub。

## Remaining Work

以下内容不属于本阶段：

- Vercel Project configuration
- GitHub integration
- upstream watcher / automatic PR
- Preview deployment validation
- 外部对象存储、CDN 或逐文件 HTTP downloader 优化
