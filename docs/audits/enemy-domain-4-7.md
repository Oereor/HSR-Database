# Enemy Domain 审计与实施记录

审计日期 2026-11-20。原始数据为锁定的 TurnBasedGameData `2c8a218502ebfccaf6e01675b0bdf6948d723bbb`，CHS 与 EN 各自从同一提交读取。此前的模型审计和 Variant 调查使用旧 pin，本报告重新以 raw ExcelOutput、Config 文件和两份 TextMap 为依据。实现契约见[本地化与数据生成架构](../architecture/localization-and-data-generation.md#enemy-template-and-monster)。

## 字段归属和关联

| 原始来源 | 字段与关系 | 公开数据用途 |
| --- | --- | --- |
| `MonsterTemplateConfig` | `MonsterTemplateID`、`MonsterName`、`Rank`、`HPBase`、`AttackBase`、`DefenceBase`、`SpeedBase`、`StanceBase`、`CriticalDamageBase`、`StatusResistanceBase`、`InitialDelayRatio` | 模板路由、Hero、基础面板、目录标题与 Rank。nanoka 仍以 TemplateID 查询现有图片映射。 |
| `MonsterConfig` | `MonsterID` 经显式 `MonsterTemplateID` 关联模板。拥有自身 `MonsterName`、`MonsterIntroduction`、`StanceWeakList`、`DamageTypeResistance`、`DebuffResist`、各属性修正、难度组引用及 `OverrideSkillParams` | 具体个体文案、等级属性、弱点、抗性和技能运行参数。 |
| `HardLevelGroup`、`EliteGroup` | 分别按 `(HardLevelGroup, Level)` 和 `EliteGroup` 联接。属性公式为 `(模板基础值 × 个体倍率 + 个体加值) × 等级倍率 × 精英倍率`。效果命中为 `StatusProbability`，效果抵抗为模板基础值加等级组的 `StatusResistance`。 | 个体的普通等级属性。模板缺少速度或韧性基础值时显示不可用。终局使用关卡等级组、精英组上下文与其现有修正规则。 |
| `MonsterConfig.SkillList`、`MonsterSkillConfig` | 通过 `SkillID` 关联定义。定义提供 `SkillName`、`SkillDesc`、语义标签、伤害属性、`PhaseList`、`ParamList` 与 ExtraEffect 引用。 | 各语言从可显示技能构建阶段。空阶段列表的技能可跨阶段显示。具体技能倍率等仍由所选 `(MonsterID, SkillID)` 的有效配置决定。 |
| Character Config、Ability、状态及效果表 | 模板 `JsonConfig` 关联 Character Config，再通过已验证的技能、Ability 和 BattleEvent 路径解析可展示数值。状态、额外效果、元素名分别关联 `MonsterStatusConfig`、`ExtraEffectConfig`、`DamageType`。 | 保留现有技能计算边界与双语文本。终局阶段 HP 使用 Character Config 的阶段与具体 Monster 的有效参数。 |
| `MonsterConfig.SummonIDList` | 先解析成目标 Monster，再从该记录取得显式 Template 外键。 | 卡片取目标个体的名称和弱点、目标模板的 Rank 和图片。链接附带具体 MonsterID。 |

模板的 `AIPath` 和 `AISkillSequence` 提供默认配置，具体记录包含 `OverrideAIPath`、`OverrideAISkillSequence`、`AbilityNameList` 和动态参数。该证据记录在审计范围内，详情页继续展示静态百科信息。 `MonsterGuide*` 和 `MonsterAtlasExtraPhase*` 存在独立引用和较小覆盖范围。模板分组字段在本轮继续作为上游元数据。

## 锁定版本证据

- 665 个 Template 包含 2,781 个 Monster。382 个 Template 有多个个体，`8002050` 有 76 个。所有 Template 都有同 ID 的可用个体。ID 规律可用于审计，联接以显式外键为准。
- 117 个 Template 具有不同名称哈希，171 条 Monster 的名称哈希有别于自身 Template。每种语言各有 113 个 Template 解析出多个具体名称。99 个 Template 有多个简介哈希，双语均解析为不同简介。模板名称全部可解析，Monster 名称各有一条缺少译文，简介各有一条缺少源字段。当前文本扫描未发现空白值。
- `100204004` 拥有名称哈希 `3332123519656733431`，在 CHS 和 EN 都未命中。Template `1002040` 的名称与该个体自身的简介均可解析。同语言模板名作为站点回退。该行为依据已验证的模板归属，游戏客户端的回退实现仍待证实。`5013090` 缺少 `MonsterIntroduction` 字段，保留自身名称。
- 按有序字段比较，6 个 Template 的技能列表不同。其中 `5013030` 存在真正的技能成员差异，`501303001` 少一个技能。另有 140 个 Template 的弱点不同，141 个伤害抗性不同，19 个负面效果抵抗不同，74 个召唤目标不同。HP 倍率、攻击倍率和速度加值分别在 301、124、141 个 Template 内变化。精英组在 21 个 Template 内变化。
- 63 个 Template 有 AI 路径覆盖差异，26 个有覆盖序列差异。`100202006` 给流浪者模板提供非空覆盖路径，`100301034` 提供不同的覆盖序列。2,644 条 Monster 的 `OverrideAIPath` 是显式空字符串。`8033013` 的模板 AI 和 Character Config 路径非空，但锁定 checkout 缺文件。
- 2,781 条 Monster 都引用有效的难度组，普通详情使用的 HardLevelGroup 都为 1。源表还包含供关卡使用的稀疏等级组。`800205073` 缺少防御倍率，沿用已验证的倍率 1 语义。`405301004` 的召唤列表含 `0` 占位，所有正数召唤和技能引用可解析。54 条 Monster 列表重复同一个召唤 ID。`401301805` 有 `PhaseList=[0]`，现有阶段规则只接纳正整数。
- 112 条 concrete 弱点与非零同元素抗性并存，旧审计只记录默认个体中的 13 条。现在保留和记录每条具体配置。部分模板还含 `SpeedModifyValue` 或 `StanceModifyValue`，这些与 Monster 的同名修正可独立出现。现有普通详情和终局公式使用 Monster 修正，当前资料不足以推导叠加模板同名字段的规则。

| `1002015` 下的记录 | CHS / EN 名称 | 自身简介 | 弱点 | 具体修正 |
| --- | --- | --- | --- | --- |
| `1002015` | 冰锋 / Ice Edge | 守护者创造的冰矛 | 火、雷 | 默认基础修正 |
| `100201501` | 冰锋（幻象） / Ice Edge (Illusion) | 冰矛及记忆幻影背景 | 火、雷 | HP 倍率 2 |
| `100201506` | 公司安保幻象 / IPC Security Personnel Illusion | 公司安保人员的身份和背景 | 火、量子 | HP 倍率 4，攻击倍率 0.33333302，速度加值 −44 |

两条派生记录共享技能列表与难度组。雷与量子在弱点和抗性中的配置同时发生变化。同源素材和技能列表并不决定个体文案。 `1004015` 的具体目标包含 `100201508` 与 `100201509`，它们属于同一 Template，均为有效引用。

## 实现前后

旧 Domain 将同 ID Monster 的简介提升到 Enemy，投影重复保存整个默认个体、共享技能和逐级属性。Hero、HTML 元描述和目录搜索共享了错误的简介归属。旧 EliteGroup 缺失分支按默认 Monster 重算整套属性。召唤的模板去重和目录／终局链接同时丢失了具体身份。

新中立 Domain 保留 Template 与 Monster 各自的 TextRef 和原始关联。缺失、未命中和空白名称按各自原因诊断，展示使用同语言模板名。畸形哈希引用报错，缺失简介从公开数据省略。难度组引用错误按具体记录报错。manifest 71 的详情直接保存模板、默认 MonsterID、个体列表和共享属性／技能表。服务端只补充资源和本地化链接。

选择器显示具体名称与 ID，将选中个体写入 `?monster=`。查询驱动文案、属性、抗性、技能和召唤，模板路由与立绘延续现有协议。目录每个模板一张卡片，弱点取默认个体。目录和全局搜索收录具体名称和精确 ID。仅匹配具体名称时以唯一最佳命中定位，召唤和终局链接始终带来源中的 MonsterID。

终局现有生成管线处理了 27,915 条阶段出场记录，其中 1,807 条为非同 ID Monster。当前版本终局出场的 EN 名称恰好与模板名称一致，保留具体名称联接可以覆盖未来数据差异。终局的数值计算、波次、出场 locator、以 Template 聚合的搜索目标均沿用原路径。

## 验收记录

以 Node 24.19.0 和 pnpm 11.9.0 对同一 pin 生成改造前后产物。两种语言各 2,781 条 Monster 的七项属性序列、技能内容与具体数值绑定、阶段引用全部一致。四种终局 dataset 在排除名称字段后逐结构比较一致。

| 详情 JSON 原始字节数 | 改造前 | 改造后 |
| --- | ---: | ---: |
| zh-CN | 136,970,582 | 18,584,855 |
| en | 137,488,547 | 18,930,856 |

最终验收使用相邻的锁定输入。

| 检查 | 结果 |
| --- | --- |
| `pnpm data:sync` | 通过，生成 665 份每语言敌方详情。 |
| `pnpm data:validate:full` | 通过，2,845 个产物、1,132 条 locale-neutral 路由和 195 个英文终局 shard。保留 115 条 CHS 缺失 TextHash 记录和 112 条具体弱点／抗性同行诊断。 |
| `pnpm check`、定向 Prettier 与 ESLint | 通过，Svelte 零错误、零警告。 |
| 定向 Vitest | 24 个文件，330 项通过。 |
| `pnpm build` | 通过，adapter-static 完成输出。 |
| Playwright | 桌面与移动模拟共 31 项通过，1 项按既有响应式用例设置跳过。覆盖 Variant 检索、键盘与历史导航、语言切换、长列表、召唤、目录、全局搜索和终局深链。 |

标准 Playwright 运行缺少其配置所需的 Chromium 1234。本次用本机已安装的 Chromium 1243 在同一生产构建上执行正文所列测试。两份上游 checkout 保持原提交和干净状态。
