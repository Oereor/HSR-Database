# Enemy Variant Investigation

## 1. Goal

本调查回答一个尚未进入 production 实现的问题：两个具体 enemy record 是否属于同一个面向用户的 Enemy Family / Variant。调查不创建 `EnemyFamily`，不修改 URL、搜索、总览、Endgame 映射、avatar 或代表选择。

本次数据基线来自上游提交 `648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7`，语言为简体中文。可重复执行：

```text
pnpm investigate:enemy-variants
```

脚本位于 `scripts/investigations/enemy-variants.ts`，只读 `TurnBasedGameData`、网站已有生成详情、Endgame 生成文件和敌方资源 manifest，不写入外部仓库。

## 2. Relevant Data Sources

- `MonsterTemplateConfig`：613 个 canonical template，定义模板身份、基础属性、Rank、`TemplateGroupID`、prefab、icon/image 路径和 AI 默认引用。
- `MonsterConfig`：2,591 条具体配置，使用 `MonsterID` 作为具体战斗/数值实例 ID，并通过 `MonsterTemplateID` 指向模板；另含 `SkillList`、数值修改、`HardLevelGroup`、`EliteGroup`、召唤等关系。
- `MonsterSkillConfig`：3,462 条技能配置。canonical enemy 通过 `MonsterConfig.SkillList` 引用；技能自己的 `PhaseList` 描述阶段归属。
- `HardLevelGroup`、`EliteGroup`：等级倍率、难度/Rank 相关数值来源。它们说明 variant-specific 数值，但不是用户视角 family key。
- `MonsterAtlasExtraPhase`、`MonsterAtlasExtraPhases`：图鉴额外阶段信息，只有少量覆盖，不能作为全量技能阶段来源。
- `MonsterGuideConfig`、`MonsterGuidePhase`、`MonsterGuideSkill`：有限的攻略/图鉴关系，和 canonical 技能阶段覆盖范围不同，不能驱动详情页 Phase Tabs。
- `static/generated-enemy-assets/index.json`：生成的 `MonsterID -> imageId/icon` 映射，用于检查视觉复用；资源不是权威身份模型。
- `src/lib/generated/details/enemies/*.json`：当前网站 canonical enemy detail，保留名称、Rank、技能集合和阶段关系。
- `src/lib/generated/endgame/*.json`：Endgame 只引用具体 `MonsterID` / `MonsterTemplateID` 作为 encounter instance 证据，不作为 family identity。

## 3. Config Relationships

```text
MonsterTemplateConfig.MonsterTemplateID
        │  canonical template / base stats / prefab / rank / TemplateGroupID
        │
        ├── MonsterConfig.MonsterTemplateID
        │       └── MonsterConfig.MonsterID
        │              ├── SkillList ──> MonsterSkillConfig.SkillID
        │              ├── HardLevelGroup ──> HardLevelGroup
        │              ├── EliteGroup ──> EliteGroup
        │              └── SummonIDList ──> other MonsterConfig.MonsterID
        │
        └── generated enemy detail (canonical template route)

MonsterSkillConfig.PhaseList
        └── production Phase Tabs 的技能阶段关系
```

网站 canonical enemy route 选择 `MonsterID === MonsterTemplateID` 的 `MonsterConfig`。全库 613 个 template 都存在这个 canonical config，但同一个 template 还可能有许多其他 `MonsterID` 配置。Endgame、挑战和 encounter 数据中的具体 ID 因此更像场景、难度或战斗实例引用；它们不能直接等同于用户要看的 family。

Phase 与 Variant 必须分开：一个具体 template 可以有多个 Phase，而一个未来的 Variant 也可以有自己的多个 Phase。本阶段只把 `PhaseList` 用于技能展示，不把阶段数量当作 family 数量。

## 4. Candidate Identity / Grouping Fields

### `MonsterTemplateID`

它是 canonical 网站详情和基础配置连接键，适合区分当前网站要展示的具体模板，但它本身不能把多个 template 合并成 family。

### `TemplateGroupID`

这是最强的原始候选 family signal。非空时，它经常把同一视觉/战斗模板的不同完整、幻象、污染或难度版本放在一起，但它表达的是共享模板/战斗身份，不保证等于用户理解的名称 family。`TemplateGroupID` 缺失时不能自动推断。

### 名称 / localization hash

名称可用于人工审核和组合校验，不能单独作为 identity。相同名称跨不同 group、prefab 和 image 的实例确实存在；同一候选 group 内又经常有“完整”“幻象”“污染”等不同名称。

### Prefab / imageId / icon

视觉字段可作为二次验证和未来 avatar 候选，但资源会在不同 group 间复用。同视觉不代表同 family，同 family 也可能有不同 imageId。

### Rank、EliteGroup、HardLevelGroup、HP/ATK/DEF/SPD/Stance

这些字段主要描述战斗难度、等级或 variant-specific 数值。它们可证明记录存在差异，但不应直接参与 identity 排除。

### SkillList / PhaseList

技能集可以作为语义验证，不能作为 primary key。技能会随难度、阶段、特殊版本和场景增删或替换；SkillID 也常随具体 template 派生。

## 5. Dataset-Level Statistics

调查脚本基线统计：

| 指标                                                           |                      数值 |
| -------------------------------------------------------------- | ------------------------: |
| `MonsterTemplateConfig`                                        |                       613 |
| `MonsterConfig`                                                |                     2,591 |
| `MonsterSkillConfig`                                           |                     3,462 |
| 每个 template 均有 canonical `MonsterID === MonsterTemplateID` |               是，613/613 |
| 拥有多个 `MonsterConfig` 的 template                           |                       357 |
| 单个 template 最大具体实例数                                   |    76，template `8002050` |
| 有 `TemplateGroupID` 缺失的 canonical template                 |                       154 |
| `TemplateGroupID` 值数量（含空值）                             |                       165 |
| 非空 `TemplateGroupID` 值数量                                  |                       164 |
| 多成员 group（含空值）                                         |                       112 |
| 多成员非空 group                                               |                       111 |
| 最大非空 group                                                 | `8002050`，14 个 template |
| canonical template 中明确阶段集合 `[1]`                        |                       438 |
| 明确阶段集合 `[1,2]`                                           |                       106 |
| 明确阶段集合 `[1,2,3]`                                         |                        62 |
| 明确阶段集合 `[2,3]`                                           |                         1 |
| 没有明确阶段的 template                                        |                         6 |
| 多阶段 canonical enemy                                         |                       169 |
| 多阶段且存在技能显式跨阶段共享                                 |                       162 |
| 多阶段且存在可展示的空 `PhaseList` 技能                        |                        44 |

Endgame 生成数据引用了 405 个具体 `MonsterID`，其中 245 个不是自身 template ID。这进一步支持“encounter 引用是实例关系，不是 family identity”的判断。

## 6. Positive Variant Examples

### 6.1 杰帕德：普通/完整/幻象版本

`TemplateGroupID = 1004020` 包含 9 个 template：`1004020`、`1004021`、`1004022`、`1004023`、`1004024`、`1004025`、`1004026`、`1004027`、`1004028`。

共同证据：Rank 均为 `LittleBoss`，prefab 均为 `Monster_W1_Gepard_00.prefab`，imageId 均为 `1004020`。名称在“杰帕德”“杰帕德（完整）”“杰帕德（幻象）”之间变化，技能 ID 按具体实例分组变化。这是典型的同一战斗/视觉模板下的 variants。

### 6.2 史瓦罗：多实例 Boss 模板

`TemplateGroupID = 1014010` 包含 7 个 template（`1014010`–`1014016`）。它们共享 `Monster_W1_Svarog_00.prefab` 与 imageId `1014010`，Rank 均为 `LittleBoss`，名称有普通和“完整”版本，技能数量随版本变化。技能集适合做二次语义检查，不适合作为合并键。

### 6.3 彦卿：多阶段/特殊版本边界

`TemplateGroupID = 2004020` 包含 7 个 template，均使用 `Monster_W2_Yanqing_00.prefab` 和 imageId `2004020`，名称包含普通、完整、幻象、污染版本。不同 template 的 SkillList 不完全相同，说明同一候选 family 内可存在阶段、难度和特殊版本差异。

### 6.4 Sunday / Boss 版本

`TemplateGroupID = 3025010` 将 7 个 Sunday 相关 template（`3025010`–`3025016`）放在同一候选 group。其 Rank、技能数量和阶段关系存在差异，符合“同一面向用户 Boss family、多个战斗 variant”的假设，但仍需要下一阶段人工确认用户展示边界。

### 6.5 扑满家族：数量最多的候选 group

`TemplateGroupID = 8002050` 有 14 个 template，名称包括“序列扑满”“扑大哥”“扑老二”“扑三弟”“毁灭扑满”“丰饶扑满”“存护扑满”“魔猪”等。它们共享 `Monster_XP_Minion04_01.prefab` 和 imageId `8002050`，但用户可见名称差异很大。这是强烈的“共享底层模板/视觉身份”证据，也是不能把原始 group 无条件当作网站 family 的重要提醒。

## 7. Counterexamples / False Positives

### `TemplateGroupID = 1004010` 的语义歧义

该 group 同时包含可可利亚相关 template，以及“无望冽风的幻灭者”和“托帕幻象”。它们共享 Cocolia 相关 prefab/image 与战斗模板关系，但面向用户的名称和叙事身份并不一定应合并成一个 family。说明 `TemplateGroupID` 很可能是共享 combat/template identity，而不是最终网站 family。

### 视觉资源跨 group 复用

`Monster_W3_Dinosaur_02.prefab` 同时覆盖 group `3003013` 与 `3004020`；`Monster_W4_IronTombCore_00.prefab` 覆盖 group `4032060`、`4032070`、`4035010`。因此同 prefab 不能单独作为 family key。

### imageId 复用

资源映射中 imageId `2033020` 同时出现在 group `2033020` 和 `2035010`，前者包含蚀月心兽相关实例，后者包含「飞霄」之影 Boss。相同 imageId 只说明资源复用或视觉近似，不足以证明用户 identity 相同。

## 8. False Negatives / Edge Cases

- 154 个 canonical template 没有 `TemplateGroupID`。若只使用非空 group，必然漏掉一部分可能属于同一 family 的记录。
- 可可利亚的 humanoid/幻象模板位于 group `1004010`，而“可可利亚，虚妄之母”位于 group `1005010`。如果产品把 family 定义为“同一角色身份”，单独使用 `TemplateGroupID` 会把它们拆开；如果 family 定义为“同一战斗形态”，拆开又可能是正确结果。这是需要人工产品判定的明确 false-negative candidate。
- 同一候选 group 内名称可能变化为“完整”“幻象”“污染”“巨大”等，name-only 会把合理 variants 拆开，或把共享底层模板但用户身份不同的记录合并。
- `MonsterConfig` 的 2,591 条记录中，大量是同一 template 的等级、难度、场景或战斗实例；直接按 `MonsterID` 分组会把一个 family 过度拆散。
- 阶段关系不是 family 关系：例如同一 template 的技能会拥有 `[1,2,3]` 或共享技能，不能据此生成多个 variant。
- 空 `PhaseList` 表示技能不受阶段限制；阶段信息缺失不代表一个新的 family，也不代表应删除技能。

## 9. Name-Based Grouping Evaluation

name-only grouping 不安全。最直接的反例是“散装英雄王”：`3003034`、`3003044`、`3003054` 使用完全相同的中文名，但分别属于 group `3003030`、`3003040`、`3003050`，prefab 也分别是 `Monster_W3_Figure_02.prefab`、`Monster_W3_Figure_00.prefab`、`Monster_W3_Figure_01.prefab`。这说明 localization 文本可能是开发对象或场景标签，不是稳定 identity。

反过来，同一候选 group 内也常有不同名称后缀，例如杰帕德、杰帕德（完整）、杰帕德（幻象），说明 name 需要归一化或仅用于审核。名称还可能包含 Boss 阶段、污染、幻象、稀有、巨大等 variant-specific 状态。结论：名称适合作为人工 review 的证据，不适合作为单独自动键。

## 10. Model / Prefab / Visual Identity Evaluation

视觉 identity 是强辅助信号：杰帕德、史瓦罗、彦卿等候选 group 内 prefab/imageId 高度一致，能帮助验证 `TemplateGroupID` 的同源性。但跨 group 复用的 Dinosaur、IronTombCore 和 imageId `2033020` 证明同模型/同图标会产生 false positive。

因此未来 avatar 选择应从候选 group 中结合名称、Rank、语义和人工确认选择，不能仅按第一个 MonsterID 或 imageId 自动代表整个 family。本阶段不实现 representative。

## 11. Skill-Set Similarity Evaluation

技能集更适合 secondary validation。候选 group 内同类 template 经常拥有相似的技能结构，但 SkillID 会随 template 派生；完整、幻象、污染和特殊模式会增加、减少或替换技能；阶段也会改变某技能出现的位置。可以比较技能标签、DamageType、Phase 数量、技能名称语义和弱点集合，但不应要求 SkillList 完全相等。

当前阶段已确认 169 个 canonical enemy 是多阶段，162 个多阶段敌人包含显式跨阶段共享技能。这种关系说明技能集合和阶段结构都属于一个具体战斗 template 的行为数据，不是独立 family key。

## 12. Identity Fields vs Variant-Specific Fields

| 更接近 identity 的证据                       | 更接近 variant-specific 的证据                |
| -------------------------------------------- | --------------------------------------------- |
| 非空 `TemplateGroupID`（候选，不是最终真值） | `MonsterID`、场景/encounter 引用              |
| canonical `MonsterTemplateID` 关系           | `HardLevelGroup`、`EliteGroup`                |
| prefab/imageId（辅助）                       | HP、ATK、DEF、SPD、Stance、倍率               |
| Rank、名称语义（审核）                       | SkillList 增删、PhaseList、完整/幻象/污染后缀 |

这不是绝对分类：Rank、名称和视觉资源都可能在用户视角上产生例外，所以推荐把它们作为组合验证证据，而不是硬编码单字段规则。

## 13. Candidate Grouping Strategies

### Strategy A：单独使用 `TemplateGroupID`

优点是实现简单、可解释、已有全库字段；对杰帕德、史瓦罗、彦卿、Sunday 等候选 group 覆盖良好。

缺点是 154 个 template 缺失字段；`1004010` 和 `8002050` 等 group 存在用户视角歧义；空值不能安全合并；无法表达某些跨 group 的用户 family。

### Strategy B：`TemplateGroupID + name/model/imageId/rank/skill similarity`

以非空 group 为候选起点，再用视觉、Rank、名称语义、弱点和技能标签做一致性评分或人工审核。

优点是能过滤明显的 group 内语义冲突，并对缺失 group 提供候选线索。缺点是组合规则复杂，名称和资源复用会引入 false positive，技能和数值版本变化会引入 false negative；没有清晰标注的数据仍会产生不确定结果。

### Strategy C：强规则 + 显式人工 override/review

用非空 `TemplateGroupID` 覆盖大多数候选，使用 model/imageId、Rank 和技能语义验证；对缺失 group、歧义 group 和用户视角不一致的候选建立显式 review/override 数据。

优点是自动化范围可控，能保留证据和例外，适合未来 avatar、overview 和搜索等产品语义。缺点是需要维护少量审核记录，并在上游更新后复核。

## 14. Recommended Strategy

推荐 **Strategy C**：以非空 `TemplateGroupID` 作为 candidate family 起点；使用名称、prefab/imageId、Rank、弱点和技能语义做验证；缺失 group 或明显歧义的 group 不自动合并；下一阶段经过人工 review 后再建立显式 override/review 数据。

本阶段不创建 override 表、不实现 family model、不修改任何现有页面或路由。特别是 `1004010`、`8002050` 和跨 prefab/image 复用样本应进入 review 清单，而不是直接成为用户可见 family。

## 15. Confidence and Remaining Unknowns

**Confidence: Medium**。

置信度来自完整 613 template / 2,591 config 的统计，而不是少量样本；`TemplateGroupID` 与多个强正例的 prefab/image/Rank/技能结构一致。但以下未知项仍可能推翻具体 family 结果：

- `TemplateGroupID` 的设计语义是否在所有版本中稳定；
- 缺失 `TemplateGroupID` 的 154 个 template 是否有另一个未调查的稳定字段；
- 用户希望的 family 是“共享战斗模板”“共享角色名称”还是“共享视觉 avatar”；
- 某些跨 group 共享资源是否来自临时关卡或开发内部对象；
- 新版本是否新增跨 group 复用、改名、替换技能或新的 Rank。

## 16. Suggested Next Implementation Step

下一阶段先把脚本输出转成审阅清单，而不是直接自动聚合：

1. 以非空 `TemplateGroupID` 生成候选 family。
2. 对 `1004010`、`8002050`、缺失 group 和视觉跨 group 复用项进行人工标注。
3. 设计小型、版本化的 override/review 数据格式，记录合并、拆分和“不确定”原因。
4. 在得到产品语义确认后，才实现 `EnemyFamily`、代表 avatar、overview/search/URL 或 Endgame 展示变化。
