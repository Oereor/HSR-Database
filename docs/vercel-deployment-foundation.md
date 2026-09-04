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

## Clean deployment 与脚本类型门禁

- 日常开发：`pnpm dev`。`predev` 执行 `data:ensure`，有效的 manifest、Endgame、首页和 naming cache 可使其跳过完整 `syncData()`。
- 静态检查：`pnpm check` 包含 Svelte 检查和 `pnpm check:scripts`。后者使用独立 `tsconfig.scripts.json`，strict / noEmit，覆盖全部脚本及其导入依赖，无需先生成 `.svelte-kit` 或领域数据。
- 普通部署验证：`pnpm deploy:build`。在数据生成前执行脚本 compiler gate，保留增量缓存及既有 pinned upstream 流程。
- Fresh-clone 验证：`pnpm deploy:build:clean`。清理后复用同一个部署编排，成本包含上游下载与完整数据、图片生成；不放入普通 Vitest，也不与开发服务器或其他构建并发运行。

Clean 白名单为 `src/lib/generated/`、`static/generated/`、`src/lib/generated-assets/`、`static/generated-assets/`、`static/generated-enemy-assets/`、`build/`、`.svelte-kit/`、`.vite/`、`.upstream/`。清理前完整检查目标及父目录，拒绝 symlink/junction，保留 tracked `.gitkeep`，若发现其他 tracked 文件则在删除前失败。不接受自定义删除路径，不清理依赖或 sibling repositories。

清理 `.upstream` 是为了实际重新执行 lock 指定的 sparse pinned checkout。官方名称、人工 aliases 和 lock 不在清理范围，命令在构建成功或失败后均比较这三份文件的 SHA-256。普通构建不自动刷新官方快照或同步人工 aliases。

Maintenance-06 根因为 `dce6fff` 移除旧搜索代码时删除通用 `defined` helper，遗漏 Character 技能图标生成中的调用。恢复原 type guard 即可修复运行时错误。旧 SvelteKit include 不直接覆盖 scripts；ESLint 的 TypeScript 推荐配置关闭 `no-undef`，且未配置 typed project，因此不能代替 compiler gate。本轮新门禁同时暴露并修正审计、调试、验证和生成脚本的类型推断问题，不改变 Search V2 或数据生成规则。

回归测试通过 compiler host 在内存中删除真实 `defined` 声明，断言正式 scripts project 报告 `Cannot find name 'defined'`，不会修改源码。清理测试覆盖全部白名单、tracked 保护、链接拒绝、失败不构建和 metadata 保留。完整数据生成和 clean deployment 必须另外实际执行，已有缓存下的 dev/build 成功不能替代这一验收。

### Maintenance-06 验收记录（2026-09-04）

环境为 Windows / Node 22.19.0；未修改 Vercel Node 版本，也未声称已验证 Node 24。恢复 helper 后，直接 `pnpm data:sync` 完整生成 97 个角色、169 个光锥、60 个遗器套装、21 个遗器属性项和 628 个敌人。原先 standalone compiler 探测的 19 条诊断全部解决；检查范围内未发现其他未定义标识符。额外修改仅为脚本类型标注、narrowing 和审计对象访问，不改变搜索或图标选择算法。

`pnpm data:validate`、`pnpm lint`、`pnpm check:scripts`、`pnpm check`（应用 0 errors / 0 warnings）、`pnpm test`（32 files / 384 tests）、`git diff --check` 通过。compiler 负向测试使用真实 scripts 配置和真实 sync 源码，移除 helper 后捕获 `Cannot find name 'defined'`，源码未落盘改动。

普通 `pnpm deploy:build` 成功，约 84.6 秒。第一次 clean 尝试在 Windows 图片目录发布时遇到 `EPERM rename`；当时仍有本项目的 Vite dev watcher 运行，metadata 摘要仍全部一致。停止该服务后重新执行完整 clean，而非从残留缓存继续：数据和资源 upstream 均重新准备，210 张敌人图片全部下载、复用数为零，1,547 个角色详情图标引用缺失数为零。第二次 clean 成功，部署阶段约 382.9 秒；最终资源引用闭包扫描 2,215 个文本文件。保持现有 23 条合法敌人图片缺失及 TextMap 审计诊断，不修改图片发布 pipeline。由此确认执行 clean 命令前需要停止同仓库的开发服务。

浏览器直接使用 clean build 产物执行 `pnpm test:e2e --workers=2 --reporter=line`：桌面与移动合计 229 项通过、3 项原有条件跳过。首次回归暴露两个仍假设“三月七只有两张卡”的过期测试；当前人工 aliases 合法增加第三个角色，故测试改为按生成 metadata 验证完整结果，同时继续断言 cards 展示正式名称而非 alias。未修改搜索实现或人工文件。

三份 tracked metadata 的构建前后 SHA-256 相同：

| 文件                                      | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `upstream.lock.json`                      | `b504e90d8b2b7f604f6ba742a29feb1e6207140384cd206d617584e1b77ad5a8` |
| `character-official-names.generated.json` | `0c87ab39ee417f57b97fb9b288ad105356a5fc6fd6945f8fa8dfd49027bdc4c2` |
| `character-player-aliases.json`           | `ee1ffadbaeb27604079dcbfb88d304d8994ce6e235e0ac8f13fa8577d13787cc` |

人工 metadata 仍为 97 个角色、300 条别名，未重新排序或格式化。两个相邻 upstream 仓库保持干净且 HEAD 不变，分别为 `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091` 与 `d226befe3db13f2ec15f4161d5f34b1b607643fe`。新增文件仅为 scripts tsconfig、clean 脚本和两个回归测试；其余 diff 为必要脚本类型修正、部署编排门禁、package 命令及文档。不包含 generated/cache/build 产物，无 commit、push 或线上部署。

## Remaining Work（初次部署基础阶段的历史范围）

以下内容不属于本阶段：

- Vercel Project configuration
- GitHub integration
- upstream watcher / automatic PR
- Preview deployment validation
- 外部对象存储、CDN 或逐文件 HTTP downloader 优化
