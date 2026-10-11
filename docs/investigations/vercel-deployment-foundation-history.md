# 部署基础实施与测量历史

> 历史资料：以下保留原部署基础阶段的测量和 Maintenance-06 验收。Node 22、联网 enemy ensure、旧 cache/schema 与当时待办不描述现行流程。现行步骤见[部署与 CI 指南](../vercel-deployment-foundation.md)；离线 snapshot 的后续迁移见[Phase 1 报告](build-pipeline-phase1-enemy-assets-2026-09-20.md)。原文来自 `docs/vercel-deployment-foundation.md`。

## Phase 3 准备规模与资源队列快照

TurnBased preparation 从共享 source registry materialize 81 个实际消费的 Excel 表、两个 TextMap 和三个动态 Config 目录；当前工作树由 4,676 files / 472,882,878 bytes 降为 2,572 files / 267,724,085 bytes。StarRailRes index 与资源目录在初始 checkout 中一次指定，不再执行无消费者的第二次 sparse-set。

General asset cache miss 使用 copy=1、Sharp=2 的独立有界队列，并按 copy 后 Sharp 的顺序执行；该选择来自 Phase 3 的 1/2/4/8 与 1/2/4 benchmark。生成仍经过 staging validation 和 atomic publication。发布后的 filesystem observation 只在当前 build invocation 内共享，使 ensure、输出 telemetry 和 verifier 不再重复 readdir/stat 或对同一物理 icon 重复读取 metadata；verifier仍从 requirements/manifest 独立推导预期 contract。

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

## Maintenance-06 根因与脚本门禁背景

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
