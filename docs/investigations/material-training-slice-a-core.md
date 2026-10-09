# 养成系统 Slice A：数据与计算核心

实施日期：2026-10-09（Asia/Shanghai）。本报告描述可调用的工程产物与实际验证，不宣称已上线页面功能。

## 1. Executive Summary

Slice A 已完成：有限 Material Domain、角色/光锥 Cost Domain、纯费用计算、技能预览与计费等级分离、canonical 共享升级、完整 PrePoint DAG、目标状态转换、静态分片 loader，以及生成/资产/部署源依赖和独立验证均已接通。现有详情页组件、路由、样式、属性计算及真实玩家解析未修改。建议人工验收后进入 Slice B。

当前输出覆盖 98 个角色形态、108 套 Profile、170 个光锥、1,970 个 SkillTree 节点和 140 个材料。所有数字都是 pinned 数据的实测值，不作为永久硬编码契约。角色、光锥 EXP 和晋阶成本与研究报告一致；三月七完整技能树、特殊付费链和姬子·启行共享节点回归通过。

## 2. 数据版本与边界

- 工作分支：`HSR-Database/develop`；开始时网站与两份上游工作区均干净。
- TurnBasedGameData：`724b139d8c9c32d12552eb95745a4fee72bfe48b`，`OSPRODWin4.6.0_D16707949_A16704710_L16700845`。
- StarRailRes：`dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。
- 两份 HEAD 与 `upstream.lock.json` 一致，均保持只读。未联网、安装依赖、commit、push 或部署。
- 使用已安装 Node 24.19.0 与 pnpm 11.9.0。默认 shell 的 Node 26 未作为验证运行时。
- 已阅读上游 README、StarRailRes AGPL-3.0 LICENSE，并沿用项目现有第三方资源声明。图片只进入已有忽略的生成资产目录。

## 3. Material Domain

生产抽取入口：`scripts/data/domain/training.ts` 的 `buildTrainingDomain(tables, characterDomains)`。

实际 PromotionCostList、MaterialList 的 134 个引用 ID，加 AvatarExpItemConfig 和 EquipmentExpItemConfig 的六个经验道具，形成当前 140 个核心资源。仅读取对应 ItemConfig 记录；不创建普通物品集合、敌人掉落关系或 Item 详情加载器。

`MaterialDomain` 保存 `id/mainType/subType/rarity/iconKey/nameSource`；TextHash 仍为无损十进制字符串或既有 symbolic 引用。`projectMaterials(materials, locale, resolver)` 使用共享 TextResolver 生成 `MaterialCatalog { schemaVersion: 1, locale, materials }`，其中材料名称为该 locale 的 TextMap 投影，无跨语言 fallback。描述和背景文本不纳入本轮产物。

名称、元数据和图标需求按 ItemID 连接。保留上游 Rarity 枚举；星级展示映射留给 Slice B。140/140 材料有中英文名、原始图标路径及真实 ID 图标。

资产沿用 bounded pools、暂存校验、原子发布和 fingerprint。只生成请求的 `icon/item/{ItemID}.png`，输出透明背景兼容的 128×128 PNG。`resolveMaterialIconAsset(itemId, manifest?)` 返回 `/generated-assets/materials/icons/{itemId}.png` 或 `undefined`，缺图不会生成错误 URL。视觉 manifest 从 16 升至 17。

## 4. Character / Light Cone Cost Domain

类型位于 `src/lib/domain/training/types.ts`，纯函数统一由 `src/lib/domain/training/index.ts` 导出。

- `Cost = Record<ItemId, number>`，ItemId 为十进制字符串；`mergeCosts(...costs)` 去重聚合、丢弃零项，并拒绝负数、小数、非法 ID 和安全整数溢出。
- `CharacterTrainingData` 保存 AvatarID、ExpGroup、原始 PromotionCostStage[] 与独立 CharacterTrainingProfile[]。
- `LightConeTrainingData` 保存 EquipmentID、ExpType 分组及晋阶链。
- `TrainingSharedData` 保存共享逐级 EXP、MaterialIdentity、经验道具提供量、光锥道具 CoinCost 和角色经验信用点除数。
- `TrainingNode` 保存 canonical key、PointID、PointType、kind、DefaultUnlock、MaxLevel、全部 PrePoint、LevelUpSkillID、公开技能 bindings 以及逐级 requiredPromotion/cost。steps 本身保留源节点等级关联，不保存原始整条 SkillTree 配置。
- 节点按真实形状分为 `skill/trace/default/fixed`；默认多级付费链、非默认单级付费行迹、免费默认节点和免费非默认固定节点分开处理。未知形状明确拒绝，不根据角色 ID 套模板。

所有结果含 Required EXP、promotionCost、skillCost、traceCost、totalKnownCost、原始步骤来源和 precision。技能/行迹用 canonical key + level 解释费用，晋阶用 promotion 解释出发阶段。经验道具数量不进入 Cost。

## 5. EXP 与晋阶规则

`derivePromotion(chain, level)` 按升序原始 MaxLevel 选第一个能容纳目标等级的阶段。Lv.1/20/21/30/31/70/71/80 分别为 0/0/1/1/2/5/6/6。校验阶段从 0 连续、MaxLevel 严格递增、终点无下一阶段费用，非法等级直接拒绝。

`requiredExp(exp, level)` 累加 level 1…L−1。序列数组下标 0 对应 Lv.1→2；只序列化公开最高等级之前的增量，不因为角色经验表还有 81–100 就开放 Lv.100。

晋阶费用累加 stage 0…p−1；阶段 p 是到达状态，不再计入支付记录。信用点 ItemID=2 与其他材料按同一映射聚合。

| 基准 | 实测结果 |
| --- | --- |
| 角色 Lv.1→80 EXP | 5,797,920 |
| 三星 / 四星 / 五星光锥 EXP | 597,440 / 796,590 / 995,700 |
| 三月七 0→6 晋阶 | 2×246,400；110403×50；111011×12；111012×13；111013×12 |
| 希儿 0→6 晋阶 | 2×308,000；110406×65；111011/111012/111013 各15 |
| 光锥 20000 / 21000 / 23000 晋阶信用点 | 231,000 / 308,000 / 385,000 |

角色经验道具 EXP=1,000/5,000/20,000；光锥经验道具 EXP=500/2,000/6,000，CoinCost=250/1,000/3,000。角色配置除数为 10。这些参数被保留，但仅给定目标等级不确定投入组合与实际经验信用点。`precision.expItemConsumption` 与 `expCreditCost` 明确为 `unresolved`；totalKnownCost 不加入 EXP/10、EXP/2 或经验道具取整假设。

## 6. 技能付费与晋阶约束

`resolveSkillTraining(node, displayLevel, promotion)` 不修改输入，返回 displayLevel、paidMaxLevel、requiredPromotion、trainingLevel 与 `paid-max/promotion` 原因码。

Training Level = min(Display Level, Paid Max, 当前晋阶允许的最高付费等级)。费用只求和 steps Level 2…Training Level。要求提示读取 min(Display Level, Paid Max) 对应步骤的晋阶要求，预览超上限也不会虚构晋阶 7。

Display Level 必须存在于同一 canonical 节点的所有公开 bindings 等级集合中；各成员的原始集合均保留供下一阶段使用。当前审计没有不同公开预览等级集合的共享节点。隐藏 SkillID 保留为关联事实，但不参与公开范围，不创建额外目标。

姬子·启行 Display=12 在晋阶6时 Training=10、要求晋阶6；在晋阶4时 Training=6；再次提高晋阶后恢复10，Display始终12。星魂免费增级未参与计算。

三月七战技 `1001002` Lv.1→10：2×522,000；241×1；110141×2；110142×12；110143×23；110501×3；111011×6；111012×10；111013×5。

三月七技能信用点1,758,000，10个属性和3个额外能力信用点642,000，完整技能树信用点2,400,000。其完整技能树材料：241×5；110141×12；110142×54；110143×105；110501×12；111011×28；111012×42；111013×42。加晋阶后 totalKnownCost 信用点2,646,400。

遐蝶两个忆灵节点合计403,000信用点；记忆开拓者两个忆灵节点合计322,400；欢愉开拓者 `8009420` 为416,000。完整遐蝶和记忆开拓者技能树分别为3,000,000和2,400,000信用点。所有费用来自各自表行。

## 7. 全量共享 progression 审计

`progressionKey(avatarId, enhancedId, pointId)` 生成 `AvatarID:EnhancedID:PointID`。`resolveSkillProgression(profile, skillId, source='avatar')` 只解析现有公开技能；忆灵使用 `source='memosprite'`。

全量108套Profile：67个Point连接多个SkillID；唯一跨公开Skill Category的节点为 `1510:0:1510004`。未发现公开成员预览等级集合差异或没有明确配置依据的特殊收费归属。PointType=4 的忆灵/欢愉区别复用现有配置分类和 servant 关系；global-buff 无升级节点，不额外收费。所有Profile的拓扑和材料引用均闭合。

丹恒·饮月 `1213001` 的四种公开普攻只消耗一条1→6费用链，信用点240,000。大黑塔 `1401` 的普通/强化战技共享同一节点。加强角色的base/enhanced canonical key互不相同，单个目标只计算选定Profile；希儿两Profile结果相等，但不会相加，也不推断历史状态迁移规则。

完整67个共享节点明细见附录；机器可读成员、等级集合与169个共享前置关系位于 `data/audit/latest.json.trainingAudit`（本地生成审计，不提交）。

## 8. 姬子·启行专项

`151004`（talent）和 `151022`（assist）都解析到 `1510:0:1510004`。绑定成员的预览等级为1–15，付费MaxLevel=10，完整费用链信用点652,500。两个技能以同一key读写Display Level，即可由Slice B同步滑块，无需合并卡片。

`151025/151026` 保留在 linkedSkillIds，但不进入bindings；公开解析函数拒绝它们。费用仅来自一个TrainingNode，既不按技能数复制，也不新增隐藏收费节点。

## 9. 完整行迹 DAG 与状态转换

`validateTrainingProfile(profile)` 校验节点、完整逐级链、canonical身份和全部PrePoint引用；拒绝重复、悬空、自引用、循环和多义公开技能归属。支持多个前置和共享父节点，不读取 `trace-groups.ts` 的视觉分组。

- `activateTrace(profile, activeTraceIds, traceId, promotion)` 收集祖先闭包。目标/祖先都满足晋阶且不存在不可模拟的fixed前置时，统一激活所有付费行迹；失败返回 `{ok:false, activeTraceIds, error:{code,pointIds}}`，不部分激活。
- `deactivateTrace(profile, activeTraceIds, traceId)` 沿反向边遍历所有后继，返回剩余合法付费行迹，保留独立分支。
- `reconcileCharacterLevel(data, target, newLevel)` 先验证原目标，按新等级推导晋阶，移除不合法节点和后继，保留Display Level。升回高等级不会恢复取消的行迹；Training Level由下一次计算恢复。
- 默认节点视为初始已解锁；固定免费节点保持非养成状态，不能作为付费行迹输入。记忆开拓者 `8007501/8008501` 为fixed，不进入付费Toggle默认目标，费用为0，不推断剧情解锁。

当前DAG无悬空、自引用或循环；169个节点被多个后继共享。三月七 `1001201` 同时是 `1001101/1001102` 的前置，取消它会移除两能力及其后继，保留第三能力。合成测试另覆盖多前置汇合、祖先晋阶不足及fixed前置失败。

## 10. 统一 Target 输入/输出契约

`calculateCharacterTrainingTarget(data, shared, target)` 的 target：`{avatarId, enhancedId, level, displayLevels?: Record<canonicalKey, number>, activeTraceIds?: string[]}`。

输出 `CharacterTrainingResult`：规范化 target（含promotion）、ResolvedSkillTraining[]、费用/EXP分项、totalKnownCost、steps、precision和diagnostics。省略技能目标时按1，省略行迹集合时为空；未知key、其他Profile的key、非法等级、缺失祖先、晋阶不足的激活行迹直接拒绝。`TrainingError` 提供 code/identity；技能clamp是已定义的规范化，不作为错误。

`calculateLightConeTrainingTarget(data, shared, {equipmentId, level})` 输出promotion、EXP、promotionCost及totalKnownCost，skillCost/traceCost为空。只包含可证明的晋阶信用点，不混入未知经验投入费用。

初始/满养成工厂：`createInitialCharacterTrainingTarget(data, enhancedId)`、`createDefaultCharacterTrainingTarget(data, enhancedId)`、`createInitialLightConeTrainingTarget(data)`、`createDefaultLightConeTrainingTarget(data)`。初始费用为0；满养成目标使用配置最高等级、全部付费技能MaxLevel与全部合法付费行迹。

## 11. 产物、性能与部署依赖

数据manifest schema49、训练各artifact schema1、视觉manifest schema17。成本JSON无locale标记，材料catalog明确带locale；所有新增文件登记bytes/sha256/schema。沿用原子生成、发布前校验、独立磁盘重开build-input gate及full semantic重建比对。

| 新产物 | 文件数 | JSON字节 | 每文件gzip字节合计 |
| --- | ---: | ---: | ---: |
| training/shared.json | 1 | 16,182 | 1,972 |
| training/characters/{AvatarID}.json | 98 | 886,306 | 91,122 |
| training/light-cones/{EquipmentID}.json | 170 | 89,853 | 36,026 |
| zh-CN/materials.json | 1 | 17,466 | 2,700 |
| en/materials.json | 1 | 18,084 | 2,781 |
| 合计 | 271 | 1,027,891 | 134,601 |

gzip测量逐文件level9，未配置服务器压缩策略。最大角色片15,974字节，最大光锥片531字节。140个材料图标共3,348,237字节。页面初始数据没有嵌入这些Cost表；只有未来显式调用loader时才请求。

Source registry由85变为91张精确Excel表，增加六张TRAINING_TABLE_NAMES。regular/LD来源仍使用既有身份合并与冲突拒绝。StarRailRes部署源增加icon/item/；输出只包含140个当前核心材料，不读取items index构建第二业务模型。

源依赖数量补充：旧规范文档记载82张表，但实施前实际registry已含85张。本轮增加六张后为91张；以当前源清单为准，规范文档已同步修正。

Pinned ConstValueCommon包含无关PlayerReturn_* MapValue中的重复IntValue键，整表严格lossless解析失败。新增共享 `readSelectedTable(root,name,field,value)` 按顶层记录扫描选择所需ConstValueName，选中记录仍经原有lossless parse/materialize。只消费Exp_SoftCoin_Cost；不会接受选中记录的重复键，也不更改普通readRaw的严格行为。DefaultUnlock只在技能Lv.1记录为true、后续等级缺省；它按初始步骤解释，不被误当作逐级一致字段。

## 12. 验证结果与命令

Node运行时使用 `PATH=/Users/wh3atl3y/.nvm/versions/node/v24.19.0/bin:$PATH`（实现者可使用自己的Node24路径）。

- 新核心/数据/loader测试与直接相关的build-input、资产、旧属性、展示分组、robustness测试全部通过；最终共99项，9个测试文件。
- TypeScript scripts检查通过；svelte-check为0 errors / 0 warnings；变更文件ESLint与Prettier检查通过。
- `node --import tsx scripts/data/sync.ts` 成功；`node --import tsx scripts/data/validate-full.ts` 成功，含新增训练semantic验证和既有双语完整审计。已知533条上游缺失TextHash警告保留。
- 最终定向 `validateTrainingSemantics` 再次重开两份TextMap与raw，验证全部新JSON逐字段一致。
- `node --import tsx scripts/assets/sync.ts`、`node --import tsx scripts/assets/verify.ts` 成功；140个材料图标无缺失。合成资产测试验证缺图fallback、128px输出、请求集合和缓存失效。
- 原prebuild中的benchmark校验通过，2,744/2,744；本地 `pnpm exec vite build` 成功完成production编译和adapter-static导出。271个训练JSON及140个图标与build输出字节完全一致。
- `git diff --check` 通过；没有修改Svelte/CSS/路由、现有stats函数或Player解析。两份上游仍干净。

沙箱中tsx CLI创建IPC socket返回EPERM；本轮改用同一已安装tsx的 `node --import tsx` 入口执行脚本，不安装依赖、不改项目脚本、不申请放宽沙箱。本地production build直接调用Vite，所需数据、资产、messages（生成/构建插件验证）和benchmark前置检查已分别完成。

兼容性：所有原角色/光锥详情、目录、Player runtime和其他非搜索/Endgame-occurrence原artifact digest均保持不变，routePaths/routes完全一致。本地原缓存的191个English occurrence shard仍为旧schema2；当前已有生成器重建为schema3，相关4个search artifacts随其刷新。这是刷新已有旧缓存的结果，未修改Endgame/Search实现。

未执行浏览器E2E、全量unit suite、远程Preview或部署：本轮无页面行为接线，定向纯逻辑/数据/资产检查与本地静态build已覆盖改动风险。

## 13. Slice B 直接接入方式

```ts
import { createTrainingLoader } from '$lib/data/training';
import {
  createDefaultCharacterTrainingTarget,
  resolveSkillProgression,
  calculateCharacterTrainingTarget,
  reconcileCharacterLevel,
  activateTrace,
  deactivateTrace
} from '$lib/domain/training/index';
import { resolveMaterialIconAsset } from '$lib/data/visual-assets';

const loader = createTrainingLoader(fetch); // SvelteKit load中应传它提供的fetch。
const [data, shared, materials] = await Promise.all([
  loader.loadCharacter('1510'), loader.loadShared(), loader.loadMaterials(locale)
]);
const profile = data.profiles.find((profile) => profile.enhancedId === enhancedId)!;
let target = createDefaultCharacterTrainingTarget(data, enhancedId);
const talentKey = resolveSkillProgression(profile, '151004');
const assistKey = resolveSkillProgression(profile, '151022'); // 与talentKey相同。
target = { ...target, displayLevels: { ...target.displayLevels, [talentKey]: 12 } };
const result = calculateCharacterTrainingTarget(data, shared, target);
const materialById = new Map(materials.materials.map((material) => [material.id, material]));
for (const [itemId, quantity] of Object.entries(result.totalKnownCost)) {
  const material = materialById.get(itemId)!;
  const iconUrl = resolveMaterialIconAsset(material.iconKey);
  // Slice B负责名称/稀有度/数量/fallback展示；EXP单独展示。
}
```

loader还导出实例方法 `loadLightCone(equipmentId)`；失败不缓存，可重试；各locale请求单独缓存；返回JSON经版本、身份和基本结构校验。没有Item详情load方法。

等级变更先调用 `reconcileCharacterLevel(data,target,newLevel)`，再计算；行迹点击调用activate/deactivate并替换activeTraceIds；激活失败时保持原目标，通过error.code/pointIds生成本地化提示。两个共享滑块绑定同一canonical key；当前不同Category卡片结构无需改变。

Slice B仍需将静态属性面板改成同一低边界晋阶逻辑，显示晋阶Tag及技能要求，接线共享滑块、行迹Toggle和养成Section。本轮没有更改 `normalizeStatProgression`；属性面板在Lv.20仍显示较高晋阶，养成核心返回较低晋阶，这是明确待接线差异。

## 14. 未解决问题与排除项

无阻塞Slice B接入的问题。经验投入组合、返还、舍入与实际升级信用点未闭合，保持unresolved而不是伪造精确总成本。记忆开拓者fixed特殊节点的剧情激活条件不推断。

未加入库存/当前EXP/任意当前等级、跨形态玩家共享状态、星魂或叠影收费、普通Item集合、Item Modal、物品页面、UI状态管理框架或后端。新的训练目标只用于静态规划，不读写Player真实数据。

## 15. 修改文件清单

- `AGENTS.md`
- `docs/architecture/localization-and-data-generation.md`
- `docs/investigations/material-training-slice-a-core.md`
- `scripts/assets/shared.ts`
- `scripts/data/domain/training.ts`
- `scripts/data/generated-artifacts.ts`
- `scripts/data/projection/material.ts`
- `scripts/data/raw.ts`
- `scripts/data/source-requirements.ts`
- `scripts/data/sync.ts`
- `scripts/data/training-sources.ts`
- `scripts/data/validate.ts`
- `scripts/data/validation/build-inputs.ts`
- `scripts/data/validation/training.ts`
- `scripts/deployment/prepare.ts`
- `src/lib/data/training.ts`
- `src/lib/data/visual-assets.ts`
- `src/lib/domain/training/index.ts`
- `src/lib/domain/training/types.ts`
- `src/lib/domain/training/validation.ts`
- `src/lib/domain/types.ts`
- `src/lib/domain/visual-assets.ts`
- `tests/unit/asset-ensure.test.ts`
- `tests/unit/build-input-validation.test.ts`
- `tests/unit/robustness-invariants.test.ts`
- `tests/unit/training-core.test.ts`
- `tests/unit/training-data.test.ts`
- `tests/unit/training-loaders.test.ts`
- `tests/unit/visual-assets.test.ts`

生成JSON、图片、manifest、audit和build都沿用现有gitignore，不提交。具体文件清单以人工验收时git diff/status为准。

## 附录：全部共享节点

“关联SkillID”来自LevelUpSkillID，包括隐藏记录；“公开类别”来自既有Profile可见成员，不是新增展示许可。成本按第一列canonical key计算一次。

| Canonical key | 关联SkillID | 公开类别 |
| --- | --- | --- |
| `1109:0:1109002` | 110902, 110909 | skill |
| `1111:0:1111001` | 111101, 111108 | basic |
| `1201:0:1201001` | 120101, 120108 | basic |
| `1205:0:1205001` | 120501, 120508 | basic |
| `1205:1:11205001` | 1120501, 1120508 | basic |
| `1212:0:1212002` | 121202, 121209 | skill |
| `1212:1:11212002` | 1121202, 1121209 | skill |
| `1213:0:1213001` | 121301, 121308, 121310, 121312 | basic |
| `1220:0:1220003` | 122003, 122008, 122009, 122014 | ultimate |
| `1224:0:1224001` | 122401, 122408 | basic |
| `1225:0:1225001` | 122501, 122508 | basic |
| `1301:0:1301001` | 130101, 130108 | basic |
| `1302:0:1302003` | 130203, 130214 | ultimate |
| `1308:0:1308003` | 130803, 130814, 130815, 130816, 130817 | ultimate |
| `1310:0:1310001` | 131001, 131008 | basic |
| `1310:0:1310002` | 131002, 131009 | skill |
| `1310:1:11310001` | 1131001, 1131008 | basic |
| `1310:1:11310002` | 1131002, 1131009 | skill |
| `1315:0:1315001` | 131501, 131508 | basic |
| `1317:0:1317001` | 131701, 131708, 131710, 131712, 131718 | basic |
| `1401:0:1401002` | 140102, 140109 | skill |
| `1402:0:1402001` | 140201, 140208 | basic |
| `1402:0:1402002` | 140202, 140209 | skill |
| `1402:0:1402302` | 1140203, 1140205, 1140206 | memosprite-talent |
| `1404:0:1404002` | 140402, 140409, 140411 | skill |
| `1407:0:1407002` | 140702, 140709 | skill |
| `1407:0:1407301` | 1140701, 1140702, 1140710, 1140711 | memosprite-skill |
| `1407:0:1407302` | 1140703, 1140712, 1140706, 1140705 | memosprite-talent |
| `1408:0:1408001` | 140801, 140808 | basic |
| `1408:0:1408002` | 140802, 140809, 140811 | skill |
| `1408:0:1408004` | 140804, 140805 | talent |
| `1409:0:1409302` | 1140903, 1140905, 1140906 | memosprite-talent |
| `1413:0:1413002` | 141302, 141309 | skill |
| `1413:0:1413301` | 1141301, 1141307 | memosprite-skill |
| `1413:0:1413302` | 1141303, 1141305, 1141306 | memosprite-talent |
| `1415:0:1415001` | 141501, 141508 | basic |
| `1415:0:1415003` | 141503, 141514 | ultimate |
| `1415:0:1415301` | 1141501, 1141502, 1141513, 1141514, 1141515, 1141516, 1141517, 1141518, 1141519, 1141520, 1141521, 1141522, 1141523, 1141524, 1141525, 1141526 | memosprite-skill |
| `1415:0:1415302` | 1141503, 1141505 | memosprite-talent |
| `1501:0:1501001` | 150101, 150108 | basic |
| `1501:0:1501002` | 150102, 150109 | skill |
| `1503:0:1503001` | 150301, 150308, 150310 | basic |
| `1506:0:1506001` | 150601, 150608, 150610, 150612, 150618 | basic |
| `1506:0:1506420` | 150620, 150621 | elation-skill |
| `1507:0:1507001` | 150701, 150708 | basic |
| `1507:0:1507002` | 150702, 150709 | skill |
| `1507:0:1507003` | 150703, 150714 | ultimate |
| `1510:0:1510003` | 151003, 151008, 151009, 151014 | ultimate |
| `1510:0:1510004` | 151004, 151022, 151025, 151026 | assist, talent |
| `1512:0:1512302` | 1151203, 1151205, 1151206 | memosprite-talent |
| `1513:0:1513420` | 151320, 151321 | elation-skill |
| `8001:0:8001003` | 800103, 800108, 800109 | ultimate |
| `8002:0:8002003` | 800203, 800208, 800209 | ultimate |
| `8003:0:8003001` | 800301, 800308 | basic |
| `8004:0:8004001` | 800401, 800408 | basic |
| `8007:0:8007001` | 800701, 800708 | basic |
| `8007:0:8007002` | 800702, 800709 | skill |
| `8007:0:8007301` | 1800701, 1800707 | memosprite-skill |
| `8007:0:8007302` | 1800703, 1800705, 1800706 | memosprite-talent |
| `8008:0:8008001` | 800801, 800808 | basic |
| `8008:0:8008002` | 800802, 800809 | skill |
| `8008:0:8008301` | 1800701, 1800707 | memosprite-skill |
| `8008:0:8008302` | 1800703, 1800705, 1800706 | memosprite-talent |
| `1014:0:1014001` | 101401, 101408 | basic |
| `1508:0:1508002` | 150802, 150809 | skill |
| `1508:0:1508004` | 150804, 150805 | talent |
| `1509:0:1509004` | 150904, 150905 | talent |

