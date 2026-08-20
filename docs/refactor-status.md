# 重构状态

## 第一次重构

- 使用 `lossless-json` 和 branded `TextHash` 无损保存 64 位文本 Hash。
- 网站限定为简体中文，所有游戏文本统一从 `TextMap/TextMapCHS.json` 经共享 resolver 抽取。
- 分离直接 Hash 与符号文本键，恢复行迹和星魂中此前被错误标记为缺失的文本。
- 七种属性颜色收敛到唯一映射，上游 `Thunder` 规范化为 `Lightning`。
- 角色技能和光锥叠影使用真实等级、`ParamList`、语义 token 与统一动态值颜色。
- 缺失文本建立 A/B/C/D 构建期审计，D 类非零会使验证失败。

## 第二次重构

- 生成数据升级为 schema 5，只保留角色、光锥、遗器和敌人。材料、普通物品、养成成本、敌人掉落及其页面、搜索和关联全部移除。
- `MultiplePathAvatarConfig` 成为特殊角色显示名的事实来源：开拓者按命途显示，三月七显示为“存护/巡猎”两个形态；普通角色名称不变。
- 角色技能重构为 `SkillCategory → SkillCard → SkillVariant`。类别来自结构字段，同一角色每个类别最多一张卡片。
- `AvatarSkillTreeConfig.PointID + LevelUpSkillID` 决定变体共享 progression。丹恒·饮月的四个普攻和大黑塔的两个战技分别共享一张卡片与等级控制。
- 通过 `PointType=4` 与 `AvatarServantConfig.SkillIDList` 的真实交集，将 6 个忆灵配置连接到 7 个记忆角色形态；忆灵技和忆灵天赋进入统一技能管线，对应升级节点不再重复显示为行迹。
- 当前 4.4 数据真实存在 `ElationDamage` 和 `Assist`，因此额外保留“欢愉技”和“助战技”语义类别；`MazeNormal` 场景普通攻击不生成资料卡。
- 技能默认等级调整为：普攻/忆灵技/忆灵天赋 Lv.6，其他可升级能力 Lv.10，固定能力 Lv.1；真实最大等级不变。光锥叠影默认 Lv.1。
- 角色和光锥加入 Lv.1–80 基础属性计算。公式为 `Base + Add × (level - 1)`，边界等级采用可达到该等级的最高已突破阶段，默认 Lv.80。
- 总览分页改为响应 SvelteKit URL 状态；筛选、排序和页码客户端导航后立即重新计算，改变筛选会回到第一页。
- 最终静态构建包含 1,901 个文件、53,592,752 字节；领域生成数据收敛为 934 个文件、11,894,836 字节，简中搜索资源为 117,911 字节。

## 第二次重构后的定向修复

- 生成数据升级为 schema 9。角色能量由 `AvatarUltraSkillConfig`、`GridFightFrontSpecialSP` 和 `SPNeed` 结构化生成；六名特殊能量角色使用显式领域类型，旧版银狼保持普通能量。
- 角色与光锥基础属性在 UI 边界四舍五入为整数；角色面板将速度和能量作为并列卡片展示。四类详情页统一收敛主标题、章节标题和垂直间距。
- 生成语义升级为 schema 7。20 个无描述、且由共享 progression 或 `SkillTag + SkillIcon` 证明属于公开技能内部实现的 Variant 不再进入页面。
- 遐蝶的隐藏重复技能 `1140712` 经过 `HideInUI`、共享 `SkillTag + SkillIcon` 和公开天赋 `1140706` 的结构校验后退出忆灵技卡片；“灼掠幽墟的晦翼”只在忆灵天赋中展示。
- `PointType=1` 的 1,010 条属性强化行迹全部由 `StatusAddList` 与 `AvatarPropertyConfig.PropertyNameSkillTree` 恢复官方属性数值描述；原始空字段仍保留在审计中。
- 普通游戏文本统一恢复字面量 `\\n`，并通过安全 token renderer 支持 `<color>`、`<i>`、`<unbreak>`；未知标签不执行，内部文本保留。
- `AvatarConfigEnhanced` 中的 10 名角色拆分为完整 `base/enhanced` Profile，能量、技能、行迹与星魂统一切换。行迹依 `EnhancedID` 严格分区，修复了两套行迹曾被同时展示的问题；默认显示加强后，`?enhanced=0` 保持加强前状态。

## 第三次重构

- 全局搜索与分类目录搜索改为 draft/committed query 语义。输入不再执行搜索或重置分页；只有“搜索”按钮或 Enter 会提交关键词。
- 生成数据升级为 schema 10。每个最终展示的 Skill Variant 从 `BPNeed/BPAdd`、`SkillNeed`、`SPBase`、`StanceDamageDisplay` 和 `SkillEffect` 获得独立战斗元数据。
- `BPNeed <= 0` 不解释为战技点生成，战技点生成只来自正 `BPAdd`。`SkillNeed` 与正 `BPNeed` 可同时生成“技能消耗”和“战技点”两行。
- 技能类型使用紧凑 tag；特殊资源、战技点、能量恢复和削韧值使用独立带标签信息行，缺失项不展示占位。

## 第四次重构

- StarRailRes 作为独立只读视觉资源源接入；角色总览只按 AvatarID 同步当前需要的 128×128 头像，不读取其 index 文件或复制完整资源仓库。
- 视觉资源通过独立 schema 1 manifest、commit 检查和缓存进入静态目录；缺图或上游暂不可用时使用中性占位，不生成破图请求。
- 建立有限的语义字体、文字层级、间距、边框、圆角和表面 token，提高中文正文、辅助文字与关键 metadata 对比度。
- 角色卡片加入头像并强化“头像与名称 → 稀有度/命途/属性 → 简介 → ID”层级，保留原有响应式信息密度。
- 技能继续使用桌面双列等高、移动端单列；战斗 metadata 继续使用纵向 key-value，并使用 tabular numbers 对齐数值。
- 行迹保持三列卡片分组，只增强额外能力正文、解锁条件和紧凑属性数值的视觉层级。

## Phase 4.1：视觉资源与角色详情增强

- `StarRailRes` 仍只作为只读视觉源；视觉 manifest 升级为 schema 2，只按当前目录同步角色头像、角色立绘、七属性图标和九命途图标。
- 头像保留 128px PNG；立绘从原始 2048px PNG 生成最大 960px 的透明 WebP；属性与命途图标生成 64px PNG。所有生成物均 gitignore。
- 角色目录的命途和属性保留简中名称并增加装饰图标；角色详情在桌面加入独立右侧立绘和向左渐隐，820px 以下隐藏，缺图或加载失败时恢复原有无图布局。
- 浏览器只使用统一 generated-asset URL helper，不读取 sibling 仓库、StarRailRes index 或业务数据。
- 未来构建机可单独取得 StarRailRes 并设置 `HSR_ASSET_ROOT` 后运行 `assets:sync`；建议 shallow/partial/sparse checkout，本阶段不绑定任何部署平台且不自动联网 clone。

## Refactor 08 Phase 03：Character / Enemy Overview

- 新增 domain-agnostic `EntityOverviewCard`，Character 与 Enemy wrapper 分别解释稀有度/命途/属性和 Rank/默认 Monster 弱点；Light Cone 与 Relic 暂时继续使用 legacy card。
- 视觉 manifest 升级为 schema 3。Character Overview 按 `index_new/cn/characters.json.preview` selective sync 91 张原始 PNG 到 `characters/preview`；Character Detail 的 WebP portrait 保持不变，旧 avatar 输出和 resolver 已移除。
- Enemy Overview 复用现有 generated-enemy-assets 本地 manifest/cache，服务端一次性注入 TemplateID 对应 URL；缺图使用共享 fallback，浏览器不包含 nanoka 远程 URL。
- Character/Enemy 卡片统一为约 184px 横向 artwork、主题 token 渐隐与双列/双列/单列响应式布局；不显示简介。Enemy raw Rank 仍保留，Overview 映射为普通、精英、首领三类并兼容旧筛选参数。
- 后续 Light Cone 可复用 `index_new/cn/light_cones.json.preview` 与 `image/light_cone_preview`，Relic Set 可复用 `index_new/cn/relic_sets.json.icon` 与 `icon/relic`；两者只需扩展现有 manifest/sync 并新增领域 wrapper，不需要修改共享 presentation primitive。

## 第五次重构：Endgame 数据管线

- 生成数据升级为 schema 16，并在构建期独立生成 MoC、PF、AS、AA 四类 encounter-centric 数据；schema 15 的 common HP、PF wave modifier、单精度等级倍率及 Rank 取整语义保持不变。
- Enemy Detail v1 已从通用详情布局分离：canonical 配置预生成 Lv.1–100 七项属性，页面按 Hero、基础属性、弱点与抗性、特殊状态抗性、召唤单位、技能的固定顺序展示。原“出现关卡”字段/UI 和 Hero 内部 Rank 已移除。
- 敌人技能现保留稳定 kind/tag、声明式元素、PhaseList 与 ExtraEffect，召唤关系按 MonsterID 解析到 canonical 模板；构建期专属 audit 诊断所有未知或未解析关系，AI 与技能机制参数不进入浏览器数据。
- battle slot 支持多个有序 Stage 与 Tierce 第三队；fixed formation 和 spawn sequence 使用判别联合，PF/AA 的重复实际 MonsterID 不去重。
- occurrence 分别保存 MonsterID、MonsterTemplateID 和关卡上下文，使用四个无损十进制因子精确计算单条配置 MaxHP。
- AA preview MonsterID 只用于审计，实际 spawn MonsterID 决定变体、模板和 HP。
- phase、召唤、共享生命与 HP 操作只生成保守机制标记；最终整数化、复杂 Boss 伤害需求和运行时刷怪逻辑仍不推测。
- 当前共生成 108 个 Group、823 个 Encounter、1,858 个 Stage 和 24,374 个 occurrence；核心关联错误为 0，历史 MoC 显式 Elite fallback 为 5,272 条。

## 第七次重构第二阶段：Enemy Phase Tabs 与 Variant 调查

- 业务数据升级为 schema 19；敌方保留唯一有序技能列表，并新增由 `MonsterSkillConfig.PhaseList` 规范化的 `skillPhases`。阶段编号不重排，空 PhaseList 技能属于所有已知阶段，过滤后空阶段仍保留。角色技能、行迹与星魂描述保留下划线语义，行迹与星魂复用共享 ExtraEffect 模型。
- 多阶段敌方详情使用可访问 tabs 展示各阶段技能；单阶段保持直接列表，技能卡不再重复显示“适用阶段”。
- Enemy Family / Variant 仅完成全库调查和报告，未实现聚合、代表选择、URL、搜索、overview 或 Endgame identity 变化。

## 第五次重构：Endgame UI

- 新增独立 `/endgame` 顶级功能区以及按 mode/group 静态预渲染的 108 个赛期页面；Enemy 百科继续回答模板资料，Endgame 页面只回答具体赛期中的实际敌方实例。
- server-only adapter 只向页面序列化单个赛期的展示模型，并按 MonsterTemplateID 关联现有百科弱点；完整 mode JSON、Config 与 spawn sequence 不进入客户端 bundle。
- MoC 固定阵容保留重复数量；PF 每个 wave 只显示唯一 occurrence 类型，去重 identity 包含实际 MonsterID、HP/Elite 上下文和机制，不会折叠同模板的不同变体。
- HP 从精确 DecimalString 直接四舍五入为带千分位的完整整数，不使用 K/M/B。多阶段固定显示为“单条生命值 × 阶段数”，不生成未经验证的总生命值；生命值与韧性的详细机制 disclosure 已移除以保持卡片排版简洁。
- 弱点复用 canonical 七属性颜色、现有属性图标 resolver 和简中名称。185 个 Endgame 模板均可链接百科，9 个无弱点模板使用明确降级；敌人立绘存在本地映射时展示，缺失时使用无请求的中性占位。
- AS 使用 Boss 导向的 occurrence 卡片但不猜测唯一主 Boss；AA 分离骑士、普通王棋和绝境王棋，并始终使用实际 spawn MonsterID 而不是 preview ID。
- enemy occurrence 进一步保存当前关卡上下文中的精确速度、resolved internal stance 和玩家侧单管韧性：先应用实例 ratio/value、HardLevel 与 Elite ratio，再对完整内部值执行固定 3:1 单位转换；所有乘加与转换均不经过 JS 浮点。
- 共享敌人卡片改为纵向海报布局，通过 server-only manifest 按 MonsterTemplateID 使用本地 WebP。缺图不发出请求，AS 使用重点密度、MoC/AA 使用标准密度、PF 使用紧凑密度。
- `StanceCount` 仅作为静态配置管数，不参与单位换算或与 HP 阶段数混用；能力扫描仍保留构建期机制元数据，但不实现战斗解释器。

## 行迹卡片分组与类型标签

- 生成数据升级为 schema 11。可展示行迹只保留真实单级的 `PointType=1/3/5`，分别规范化为属性加成与额外能力，不再向浏览器暴露无意义的 `Lv.1`。
- `PrePoint` 的 860 条有效关系生成同 Profile 有向森林，`AnchorType` 用于稳定排序；验证器拒绝断链、自引用、循环和未经审计的 Type 5。
- 角色详情使用三列卡片列表：额外能力以较大卡片直接展示晋阶条件和完整描述，属性加成以同宽紧凑卡片列于所属能力下方，独立属性进入底部三列区域；移动端按能力分组单列堆叠。
- 归属只沿属性节点自己的 `PrePoint` 链正向追溯，不反向解释能力对属性的依赖。101 套 Profile 当前为 785 个能力所属属性节点和 225 个独立节点。男女记忆开拓者各有 `2/2/3` 个属性归入前三项能力、3 个独立属性；“未完的尾声”作为 `PointType=5` 第四项能力通栏展示。

## 数据源与审计状态

- 上游：`648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7`，版本标记 `OSPRODWin4.4.0_D15909703_A15802547_L15874300`。
- 实体：91 角色、165 光锥、60 遗器套装、613 敌人模板；简中搜索索引 929 条。
- 当前缺失审计：A 6,557、B 25、C 244、D 0。
  - A：真实空字段或 CHS 缺失，包括 235 条角色技能和 20 条忆灵技能空描述。
  - B：15 条角色技能和 10 条忆灵技能描述含尚未表达语义的 `<icon>`。
  - C：当前浏览器消费域为 0；Enemy appearance 关系已退出生成模型。
  - D：当前程序级错误为 0。
- `TextMapMainCHS.json` 的 1,116 个键全部包含在 CHS 中，不是运行依赖或 fallback。
- 浏览器只读取轻量生成数据，不加载上游 Config 或完整 TextMap。
- 上游没有 LICENSE 或 NOTICE；生成数据不提交，公开部署前仍需确认再分发授权。

## 后续候选

1. 收紧同步器和 `DetailPage.svelte` 中剩余的关键 `any`。
2. 继续评估是否需要复刻游戏内更精确的 AnchorType 空间坐标；当前实现优先表达真实依赖关系与可访问性。
3. 若未来重新引入百科 appearance，再独立调查 StageConfig 中未连接的敌人变体；当前不属于产品消费域。
4. 为真实 `<icon>` 标记建立可访问文字语义。
5. 持续检查静态详情数量、构建体积和 CI 时间。
6. 评估 Skill、Trace、Eidolon、光锥和敌人视觉资源；Phase 4.1 明确不接入这些类别。
