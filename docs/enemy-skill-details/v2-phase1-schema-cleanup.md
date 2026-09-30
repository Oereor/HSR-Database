# Enemy Skill Details V2 Phase 1：契约精简与旧功能清理

> 历史阶段记录：本文描述实施当时的模型与结论，不是当前实现规范。当前契约以 [规范架构文档](../architecture/localization-and-data-generation.md)、[V2 Phase 4 倍率候选报告](v2-phase4-multiplier-candidates-cleanup.md) 和 [UI Round 1 报告](ui-round1-information-hierarchy.md) 为准；历史测试、覆盖和文案记录不代表当前状态。

## Architecture

技能详情仍沿用 `MonsterConfig` 的具体技能绑定：构建期 `EnemySkillDetailDomain` 附在 Monster–Skill binding，按语言投影为 `EnemySkillDetail`，页面通过 `EnemySkillBindingView` 和 `getEnemySkillsForMonster` 与共享技能定义联接。官方描述、技能类别、元素、阶段和 `SkillExtraEffects` 不经详情解析器重建。

| V1 技能详情 | V2 Phase 1 技能详情 |
| --- | --- |
| `damage[{target,ratio,scaling}]` | `damage[{target,totals:[ratio],scaling}]` |
| `statuses[{statusId,kind,target,baseChance?,duration?}]` | `applications[{baseChance,statusId?,target?}]` |
| `actionShifts` | `actionShifts`，语义不变 |
| `bounce`、`effects`、`summons` | 删除 |

## Final domain types and migration

`EnemySkillDamageTarget` 为 `primary`、`adjacent`、`all`、`each-swept`、`enemy-side`、`marked`、`other-marked`。`enemy-side` 是原 `enemy-ally` 的语义更名；`self` 只留在解析器内部判断，不进入伤害目标类型。

`damage[].totals` 是十进制字符串数组。当前解析器仍采用 `VERIFIED_DAMAGE_SKILLS`、相同 Ability/目标检查和原参数覆盖机制，每个已发布 `ratio` 仅机械包为单元素 `totals`。没有求和、数值去重、多路径排序或多值生产输出；未来 Phase 2 应对每个目标角色证明完整执行结果集，再用现有 `compareDecimals` / `decimalEquals` 等无损工具排序与去重。

`applications[].baseChance` 必填。解析器仅迁移原来有稳定 Status ID、可识别目标和可解非负 Chance 的 `AddModifier`，先沿用 V1 按 Status ID 保留最后一项的去重顺序，再舍弃无数值项；自身目标的数值 application 不带公开 `target`。上游 `StatusType` 仍用于维持原映射资格，但不再进入产品详情。投影仅在存在 `statusId` 时查找本地化名称；没有 ID 或名称时也能保留数值契约。无 ID Chance 的实际提取留给 Phase 3。`MonsterStatusConfig` 仍是数据源要求和名称索引。

## Removed features and preserved systems

- 删除技能详情的 `LifeTime` / `simpleTurns` 解析、`3003051` 期限特例、回合 UI 与消息。
- 删除 `VERIFIED_SUMMON_SKILLS`、`candidateSummons`、技能详情的召唤投影、服务端技能召唤图片与链接补充、组件卡片与专属消息。
- 删除 `bounce.count`、`401401207/208` 的计数发布特例及对应 UI／消息；不补造弹射伤害总值。
- 删除 `300305105` 的 `trigger-dot` / `clear-dot` 特例和详情行；官方描述继续承载 DoT 机制。
- 无数值的状态身份、类别或目标不再产生详情。只剩旧事实的技能现在没有补充区。

主敌人页面的 `monster.summons`、`EnemySummonReference`、`projectSummon`、`CompactEntityCard` 和本地化路线仍保留。Monster 专属技能绑定、官方描述、Skill Browser、行动变化、`SkillExtraEffects` 及临时伤害白名单也均保留。

## Projection, view and UI

投影原样传递伤害 `totals[]` 与行动变化，给有 ID 的 application 添加可选名称。`EnemySkillDetailView` 现与生成契约一致；页面仍保存共享定义和具体 Monster 的轻量 binding，Svelte 只接收已联接的技能。UI 仅显示倍率、基础概率和行动变化；`totals:['3','5']` 的格式函数可生成 `300% / 500%`，但本阶段生产数据仍只有单值。三类数值均无时，隐藏补充区及其分隔线，官方描述和独立 ExtraEffects 照常显示。站点消息只清理技能详情旧键并将 `enemy-ally` 标签键改为 `enemy-side`。

## Payload impact

字节数为 UTF-8；“生成”是 `src/lib/generated/views/<locale>/details/enemies/<id>.json` 的文件大小，“页面”是图片／链接服务端补充之前 `JSON.stringify(buildEnemyDetailPageData(rich))` 的字节数。前后使用同一份上游数据 `6b2bc17ebf46`。

| Locale | Enemy | 生成前 → 后 | 页面前 → 后 |
| --- | --- | ---: | ---: |
| zh-CN | `1002030` | 1,020,106 → 1,013,814 | 149,486 → 143,436 |
| en | `1002030` | 1,021,193 → 1,014,745 | 150,321 → 144,121 |
| zh-CN | `1022010` | 794,699 → 794,762 | 120,831 → 120,891 |
| en | `1022010` | 794,453 → 794,516 | 121,128 → 121,188 |
| zh-CN | `3003051` | 201,024 → 199,659 | 35,845 → 34,753 |
| en | `3003051` | 202,872 → 201,472 | 36,559 → 35,439 |
| zh-CN | `4013010` | 450,038 → 445,250 | 85,058 → 80,730 |
| en | `4013010` | 452,818 → 447,811 | 85,899 → 81,373 |
| zh-CN | `4014012` | 175,570 → 173,126 | 30,230 → 28,397 |
| en | `4014012` | 177,205 → 174,709 | 31,267 → 29,395 |
| zh-CN | `4064012` | 276,902 → 272,258 | 39,375 → 35,505 |
| en | `4064012` | 280,847 → 276,047 | 40,872 → 36,872 |

抽查这些生成和页面详情时，均未发现旧 `bounce`、`statuses`、`effects` 或技能详情 `summons` 字段；`1022010` 的少量增长来自 `ratio` 改为 `totals`。

## Tests and validation

更新了解析、投影、Skill Browser 格式及浏览器测试；删除旧期限、技能召唤、Bounce 和 DoT 的正向断言，改为“详情缺席”控制。新增无 Status ID 的投影契约测试；保留通用召唤的中英文链接和点击回归。覆盖 `102201001` 的 300% ATK／延后 50%、`100203001` 与 `406401201` 的 Monster 变体、Kafka 言灵的提前 100%、`401401207/208` 和 `300305105` 的旧事实消失。

使用 Node 24.19.0：5 个定向 Vitest 文件的 44 项测试、`pnpm data:sync`、`pnpm data:validate:full`、`pnpm check`、定向 Prettier、定向 ESLint、`pnpm build` 和桌面／移动端 30 项 Playwright Enemy Detail 用例均通过。数据校验仍报告已有的 TextMap 缺项及弱点／抗性提示，不影响通过结果。手动检查本地预览的 `1022010` 中文技能区，显示 300% 攻击力和 50% 行动延后，无浏览器控制台错误。

## V2 Phase 2 handoff

Phase 2 可只替换构建期 `damageRows` 的证明与聚合，并在确定安全后移除 `VERIFIED_DAMAGE_SKILLS`。输出目标已是具体 Monster binding 的 `damage[{target,totals,scaling}]`；投影、页面和组件可以接收多个总值。Phase 1 没有新增目标别名、`AQAAAAQR`、多击、分支或循环处理，也没有扩大无 Status ID 的 Chance 覆盖。
