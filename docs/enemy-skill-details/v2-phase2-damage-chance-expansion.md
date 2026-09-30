# Enemy Skill Details V2 Phase 2：结构化伤害与基础概率扩展

> 历史阶段记录：本文描述实施当时的模型与结论，不是当前实现规范。当前契约以 [规范架构文档](../architecture/localization-and-data-generation.md)、[V2 Phase 4 倍率候选报告](v2-phase4-multiplier-candidates-cleanup.md) 和 [UI Round 1 报告](ui-round1-information-hierarchy.md) 为准；历史测试、覆盖和文案记录不代表当前状态。

实施日期：2026-09-29。网站 `develop`，只读上游 `TurnBasedGameData` `6b2bc17ebf46`。倍率和基础概率均为配置事实，不代表最终伤害或最终命中率。

## 1. Summary

先完成并验证 Damage 检查点，再实现 Chance 检查点。`EnemySkillDetailDomain`、具体 Monster–Skill binding、共享 Skill 定义、官方描述和 Skill Browser 联接方式保持不变。新事实仍只包含 `damage`、`applications` 和 `actionShifts`。

## 2. Checkpoint A — Damage

生产解析不再用 `VERIFIED_DAMAGE_SKILLS` 授权输出。解析器从已联接 Ability 中查找全部 `DamageByAttackProperty`，只把同一 Ability 的顶层 `OnStart` 任务认作本阶段的线性路径。对同一角色的多击用 `addDecimals` 精确求和；主目标、相邻目标和其他已支持角色分别处理。横扫的左右位与中心位只有在三者同值、同 Ability 且均为顶层任务时才折为 `each-swept`。`totals` 使用十进制比较去重和数值排序。

同一角色出现嵌套／条件伤害、跨 Ability 伤害、不支持的值或执行干扰时，省略该角色；未知目标可能与任意角色重叠，因此整项伤害省略。执行到末次伤害之前的重定向、运行时改值、循环或提前结束也会阻断输出。诊断原因只通过构建期回调提供，不进入生成数据。

旧 14 个已审核 Skill ID 已转成回归矩阵：12 个仍有可证明的伤害；`100203003` 因条件伤害、`406401201` 因同一目标跨 Phase Ability 而被明确省略。`201201002` 的死亡触发与 `406401207` 的标记目标仍使用各自已有的窄范围语义规则，并有回归断言；它们不是通用 ID 兜底。

## 3. Damage coverage

以下前后数字均按中文生成数据的去重 `(MonsterID, SkillID)` binding 统计，范围固定为 11,645 个页面可达 binding；唯一 Skill ID 也在同一范围内去重。

| 指标 | Phase 1 → 本阶段 |
| --- | ---: |
| 有伤害的 binding | 227 → 2,461 |
| 有伤害的唯一 Skill ID | 14 → 516 |

完整构建期 domain 包含 2,501 个伤害 binding、526 个唯一 Skill ID。其诊断事件计数为：无支持任务 4,868、条件路径 980、跨 Ability 131、非线性 52、值未解析 423、目标不支持 831、运行时改值／重定向 322。计数是原因事件，不是互斥的 binding 数；覆盖增长本身不构成正确性证明。

## 4. Damage examples

| Monster / Skill | 结果 |
| --- | --- |
| `1022010/102201001` | 主目标总倍率 `3`，行动延后 `0.5` |
| `4035010/403501001` 与 `403501001/403501001` | 具体参数分别得到 `4.5`、`4` |
| `1002030/100203001` | 主目标 `1.3`、相邻目标 `1`，不跨角色求和 |
| `2004010/200401002` | 同一 `OnStart` 主目标三击总 `9`、相邻目标 `2` |
| `4064012/406401205` | 同一 `OnStart` 全体三击总 `10.5` |
| `4064012/406401204` | Phase02/Phase03 关系未证，继续省略 |

`100201101`、`100202001`、`100204101`、`100301001` 也作为此前被 ID 门槛阻断的直接伤害正例。`401301004` 和 `401401207/208` 未得到推测性倍率。

## 5. Checkpoint A validation

在改动 Chance 前，定向解析／投影／格式测试 40 项通过；`data:sync`、`data:validate:full`、脚本 TypeScript 检查通过。抽查中英文生成 JSON，确认具体 Monster 参数、同一路径总值与反例省略。数据校验沿用既有 TextMap 缺项和弱点／抗性提示，最终仍通过。

## 6. Checkpoint B — Chance

过去的 `AddModifier.Chance` 只有在 `ModifierName` 唯一映射到 Status ID 后才保留。现在安全可解的配置概率可独立存在；有唯一 ID 时保留 ID 供投影本地化，没有 ID 时只输出数值和可支持的目标角色。原始 `ModifierName` 只参与构建期去重，绝不写入产品数据。

构建期先按 modifier 与目标区分应用：同一应用存在未解或冲突概率时省略；相同状态在不同目标上分别保留；无身份、同角色、同值的事实合并。无身份且同角色有不同概率时省略无法说明归属的数值。视图对多个相同概率只显示一个基础概率；多个不同概率仅在本地化状态名或独立目标角色足以区分时显示。自身目标不单独呈现目标标签。行动变化提取未修改。

## 7. Kafka examples

- `2004010/200401001`：无 Status ID 的 `MCommon_DOT_Electric.Chance=1` 输出基础概率 100%；`AQAAAAQR` 伤害仍未解析，伤害行缺席。
- `2004010/200401004`：无 Status ID 的 `MCommon_MindControl.Chance=1.2` 输出基础概率 120%，原有行动提前 `1` 继续显示为 100%。

## 8. Chance coverage

同第 3 节的页面可达 binding 口径：

| 指标 | Phase 1 → 本阶段 |
| --- | ---: |
| 有基础概率的 binding | 476 → 1,278 |
| 有基础概率的唯一 Skill ID | 92 → 218 |
| application 数 | 529 → 1,441 |

本阶段生成的 1,441 条 application 中，863 条无 Status ID，578 条有 ID。完整构建期 domain 为 1,325 个概率 binding、232 个唯一 Skill ID、1,522 条 application，其中无 ID 865、有 ID 657。Chance 诊断事件：值未解析 69、目标不支持 1,325、应用归属有歧义 6；事件可以同属一个 binding。

## 9. Projection/UI impact

投影继续按可选 Status ID 本地化名称；无 ID 时保留纯数值。Skill Browser 仅调整 application 行的分组和歧义省略。伤害总值继续使用现有倍率行；官方描述、技能类型、元素、`SkillExtraEffects`、阶段选择及 `getEnemySkillsForMonster(...)` 保持原路径。没有恢复状态类别、期限、技能召唤或 DoT 详情。

## 10. Payload impact

字节数为 UTF-8；“生成”指 `src/lib/generated/views/<locale>/details/enemies/<id>.json`，“页面”指服务端图片／链接补充前的 `JSON.stringify(buildEnemyDetailPageData(rich))`。Phase 1 基线由 Git 中原解析器临时重新生成并测量，随后恢复本阶段源码和生成数据。

| Locale | Enemy | 生成前 → 后 | 页面前 → 后 |
| --- | --- | ---: | ---: |
| zh-CN | `1002030` | 1,013,814 → 1,010,256 | 143,436 → 140,015 |
| en | `1002030` | 1,014,745 → 1,011,187 | 144,121 → 140,700 |
| zh-CN | Kafka `2004010` | 560,784 → 566,230 | 91,343 → 96,400 |
| en | Kafka `2004010` | 561,045 → 566,491 | 92,050 → 97,107 |
| zh-CN | `4035010` | 131,131 → 131,836 | 25,814 → 26,284 |
| en | `4035010` | 131,573 → 132,278 | 26,187 → 26,657 |
| zh-CN | `4064012` | 272,258 → 272,240 | 35,505 → 35,488 |
| en | `4064012` | 276,047 → 276,029 | 36,872 → 36,855 |

样本没有引入完整 Ability 原始数据或大量重复负载。

## 11. Deferred work

本阶段不支持 `AQAAAAQR`、其他复杂表达式、备选分支总值、循环／Bounce 聚合或新目标别名。仍不提取期限、技能级召唤、DoT、韧性或最终状态命中率。

## 12. Final validation

使用 Node 24.19.0、pnpm 11.9.0。最终定向 Vitest 3 文件 47 项通过；`pnpm data:sync`、`pnpm data:validate:full`、`pnpm check`、定向 Prettier／ESLint 和 `pnpm build` 通过。中英文生成 JSON 及静态敌人页面 HTML 抽查确认 Kafka 100%、`4035010` 450%、`1022010` 300% 与 50% 均出现；生成详情没有原始 modifier、期限、技能召唤、Bounce、DoT 或诊断字段。

Enemy Detail Playwright 的桌面／移动端 30 项并发运行在浏览器执行阶段停滞；随后单项、单 worker、零重试运行也停滞，均无可用测试结论，已停止该验证路径。浏览器交互仍需在可正常运行 Playwright 的环境中复核，重点是 Kafka 技能切换、共同概率折叠、Monster 变体切换和 `406401204/205` 的正反例。独立 `agent-browser` 命令在本机不可用。

## 13. Next recommended phase

下一个最小任务是用多个正反例验证并有限支持 `AQAAAAQR` 的运算语义，再评估 Kafka `200401001` 的两击总倍率；不要顺带放宽分支、循环或目标别名规则。
