# Vercel Deployment Foundation

## Architecture

```text
source-controlled upstream.lock.json
        ↓
pinned sparse checkouts in .upstream/
        ↓
data ensure → Nanoka enemy ensure → StarRailRes asset ensure
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
- `scripts/assets/enemies/ensure.ts`：验证或增量生成 Nanoka enemy cache；代理环境使用现有 curl transport。

## Local Development

普通 `pnpm dev`、`pnpm build`、`pnpm data:sync` 和 `pnpm assets:sync` 的 sibling 默认路径保持不变：`../TurnBasedGameData` 与 `../StarRailRes`。本地开发不需要联网准备 `.upstream/`。

## Deployment Build

正式 deployment build command：

```text
pnpm deploy:build
```

该命令验证 lock，准备或复用 `.upstream/`，设置 `HSR_DATA_ROOT`/`HSR_ASSET_ROOT`，依次运行 data ensure、Nanoka enemy ensure、StarRailRes asset ensure，最后执行 `vite build` 输出 `build/`。它不会调用 `pnpm build`，因此不会递归触发自身；原有 `build`/`prebuild` 保持不变。

Enemy manifest 使用 schema 2，以 `monsters + unavailable` 精确覆盖当前 enemy catalog。明确的单资源 404 或缺少 `image_path` 保持 UI fallback；网络、解析、内容类型、图片签名或系统性覆盖失败会终止 deployment build。schema 1 仍可由 UI 读取，但 enemy ensure 会刷新为 schema 2。

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

Phase 03 enemy regression clean build（保留 `.upstream/`，删除 enemy cache）：

- Nanoka version：4.5.52
- enemy ensure：101.343s
- deployment overall：129.604s；外部计时 130.305s
- 628 个模板：605 条可用映射、23 条合法 `missing-image-path`
- 210 张 WebP：16,088,650 bytes
- `static/generated-enemy-assets/` 与 `build/generated-enemy-assets/` 数量和字节完全一致

Warm enemy ensure 仅验证 Nanoka version 与本地 cache，完整 warm deployment 中实测 1.122s；210 张图片全部复用，没有重新下载。该次 deployment script overall 为 34.262s，外部计时为 34.939s。

## Build Independence

`build/` 中没有 `.upstream/`、upstream `.git` 或原始 checkout 路径。构建产物保留了必要的 upstream 来源署名和 StarRailRes AGPL-3.0 许可证文件，但不包含原始 repository 内容。

将 `.upstream/` 临时重命名后，以未设置 `HSR_DATA_ROOT`/`HSR_ASSET_ROOT` 的环境启动静态 preview，首页请求返回 HTTP 200；随后已恢复 `.upstream/`。因此运行时不需要 upstream checkout、Git 或 GitHub。

## Search V2 Upstream Metadata Automation

当前 `.github/workflows/update-upstreams.yml` 在 lock 确有变化时执行：

```text
upstreams:update → data:search-names:update → data:player-aliases:sync → deploy:build
→ commit → automation/update-upstreams → PR to develop → 人工审核
```

官方名称刷新命令内部准备并验证 pinned checkout；随后的 skeleton sync 只读取该 tracked 快照，为新 AvatarID 插入空 `playerAliases: []`，保留已有人工内容、数组顺序及原始 JSON 字节。无新 ID 时不写入。stale/非法 ID 或 aliases 在写入前报错，由维护者处理，不自动删除或迁移。

自动 commit 的显式文件集合为 `upstream.lock.json`、`data/search/character-official-names.generated.json`、`data/search/character-player-aliases.json`，只产生实际变化的 diff。权限维持 `contents: write` 和 `pull-requests: write`；只更新 automation 分支并创建/更新至 develop 的 PR，不直接推 main/develop，不自动审核或合并。

普通 `deploy:build` 仍是校验与可重现构建，不运行 skeleton sync、不修改 tracked 输入。维护者只编辑 alias 时，运行 `pnpm data:ensure`、`pnpm test`、`pnpm data:validate`；metadata digest 会触发搜索产物增量重建。手工更新 upstream 时先刷新官方名称、显式同步 skeleton、审阅 diff，再运行 `pnpm deploy:build`。详情见 [Search V2 维护文档](search-v2.md)。

## Remaining Work（初次部署基础阶段的历史范围）

以下内容不属于本阶段：

- Vercel Project configuration
- GitHub integration
- upstream watcher / automatic PR
- Preview deployment validation
- 外部对象存储、CDN 或逐文件 HTTP downloader 优化
