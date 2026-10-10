# 遗器评分 UI 精简

日期：2026-10-10。基于 develop / 358ca06，仅修改展示、消息、相关测试和本报告。

## 展示与清理

- 单件卡片完整删除底部算法解释，不增加折叠区或 Tooltip；同步删除专用 CSS、词条查找/权重格式化逻辑和详情 DOM 属性。保留图片、装备名称、强化等级、右上角评分、主副词条数值、推荐高亮和原有 ×N 强化次数，卡片止于词条区域。
- 综合评分删除用户可见 V2 标记与主/副贡献指标，保留综合评分、有效副词条数、面板质量、套装质量及原有数值格式。
- 两项质量指标采用静态网格；宽容器在右侧，沿用 48rem/32rem 容器断点在窄屏下方排列。标题允许换行，保留设计变量和分割线，删除横向滚动、滚动焦点和对应 CSS。
- zh-CN/en 各删除 8 个无消费者消息：`player_relic_rating_v2_` 下的 `suitability`、`completion`、`main_part`、`sub_part`、`percentile`、`fixed`、`agnostic`、`weight_hits`。保留 `review_required`、`main_unavailable` 等不可用提示；这 8 项未列入 contracts.json，无需改契约。Paraglide 通过现有流程编译，没有手改生成文件。
- 双语 SSR 和 Player 页面测试改为验证简洁展示。真实 Mock 测试删除对 `data-main-mode` 的 UI 依赖，核对实际单件评分和两个质量百分比。保留已有词条、高亮、强化次数、导航缓存及缺件回归保护。

## 保留的内部字段

`mainContribution`、`subContribution`、`benchmarkPercentile`、主词条适配度/完成度、副词条权重/效用、CDF 与 Effective Hits 均保留：它们仍参与评分计算、汇总、条件分布验证或正式 DTO/维护工具。三个展示 formatter 也仍被评分、百分比和不可用提示使用。测试 fixture 中的正式 DTO 字段继续保留。

评分器、API 数值语义、algorithmVersion、DTO version、Profile、Benchmark、属性映射与锁文件没有修改。未重生成 Monte Carlo Benchmark，未运行 α 比较。历史报告中的旧界面描述保持为历史记录，本报告记录当前展示。

## 实际验证

| 检查 | 结果 |
|---|---|
| `pnpm messages:compile`、`pnpm check` 内的消息校验 | 423 条消息、两种语言校验并编译通过 |
| `pnpm check` | 通过；Svelte 0 errors / 0 warnings，scripts/API 类型检查通过 |
| 定向 Vitest：relic-rating-v2-ui、site-messages | 2 文件 / 4 tests 通过 |
| 修改文件的 ESLint、Prettier | 通过 |
| `pnpm build` | adapter-static 构建通过；数据/资源命中缓存，prebuild 的正式 Benchmark 校验通过 |
| 定向 Playwright | 首轮 22/24 通过；两例桌面真实样本首次响应超过原有 5 秒等待。服务加载完成后仅复验这两例，2/2 通过 |
| 残留消息调用、`git diff --check`、最终 diff/status | 通过；仅本轮组件、消息、测试与报告发生变更 |
| 私有样本与上游 | 4 份原文件验收前后 SHA256 一致；两个上游仓库仍 clean |

SSR 首轮有两条新断言未兼容 Svelte 自动生成的 class 属性；已修正断言并复验通过。真实 Mock 的首次响应超时保留原始失败记录，没有改超时、加启动 workaround 或宣称首轮全部通过。本轮未出现 Node 原生进程崩溃。

复现定向测试：

```text
pnpm exec vitest run tests/unit/relic-rating-v2-ui.test.ts tests/unit/site-messages.test.ts
pnpm exec playwright test tests/e2e/player-character.spec.ts tests/e2e/player-local-enka.spec.ts --grep "local Enka sample|concise relic scores|five-piece build|reuses the Player cache" --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0
```

## 本地视觉验收与边界

沿用已有 Mock：设置 `PLAYER_MOCK_ENABLED=1` 和私有目录 `PLAYER_MOCK_DIR`，运行 `pnpm dev --host 127.0.0.1 --port 4174 --strictPort`。本轮先读取启动日志，服务 ready 后确认 `/player/` 返回 HTTP 200，再运行浏览器测试。

4 份匿名样本覆盖 22 条角色记录：18 条完整配装、4 条缺件；在中英文与桌面/移动项目中验证正式评分展示。真实用例继续检查 no-store、导航只请求一次、刷新重读、外部请求 0、pageerror/console error 0。

另在 1440px、768px 和 Pixel 5 视口截取中英文普通完整配装、完整 1506 agnostic 配装与缺件装备区，共 18 张私有截图，并查看代表性截图。完整配装两项质量指标在桌面右侧、平板/移动下方，所有组合无页面横向溢出；HEAD/HAND、普通槽位和 agnostic 槽的单件评分、词条数值、高亮及 ×N 均正常，缺件保留不可用提示及已有单件评分。截图和临时验收工具仅存放在 Git 忽略的私有目录，未进入提交或构建；浏览器仅访问 localhost。

未发现本轮 UI 残留问题。冷启动真实 Mock 首次响应仍可能超过原有测试等待时间；本轮未修改该既有验收时限。未执行无关全仓测试、远端 Enka/Vercel 验收、commit、push 或部署。
