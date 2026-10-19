# 部署与 CI 维护

本指南描述仓库当前构建与发布流程。架构契约见[权威架构](architecture/localization-and-data-generation.md)，环境与普通本地开发见[开发指南](development.md)。
以下远端设置是维护者需要核对的条件；本轮文档整理没有重新查询云端项目、运行 workflow 或部署。
早期测量与 Maintenance-06 记录保留在[部署基础历史](investigations/vercel-deployment-foundation-history.md)。

## 构建输入与运行边界

[upstream.lock.json](../upstream.lock.json)记录两个公开上游的完整 commit SHA。
[scripts/deployment/build.ts](../scripts/deployment/build.ts)在网站内部 `.upstream/` 准备 shallow pinned sparse checkout，不切换或写入相邻仓库。
TurnBased 的输入由共享 source registry 决定，包含需要的 Excel 表、CHS/EN TextMap 及动态 Config 目录；StarRailRes 的 index 与资源目录一次准备。
具体表和文件数量随源码/pin 变化，不采用旧测量中的固定数量。

所有 profile 准备消息、游戏数据、正式 V2 Benchmark 校验、普通资源与离线 enemy snapshot，随后调用 Vite 构建并检查基础输出。
普通资源经过 staging 验证和原子发布；完整 profile 额外独立验证资源、引用与路由闭包。

资料站由 adapter-static 输出到 `build/`，运行时不需要 sibling checkout、Git 或完整 TextMap。
玩家信息另外使用 [api/player.ts](../api/player.ts)提供 Vercel 原生 `/api/player/` Function，运行时请求 Enka.Network，并使用服务端 runtime 数据与评分分布。
`build/` 的静态 preview 与本地 Vite 开发服务不等于远端 Function；可选私有本地验收见[Enka mock 步骤](investigations/player-local-enka-mock.md#入口与安全)。

## 构建 profile

以下命令在本地生成、校验产物，不创建远端 deployment：

| 命令                           | 额外验证职责                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `pnpm deploy:build:preview`    | 轻量 Preview：准备输入、producer 检查、评分分布与离线 enemy 校验、Vite 和输出 smoke |
| `pnpm deploy:build:production` | Preview 基础加 build-input integrity、普通资源 integrity、最终引用与 route closure  |
| `pnpm ci:develop`              | Preview 基础加官方名称、type、lint 与 unit checks，提供轻量开发反馈                 |
| `pnpm ci:validate`             | 完整输入与业务语义审计、repository checks、Production 等价资源与输出验证            |

`pnpm deploy:build` 的选择由环境决定：未设置 `VERCEL_ENV` 或值为 `production` 时使用 Production；`preview` / `development` 时使用 Preview；未知值失败。
显式 `--profile` 优先于环境。脚本直接调用 Vite，避免递归触发普通 `build` 的 prebuild。

`data:validate:build-inputs` 独立重读落盘来源、TextMaps、manifest 与产物，检查身份、bytes/hash、schema、inventory 和消费者闭包。
`data:validate:full` 在此基础上验证业务语义、跨语言结构与英文 CJK；`data:validate` 是完整 validator 的 alias。
Production 信任受保护发布流程已通过完整 correctness，完整语义验证由 main PR 的 CI 承担；Preview/Development 不运行这两层数据 validator，保留 producer 检查。

## 分支与 GitHub CI

所有编辑在 `develop`，不得直接修改 `main`。[ci.yml](../.github/workflows/ci.yml)按事件分流：

- develop push 或目标为 develop 的 PR：运行 `pnpm ci:develop`，check 名为 `Development`。
- 目标为 main 的 PR：运行 `pnpm ci:validate`，check 名为 `Correctness`；安装 Chromium 后复用 build 运行 `test:e2e:smoke`。

项目策略允许 develop 直接 push；Development 是非 required 反馈，`develop → main` 应以 Correctness 验证新 merge candidate 后由人工审核。
分支保护的 required-check 设置属于 GitHub 远端状态，workflow 只能证明 check 名称与运行条件，维护者应在仓库设置核对。

## 手动 Preview 与 Production

[vercel.json](../vercel.json)仅允许 main 的 Git 自动部署；develop push 不自动触发 Vercel Preview。
需要远端页面/Function 验收时，在 GitHub **Actions → Vercel Preview Deployment → Run workflow** 选择分支。
[Preview workflow](../.github/workflows/vercel-preview.yml) checkout 所选 commit，使用 Node 24 与固定 Vercel CLI 59.16.0，运行 `vercel deploy --yes --target=preview` 上传源码，由 Vercel 远端构建；它不是本地 prebuilt 上传。
workflow summary 提供 ref、commit 与 Preview URL。

维护者在 Actions secrets 配置 `VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`。
两个 ID 可从现有项目设置或本地链接后的 `.vercel/project.json` 获取；token 与本机状态不提交。
手动 workflow 需要存在于默认分支，Actions 才提供入口。

Vercel 项目应设置 Node 24.x、冻结锁文件安装、build command `pnpm deploy:build`、output `build`，并为 Production / Preview 配置匹配的 `PUBLIC_SITE_URL`。
同时核对 Git Integration 的 Production branch 为 main、Player Function 产物和所需运行设置；仓库文件不证明这些远端配置当前已生效。
历史工具链核对见[2026-09-27 报告](investigations/runtime-toolchain-alignment-2026-09-27.md)。
合并或 push 到 main 按项目发布流程触发 Git Integration Production；Production 操作需要明确批准。
不要为自动验收修改 Deployment Protection；环境或认证阻断时记录未验证项，交由维护者完成受阻检查。

## 上游与 enemy snapshot 维护

维护产物包括 lock、tracked enemy snapshot、官方名称快照及人工 alias skeleton。更新操作遵守[代理约束](../AGENTS.md#internet-connectivity)。
手工流程只修改网站仓库：

```bash
pnpm upstreams:update
pnpm update:enemy-assets
pnpm relic-score:v2:benchmarks:validate
pnpm data:search-names:update
pnpm data:player-aliases:sync
pnpm data:search-names:check
```

`upstreams:update` 查询远端 HEAD 并更新 lock；需要指定版本时填写经过核对的完整 SHA，禁止 branch/tag/HEAD/latest 作为 lock 值。
enemy 与名称更新使用该 pin；alias sync 只为新合法 ID 补空数组，保留已有人工内容，不替维护者填写别名。
审阅实际 diff 后运行完整 correctness；评分政策或来源变动还需遵守[Profile 维护](relic-score-feature/profile-maintenance.md)，不能自动审批覆盖。

[update-upstreams.yml](../.github/workflows/update-upstreams.yml)每天及手动从 develop 准备维护更新：消息编译 → lock → enemy（包含完整 data:ensure）→ V2 正式 Benchmark/audit 验证 → 官方名称 → alias skeleton → 名称 check。
V2 审批按经过审核的八份来源内容校验，无关 commit 变化不会要求再次审批；内容变化时明确失败，不更新审批 digest。Benchmark 的副权重、概率/reference、采样或覆盖身份变化也会阻断自动提交；必须按现行维护规则完成复核及必要生成。保留完整数据准备，使敌方目录与目标 pin 一致，不通过绕开评分门禁解除跨子系统依赖。
只有维护产物出现实际 diff 时提交到 `automation/update-upstreams`，并创建/更新目标为 develop 的 PR；不自动审核、合并或部署。
权限为 `contents: write`、`pull-requests: write`。其 PR 获得 Development 检查，完整 correctness 在后续 main PR 承担。

Enemy 图片目录 [static/generated-enemy-assets/](../static/generated-enemy-assets/README.md)在维护时更新并提交，Production、Preview、CI 只离线验证与消费，不请求 Nanoka。
`pnpm assets:sync:enemies` 是 update alias，`pnpm assets:ensure:enemies` 是离线 validate alias；旧回归报告中的联网 ensure 不再适用。
更新阶段允许明确的单资源缺图并记录 unavailable，网络/解析/内容类型/图片校验等失败会中止更新；无效或过期快照会阻断构建，须显式更新并审阅。
不手改 manifest 或图片，不因为仓库 MIT License 就宣称 Nanoka 再分发许可已确认。

## 本地验证与清理

新克隆或发布边界使用自准备的 `pnpm ci:validate`，不要重复其完整子门禁。
本地浏览器 smoke 可复用同一 build：

```powershell
$env:PLAYWRIGHT_REUSE_BUILD = '1'
pnpm test:e2e:smoke
Remove-Item Env:PLAYWRIGHT_REUSE_BUILD
```

先停止旧 preview，避免测试连接旧服务器；仅在浏览器测试环境已准备时执行。其他 E2E/组件测试按实际风险选择。

`pnpm deploy:build:clean` 清理固定白名单后执行 deployment build，会重新准备上游与生成产物，不是日常检查。
执行前停止同仓库 dev/preview，确认代理与所选 profile；它使用与 `deploy:build` 相同的环境选择。
清理脚本保护 tracked 文件和 `.gitkeep`、拒绝 symlink/junction，不接受自定义删除路径，不清理依赖或相邻仓库；tracked enemy snapshot 和维护 metadata 保留。

旧冷暖耗时、资源体积、联网复现及初次待办见[部署基础历史](investigations/vercel-deployment-foundation-history.md)与[构建管线阶段记录](investigations/)。
这些报告提供当时证据，不能替代当前 pin 的验证结果。
