# 文档导航

项目介绍与快速启动见[根 README](../README.md)，仓库操作约束见 [AGENTS.md](../AGENTS.md)。

## 当前规范

| 主题                                                 | 权威来源                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 双语路由、数据生成、验证边界、养成材料与敌人技能详情 | [Localization and Data Generation Architecture](architecture/localization-and-data-generation.md) |
| 遗器评分数学、Profile 与分布身份                     | [遗器评分 V2 契约](relic-score-feature/relic-rating-v2.md)                                        |

专题契约解释本专题；共享数据与 locale 边界仍以架构文档为准。阶段报告不能覆盖现行规范。

## 开发与维护

- [开发指南](development.md)：环境、三仓库布局、常用命令、验证策略与双语 changelog。
- [部署与 CI](vercel-deployment-foundation.md)：构建 profile、分支流程、手动 Preview、Production 与上游更新。
- [站点消息](site-ui-messages.md)：维护中英文 UI 消息、参数契约和 locale 调用。
- [搜索维护](search-v2.md)：名称来源、人工别名、稳定目标与分片加载。
- [遗器评分专题](relic-score-feature/README.md)：Profile、Benchmark 维护及模型演进证据。
- [敌人技能专题](enemy-skill-details/README.md)：当前设计入口、解析边界与阶段实施记录。
- [Enemy visual snapshot](../static/generated-enemy-assets/README.md)：受 Git 跟踪的图片快照与离线验证。

## 历史资料

[investigations/](investigations/) 保存配置调查、功能实施、性能测量及修复验收；[audits/](audits/) 保存审计与阶段收敛记录。
目录中未单独标为维护指南的报告均描述其原阶段；其中“当前”“已通过”“待办”、数量与版本不代表今日状态。

[排轴模拟器 Phase 1](investigations/action-planner-phase1-2026-10-11.md) 记录单波次工具的数据投影、排序与 Buff 模型、交互和本地验收结果。

[角色选择器优化](investigations/action-planner-character-selector-2026-10-11.md) 记录独立槽位、头像 Grid、轻量角色搜索、速度初始化规则及后续 UI 验收。

[行动序列卡片优化](investigations/action-planner-action-cards-2026-10-11.md) 记录共享卡片、两种 AV 展示语义、稳定锚点交互及本地验收。

[动态参与者架构与基础重构](investigations/action-planner-dynamic-participants-architecture.md) 记录统一队列、动态实例与生命周期、速度倒计时、测试清理和 Inspector 迁移边界。

[Inspector 与动态参与者创建](investigations/action-planner-inspector-participant-creation.md) 记录 Phase 3A 的双 Tab、统一操作列表、创建与编辑闭环、目标时点、文案清理和本地验证边界。

搜索和部署的旧测量分别汇集于[搜索实施历史](investigations/search-v2-implementation-history.md)与[部署基础历史](investigations/vercel-deployment-foundation-history.md)。
遗器评分与敌人技能历史留在各自专题目录；[战斗模拟可行性](combat-simulation/)和[贪饕机制调查](voracity-effect/)保留独立主题，不代表完整模拟器已实现。

## 文档维护约定

- README 用于项目介绍与快速入口，不追加详细实现报告。
- 当前技术规范应有明确权威来源；流程变化时同步更新对应现行指南。
- 历史报告保留原结论、数据、日期与语境；用状态提示和后续链接说明取代关系。
- 新文档优先放入已有合适目录，并从相关入口链接，避免重复复制整篇规范。
- 迁移文档时修复相对链接和标题 anchors；历史路径作为证据保留时标明现址。
