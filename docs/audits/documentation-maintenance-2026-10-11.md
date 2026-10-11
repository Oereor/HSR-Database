# 文档整理交付记录

日期：2026-10-11（Asia/Shanghai）。范围：HSR-Database / develop，起始 HEAD `fc2388d675b142141f96300b08eb6818c38bd504`；起始三个仓库均 clean。
结果保留为未提交文档改动，无 push、合并、部署或生产代码/配置/业务数据修改。

## 目录与数量

统计口径为 `docs/` 内实际文件，含新增、迁移及本报告，不计空目录和仓库外资料。JSON/CSV 是配套证据，不作为 Markdown 篇数。

| 位置                | 整理前 Markdown | 整理后 Markdown |
| ------------------- | --------------: | --------------: |
| docs 根目录         |              17 |               5 |
| architecture        |               1 |               1 |
| investigations      |              56 |              69 |
| audits              |               7 |              11 |
| relic-score-feature |              28 |              29 |
| enemy-skill-details |              13 |              14 |
| combat-simulation   |               1 |               1 |
| voracity-effect     |               1 |               1 |
| **合计**            |         **124** |         **131** |

总文件数 **140 → 147**；13 份 JSON 与 3 份 CSV 原位保留。根 README **221 → 68 行**，保留介绍、双语功能、启动、来源与许可，详细流程转入现行指南。
现有分类目录继续使用，未创建更深层级；原有空目录不作为文档入口，也未做额外目录清理。

按正文用途区分：2 篇权威规范（共享架构、评分 V2）；6 篇现行操作指南（development、消息、搜索、部署、Profile、Benchmark）；3 篇导航；1 篇英文评分说明；119 篇历史调查/审计/实施记录（含本报告）。
本地 Enka mock 报告保留可复用启动步骤，其结果仍归历史记录；不因旧报告包含操作命令就将整篇升级为现行规范。

## 新增、迁移与内容收敛

新增 7 篇：文档导航、开发指南、两个专题 README、两篇历史汇集及本报告。没有删除任何完整文档，配套实验/审核 JSON 与 CSV 未改。
README 的通用开发、验证和 changelog 内容归入 development；部署/CI、upstream 与 enemy snapshot 归入部署指南，各专题以链接连接，避免重复整篇规范。

下表路径相对于 `docs/`：

| 旧路径                                                    | 新路径                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `as-boss-traits-config-investigation.md`                  | [investigations/as-boss-traits-config-investigation.md](../investigations/as-boss-traits-config-investigation.md)                                   |
| `avatar-equipment-recommendation-config-investigation.md` | [investigations/avatar-equipment-recommendation-config-investigation.md](../investigations/avatar-equipment-recommendation-config-investigation.md) |
| `character-special-effects-config-investigation.md`       | [investigations/character-special-effects-config-investigation.md](../investigations/character-special-effects-config-investigation.md)             |
| `data-audit.md`                                           | [audits/data-audit.md](data-audit.md)                                                                                                               |
| `endgame-modifiers-config-investigation.md`               | [investigations/endgame-modifiers-config-investigation.md](../investigations/endgame-modifiers-config-investigation.md)                             |
| `enemy-data-model-audit.md`                               | [audits/enemy-data-model-audit.md](enemy-data-model-audit.md)                                                                                       |
| `enemy-variant-investigation.md`                          | [investigations/enemy-variant-investigation.md](../investigations/enemy-variant-investigation.md)                                                   |
| `HOMEPAGE-LATEST-LIMITED-INVESTIGATION.md`                | [investigations/HOMEPAGE-LATEST-LIMITED-INVESTIGATION.md](../investigations/HOMEPAGE-LATEST-LIMITED-INVESTIGATION.md)                               |
| `i18n-l10n-architecture-implementation.md`                | [investigations/i18n-l10n-architecture-implementation.md](../investigations/i18n-l10n-architecture-implementation.md)                               |
| `i18n-l10n-phase1-implementation.md`                      | [investigations/i18n-l10n-phase1-implementation.md](../investigations/i18n-l10n-phase1-implementation.md)                                           |
| `refactor-09-phase-04-investigation.md`                   | [investigations/refactor-09-phase-04-investigation.md](../investigations/refactor-09-phase-04-investigation.md)                                     |
| `refactor-status.md`                                      | [investigations/refactor-status.md](../investigations/refactor-status.md)                                                                           |
| `vercel-deployment-dependency-audit.md`                   | [audits/vercel-deployment-dependency-audit.md](vercel-deployment-dependency-audit.md)                                                               |
| `vercel-enemy-assets-regression.md`                       | [investigations/vercel-enemy-assets-regression.md](../investigations/vercel-enemy-assets-regression.md)                                             |

搜索性能、初次门禁、alias skeleton 和 updater 验收归入[搜索实施历史](../investigations/search-v2-implementation-history.md)，保留旧名称桶机制快照。
部署冷暖测量、旧联网 enemy ensure、Maintenance-06 与当时待办归入[部署基础历史](../investigations/vercel-deployment-foundation-history.md)；正文测量和结论保持原语境。

## 权威来源与历史标记

从[文档导航](../README.md)查找现行资料；共享数据与 locale 规范仍唯一指向 [architecture/localization-and-data-generation.md](../architecture/localization-and-data-generation.md)，其正文没有改写。
评分数学以 [V2 契约](../relic-score-feature/relic-rating-v2.md)为准，Profile 与 Benchmark 指南只提供操作；Profile 数量门槛改为当前来源全覆盖，98 作为 pin 快照说明，不改数学政策。

14 篇迁移报告增加历史状态与原路径说明；既有 i18n 报告的重复 H1/尾部状态提示收敛为一条提示。
敌人技能报告统一链接架构作为规范，Phase 4、UI 与清理报告作为历史证据。评分 V1、旧 N=3 报告保留现有历史标记及 JSON 审批/实验数据，没有全量搬迁。

现行消息指南已对齐双语字典、参数契约与 URL locale；搜索对齐稳定 MonsterTemplateID、双语 bundle 与中文人工别名；部署对齐构建 profile、离线 snapshot、手动 Preview 和 Player Function。
AGENTS 增加导航与简短维护约定，其余约束保留。README 不再承载阶段报告和详细工程流程。

## 引用与验证

原有 4 处失效相对链接已处理：两处架构路径随迁移修正；两处已删除 V1 配置链接改为历史代码路径并链接当前维护入口，没有错误指向 V2 同名文件。
保留历史叙述中的旧路径并补现址；fixture README 的已删除 V1 校准命令改为历史 provenance，不修改 fixture。
检查范围含根 Markdown、docs、其他 tracked README、显式路径及 `.github/` 工作流。脚本引用的评分报告路径与 enemy snapshot README 保持原位。

| 检查                    | 结果                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown 解析与内部链接 | 135 份仓库 Markdown 解析通过；247 处相对链接、其中 38 处 fragment 全部有效，含目录链接与引用式链接                                                              |
| Markdown 格式           | 使用现有 Prettier，覆盖 README、AGENTS、新入口/报告及修改的现行指南、fixture README 共 12 份；全部通过。历史报告只检查结构与修改片段，未整体格式化              |
| 历史内容保留            | 14 篇迁移正文与 22 篇仅调整状态/现址的报告按起始内容归一比较一致；搜索原正文及部署测量、Maintenance-06 与待办原段落在历史汇集中保留                             |
| 命令与源码一致性        | 现行入口中 pnpm script 名均存在于 package.json；对照 profile 编排、locale/消息配置、搜索身份、changelog 校验和三个 workflows 核对描述，未执行这些构建或维护命令 |
| 显式路径                | 源码、脚本、测试、配置与 workflows 无迁移旧路径引用；原脚本写入的评分报告路径保持有效                                                                           |
| 修改边界                | 起始 778 个 tracked 非 Markdown 文件的 SHA-256 全部一致，含代码、配置、workflows、锁文件、游戏数据及图片；新增非忽略文件均为 Markdown                           |
| Git 与相邻仓库          | git diff --check 通过；仍为 develop / 起始 HEAD，暂存区为空；两个相邻仓库的 HEAD 与 clean 状态不变                                                              |

检查使用仓库已有 Prettier Markdown AST 及一次性脚本，另用内存样例验证中文/重复标题、编码 fragment、HTML anchors、引用式链接及代码块排除。
临时工具与输出在本仓库忽略目录使用后移除，没有引入依赖或正式文档工具链。
按 documentation-only 范围，没有运行数据生成、构建、unit/E2E、联网验证或部署。

## 保留问题与边界

- `.env.example` 的站点 URL 使用 5273，开发默认端口为 4174；指南说明进程环境覆盖，示例、Vite 配置及服务端代码保持不变。
- Vercel 项目设置、Git Integration、GitHub required checks 与 Secrets 是远端状态，本轮未重新验证；指南明确哪些条件需要维护者核对，不声称云端已生效。
- Nanoka 再分发许可未确认，项目 MIT 不提供额外授权；现有署名与许可边界保留。
- 历史报告中的 removed scripts、旧 schema、固定数量、旧路径及未实现提案保留为证据。需要复现实验时应查对应 Git 历史，不能直接运行旧命令；本轮没有恢复旧代码或重新测量性能。
