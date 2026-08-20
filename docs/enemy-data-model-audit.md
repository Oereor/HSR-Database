# Enemy 数据模型审计报告

审计对象：`MonsterTemplateConfig` / `MonsterConfig` / Enemy Detail 生成链

上游数据提交：`648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7`（简体中文）

审计范围：只修改 `HSR-Database`；`TurnBasedGameData` 与 `StarRailRes` 只读。Endgame 生成与 schema 不迁移。

## 1. Confirmed Config Relationships

真实关系如下：

```text
MonsterTemplateConfig.MonsterTemplateID
        │
        └── MonsterConfig.MonsterTemplateID
                    │
                    └── MonsterConfig.MonsterID
                              ├── MonsterSkillConfig.SkillID
                              │       └── MonsterSkillConfig.PhaseList
                              ├── HardLevelGroup.HardLevelGroup
                              ├── EliteGroup.EliteGroup
                              └── SummonIDList -> MonsterConfig.MonsterID
```

`MonsterTemplateConfig` 是模板身份和基础属性来源；`MonsterConfig` 是具体战斗配置。后者拥有修改倍率、弱点、伤害抗性、负面效果抵抗、技能和召唤引用。`MonsterID === MonsterTemplateID` 只是 canonical concrete record 的连接条件，不会把该 record 变成 TemplateConfig。

`MonsterSkillConfig.PhaseList` 是当前详情页阶段标签的实际来源。`MonsterGuide*` 与图鉴额外阶段表覆盖不完整，未用于替代 canonical skill pipeline。

## 2. Template / Monster Cardinality

| 指标                                                     |                                 结果 |
| -------------------------------------------------------- | -----------------------------------: |
| `MonsterTemplateConfig`                                  |                                  613 |
| `MonsterConfig`                                          |                                2,591 |
| 有至少一个 MonsterConfig 的 Template                     |                              613/613 |
| 每个 Template 都有 `MonsterID === MonsterTemplateID`     |                          是，613/613 |
| 拥有多个 MonsterConfig 的 Template                       |                                  357 |
| 单个 Template 最大 MonsterConfig 数                      |                      76（`8002050`） |
| canonical `MonsterID`                                    |                                  613 |
| 非 canonical concrete Monster                            |                                1,978 |
| 7 位 Template ID                                         |                              613/613 |
| 9 位 concrete ID（非 canonical）                         |                          1,978/1,978 |
| 不符合上述长度分类的 concrete 例外                       |                                    0 |
| 非 canonical ID 不符合显式 Template reference 的前缀规律 | 0（仅作观察，不作为 production key） |

长度/前缀规律可以作为 validation invariant，但 production relation 使用 `MonsterConfig.MonsterTemplateID` 显式字段。

## 3. Field Provenance Table

| Website field      | Raw config                                                                                                                         | Ownership                                                 | Calculation / normalization                                       | 结论                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| HP                 | `MonsterTemplateConfig.HPBase` + `MonsterConfig.HPModifyRatio` / `HPModifyValue` + `HardLevelGroup.HPRatio` + `EliteGroup.HPRatio` | base 在 Template；倍率/加值在 Monster；等级/Rank 在难度表 | `(base × instanceRatio + instanceValue) × hardRatio × eliteRatio` | 已由共享 resolver 生成                                                                      |
| ATK                | `AttackBase` + `AttackModifyRatio` / `AttackModifyValue` + `AttackRatio`                                                           | 同上                                                      | 同上                                                              | 已验证                                                                                      |
| DEF                | `DefenceBase` + `DefenceModifyRatio` / `DefenceModifyValue` + `DefenceRatio`                                                       | 同上                                                      | 同上                                                              | 613 Template 中均有 base；1 个 Monster 缺少 DEF ratio，沿用 resolver 的缺失降级边界         |
| SPD                | `SpeedBase` + `SpeedModifyRatio` / `SpeedModifyValue` + `SpeedRatio`                                                               | base 在 Template；modifier 在 Monster                     | 同上                                                              | 600/613 Template 有 `SpeedBase`，缺失时为 unavailable                                       |
| Stance / Toughness | `StanceBase` + `StanceModifyRatio` / `StanceModifyValue` + `StanceRatio`                                                           | 同上                                                      | 先算 internal stance，再精确除以 3 转玩家韧性                     | 581/613 Template 有 `StanceBase`                                                            |
| Status Resistance  | `MonsterTemplateConfig.StatusResistanceBase` + `HardLevelGroup.StatusResistance`                                                   | base 在 Template；等级附加值在 HardLevel                  | decimal addition                                                  | Template 缺失时不伪造 base；当前公开 projection 保持既有 0 fallback 行为并在 audit 标出缺失 |
| Effect Hit         | `HardLevelGroup.StatusProbability`                                                                                                 | HardLevel / level-owned；不是 Template 或 Monster field   | 直接按 level 输出                                                 | 301/741 HardLevel rows 有值；没有 hardcode 或 Rank mapping                                  |
| Weakness           | `MonsterConfig.StanceWeakList`                                                                                                     | Monster                                                   | 元素归一化                                                        | 不再属于 Template                                                                           |
| Damage Resistance  | `MonsterConfig.DamageTypeResistance`                                                                                               | Monster                                                   | 去零值、元素归一化                                                | 不再属于 Template                                                                           |
| Debuff Resistance  | `MonsterConfig.DebuffResist`                                                                                                       | Monster                                                   | key 映射为公开状态标签                                            | 当前 988/2591 Monster 有配置；未知 key 全库 0                                               |
| SkillList          | `MonsterConfig.SkillList` -> `MonsterSkillConfig`                                                                                  | Monster                                                   | description formatting、无描述过滤、PhaseList 绑定                | 不再把 canonical 技能当 Template-owned                                                      |
| PhaseList          | `MonsterSkillConfig.PhaseList`                                                                                                     | referenced Monster skill                                  | 构建 `skillPhases`，保留共享/空 Phase 语义                        | 现有 Phase Tabs 保持                                                                        |
| SummonIDList       | `MonsterConfig.SummonIDList` -> MonsterConfig -> Template                                                                          | Monster                                                   | 解析具体 summon Monster，页面链接按 summon Template               | 不再属于 Template                                                                           |
| Rank               | `MonsterTemplateConfig.Rank`                                                                                                       | Template                                                  | 直接展示                                                          | 当前 `Enemy.rank` 为兼容投影                                                                |
| HardLevelGroup     | `MonsterConfig.HardLevelGroup`                                                                                                     | Monster / level context                                   | 查 HardLevel 行                                                   | 每条 MonsterConfig 均可解析                                                                 |
| EliteGroup         | `MonsterConfig.EliteGroup`                                                                                                         | Monster / Rank context                                    | 查 EliteGroup 行                                                  | 每条 MonsterConfig 均可解析                                                                 |

新增 domain 类型为 `MonsterTemplate` 与 `Monster`。每个 `Enemy` 现在包含 `template`、`monsters[]`、`defaultMonsterId`、`defaultMonster`；旧顶层 stats/weakness/skill 字段保留为 presentation compatibility projection。

## 4. Stat Formula Audit

当前 canonical 与 concrete Monster 都通过 `resolveCanonicalEnemyStats`：

```text
configured = (Template base × Monster modify ratio + Monster modify value)
             × HardLevel ratio × Elite ratio
```

- HP：`HPBase`、`HPModifyRatio`、`HPModifyValue`、`HPRatio`、`EliteGroup.HPRatio`。
- ATK：对应 `Attack*` 字段和攻击倍率。
- DEF：对应 `Defence*` 字段和防御倍率。
- SPD：对应 `Speed*` 字段和速度倍率；缺少 Template `SpeedBase` 时明确为 unavailable。
- Stance：对应 `Stance*` 字段和倍率；最终 internal stance 精确除以 3 转为玩家韧性。非整除值不会静默四舍五入。

调查样本 `MonsterTemplateID=1002015`：canonical `1002015` 的 HP ratio 为 1；`100201501` 为 2；`100201506` 为 4 且 ATK ratio 为 `0.33333302`，同时 `StanceWeakList` 从 Fire/Lightning 变为 Fire/Quantum。说明 base 与具体 Monster modifier/weakness 确实分属不同层。

## 5. Effect Hit Investigation

当前“效果命中”来源已确认是：

```text
HardLevelGroup.StatusProbability
    -> resolveCanonicalEnemyStats().levels[].effectHit
    -> EnemyStatsPanel
```

没有发现固定百分比、Rank lookup、Monster special case 或外部数据库数值作为 production source。值按 level 直接读取；缺失 row 采用现有 parser 的不可用/0 边界，不在 Template fields 中伪造。

## 6. Bugs Found in Previous Model

1. 生成器以 Template 遍历，却只取 `MonsterID === MonsterTemplateID` 的一条 `MonsterConfig`，把 concrete record 当作完整 Template。
2. `StanceWeakList`、`DamageTypeResistance`、`DebuffResist`、`SkillList`、`SummonIDList` 实际属于 MonsterConfig，却被平铺在无法表达 provenance 的 Enemy 对象中。
3. calculator 原先只对 canonical Monster 暴露最终值，未表达 Template base 与 concrete modifier 的分层关系。
4. 效果命中过去容易被误读为敌人固定字段；本次确认其真实来源是 HardLevel 的 `StatusProbability`。
5. ID 长度/前缀规律虽然在本次全库样本中成立，但不能替代 `MonsterTemplateID` reference。

## 7. Compatibility Layer

当前 Enemy Detail 服务层按 `defaultMonsterId` 查找 canonical concrete Monster，并将它投影为现有 `EnemyDetailView` 的 stats、weakness、resistance、summon、skill 和 phase 字段。默认值的语义现在明确是 `defaultMonster`，而不是 `MonsterTemplate`。

下一阶段实现 Monster selector 后，可删除：

- Enemy 顶层兼容字段；
- `defaultMonsterId` 的默认选择逻辑；
- server 层对 default Monster 的 presentation projection。

## 8. Endgame Regression Verification

Baseline：

- `pnpm data:validate`
- Endgame generated files SHA-256：
  - `aa.json`: `0FACEE4D7F9BAD69814F26CBC83F7C65E49B2DE3615A94964214E4601B84C599`
  - `as.json`: `06051F46080EFCFBCB29C51D77176839475753B8A20DDD559783986A817CC6B1`
  - `moc.json`: `C09D11BE66F3B1543FE644A3516DBE01B1BB9E3890B89B3CB7201C430DE46B6D`
  - `pf.json`: `86F9ABA8FB8CF0B27055E140E1C98F9FA17695E18763D590D215BCDFF461349D`

重构后重新运行 `pnpm data:sync` 与 `pnpm data:validate`，四个 SHA-256 完全一致，Endgame generated output 无 diff。Endgame pipeline、schema、HP/stat 计算和 encounter mapping 未修改。

潜在 follow-up：Endgame 仍在自己的 pipeline 中直接消费 concrete `MonsterID`/`MonsterTemplateID`；本次刻意不将它迁移到 Enemy Detail 新模型。

## 9. Remaining UI Migration

本轮未实现、留待下一阶段：

- Monster selector / Variant cards；
- 每个 Monster 独立 detail panel；
- Monster-owned weakness/resistance UI；
- Monster-owned summon UI；
- Monster skill references / clickable anchors；
- full skill definition section；
- 新版 Enemy Detail layout、Enemy Overview、portrait family/representative；
- Endgame redesign 或计算纠正。

## 10. Verification Notes

- `pnpm data:sync`：通过。
- `pnpm data:validate`：通过（保留既有 TextMap 缺失文本警告）。
- Endgame hashes：与 baseline 一致。
- Prettier：本次改动文件已通过 `prettier --write`。
- `tsc --noEmit`：被仓库现有 SvelteKit 路由的隐式 `any` 错误阻断，错误集中在 `[category]` 与 `[endgame]` page server 文件，不由本次改动引入。
- Vitest：当前沙箱启动 Vite 时无法读取 workspace 外路径 `../../../..`，因此未能启动；需在允许完整 workspace 解析的环境运行既有 unit/e2e commands。
