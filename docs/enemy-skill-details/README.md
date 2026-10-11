# 敌人技能详情文档

## 当前设计入口

[权威架构的 Ownership rules](../architecture/localization-and-data-generation.md#ownership-rules)规定公开技能与倍率详情边界。
技能由 locale-neutral 配置确定身份，各语言按自身描述决定可展示性；具体 `(MonsterID, SkillID)` binding 承载数值详情。
伤害倍率是可解析 ATK 候选，不是最终战斗伤害，也不承诺完整执行总倍率、触发概率或分支与目标的配对。

维护时先阅读权威架构，再定位当前 parser、projection 和 Skill Browser 的消费者。
官方描述解释机制；浏览器不解释 raw Ability、Predicate 或构建诊断。通用环境和验证策略见[开发指南](../development.md)。

## 设计演进与实施证据

- 初始配置证据：[技能详情调查](enemy-skill-details-investigation.md)；更早的[战斗模拟可行性审计](../combat-simulation/combat-simulation-feasibility-audit.md)不代表模拟器已实现。
- V2 简化提案：[redesign 调查](enemy-skill-details-v2-redesign-investigation.md)。其中“总倍率”设计后来由倍率候选契约取代。
- 倍率候选实施：[V2 Phase 4](v2-phase4-multiplier-candidates-cleanup.md)，记录局部线性聚合、跨分支候选与解析边界。
- 展示与内部收敛：[UI Round 1](ui-round1-information-hierarchy.md)、[上线前清理](pre-production-deep-cleanup.md)。

其余 Phase 1/2、V2 Phase 1–3 和条件分支调查按原文件保留，便于追溯设计选择。
本目录所有调查与实施报告都是历史证据，不与权威架构并列作为现行规范；旧字段、schema、覆盖率、文案和验收数量不代表当前状态。
