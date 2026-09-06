# Locale-Neutral Domain Model / TextRef Boundary Audit

调查日期：2026-09-05。本文是只读架构调查，不是英文实现、schema 迁移或 UI 改动。

本报告依据 `I18n-L10n/I18n-L10n-Architecture-Investigation-01.md`，重新检查
`TurnBasedGameData`、HSR-Database 的 raw parser、data generator、generated artifacts、
loader、Search V2、Endgame 和 Phase 1 变更。历史报告保持不变；本文明确指出哪些旧结论
被新证据细化或 supersede。

## 1. Executive summary

结论是：上游基本已经实现了“结构化 config + 稳定引用 + TextMap presentation”，而
HSR-Database 当前只在 generator 的输入端保留了这种边界，进入 `syncData()` 后很快又
退回单语言的 CHS view。当前问题不是 Paraglide，也不是缺少第二份英文数据，而是
**authoritative generated domain artifacts 已经被 CHS presentation 污染**。

最严重的缺陷按优先级为：

1. `scripts/data/localization.ts::loadTextMap()` 写死 `TextMapCHS.json`；
   `TextResolver` 只返回 `string`，没有 locale、TextHash、参数或 missing/absent 状态。
2. `scripts/data/sync.ts::tr()` / `trSymbolic()` 是第一处通用的引用丢失边界。它们把
   `Hash`、symbolic key 或空引用转换成已经无法追溯来源的字符串；随后 `name`、
   `description`、`pathName`、技能文本、故事和 Endgame 文本进入 generated model。
3. 技能描述在 generator 中完成参数插值和 token flattening。当前 UI token 很有用，
   但它不能替代原始 `TextSource`；gender branch、`{NICKNAME}`、参数、markup 与
   locale-specific token structure 因此无法在未来语言投影层重新解析。
4. `SearchDocument.canonicalName`、official/player aliases 和 Endgame
   `entryIdForName(name)` 使用 locale-specific strings。普通实体 target 仍以 ID 为 key，
   但 Endgame name bucket、Search target 和 occurrence shard 目前仍把 CHS grouping
   当成 identity 输入。
5. `enemy-skill-inclusion.json` 同时保存了历史显示范围和 `descriptionHash`。它可以
   作为当前 CHS 兼容的审阅桥接，但不能成为 neutral skill existence 的 authoritative
   boolean。

推荐的目标是：

```text
pinned config + stable IDs/refs/hashes
        ↓
one neutral domain model
        ↓
TextSource / TextResolver(locale, context)
        ↓
Localized view / Search labels / page projection
        ↓
existing shared components + Site Messages
```

这要求一次有边界的 breaking data-pipeline refactor，但不要求一次完成英文站点。第一
阶段应先在中文仍为唯一 locale 的情况下保存 neutral refs，并由 CHS projection 生成
现有 view；这样每一步都可以继续以 CHS contract、97 characters、173 buckets 和
8,167 locators 验证。

## 2. 调查基线和证据口径

| 来源              | 版本 / 状态                                                        |
| ----------------- | ------------------------------------------------------------------ |
| HSR-Database      | `develop`, Phase 1 工作树；生成 manifest schema 37、language `CHS` |
| TurnBasedGameData | pinned `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`                  |
| StarRailRes       | pinned `d226befe3db13f2ec15f4161d5f34b1b607643fe`                  |
| TextMap           | `TextMapCHS.json` 与同 commit 的 `TextMapEN.json`                  |
| 生产实体          | 97 characters、169 light cones、60 relic sets、628 enemy templates |
| Endgame / Search  | schema 23 / 2，occurrence shard schema 1                           |

本轮没有修改生产文件、policy、generated schema、protected metadata 或 upstream。
此前工作树中的 Phase 1 修改属于用户已有变更，本报告只新增本文件。

## 3. 上游是否真的 locale-neutral

### 3.1 大多数核心 config 是 neutral 的

代表性 raw rows：

| 表 / 记录                                             | neutral fields                                                                                        | localized references                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ExcelOutput/AvatarConfig.json`, `AvatarID=1001`      | `AvatarID=1001`、`Rarity`、`DamageType=Ice`、`SPNeed.Value=120`、`AvatarBaseType=Knight`、`SkillList` | `AvatarName.Hash=6186714091647966180`、`AvatarFullName.Hash=9058972803650014000`、`AvatarIntroText` 等 Hash |
| `AvatarBaseType.json`, `ID=Knight`                    | ID、asset paths、enum identity                                                                        | `BaseTypeText.Hash`、`BaseTypeDesc.Hash`                                                                    |
| `AvatarSkillConfig.json`, `SkillID=100106`            | skill ID、level、`AttackType`、`SkillTriggerKey`、`ParamList`、`ExtraEffectIDList`                    | `SkillName`、`SkillTag`、`SkillTypeDesc`、`SkillDesc` Hash                                                  |
| `EquipmentConfig.json`, `EquipmentID=20000`           | ID、rarity、path code、promotion、`SkillID`                                                           | `EquipmentName.Hash`                                                                                        |
| `EquipmentSkillConfig.json`, `SkillID=20000`          | skill ID、level、`ParamList`, ability key                                                             | `SkillName.Hash`、`SkillDesc.Hash`                                                                          |
| `RelicSetConfig.json`, `SetID=101`                    | set ID、piece requirements、asset IDs、release version                                                | `SetName.Hash`                                                                                              |
| `RelicSetSkillConfig.json`, `SetID=101, RequireNum=2` | requirement、property codes、params                                                                   | `SkillDesc="RelicDesc_1012"` symbolic key                                                                   |
| `MonsterConfig.json`, `MonsterID=1002011`             | monster/template ID、ratios、weakness/resistance codes、summon IDs、skill IDs                         | `MonsterName.Hash`、`MonsterIntroduction.Hash`、strategy refs                                               |
| `MonsterSkillConfig.json`, `SkillID=100201101`        | skill ID、phase、damage/attack codes、params、extra-effect IDs                                        | `SkillName`、`SkillTypeDesc`、`SkillTag`、`SkillDesc` Hash                                                  |
| `MultiplePathAvatarConfig.json`, `AvatarID=8001`      | avatar/base avatar ID、gender、unlock conditions、path-change config                                  | `Desc.Hash`                                                                                                 |

这些结构证明：第三种语言不需要复制 config database。Hash 的十进制 spelling 也必须
保持精确；`scripts/data/raw.ts::materialize()` 特意把 `Hash` 和 `Value` 保留为字符串，
避免 IEEE-754 损坏。这是正确的底层边界，应向 generated domain 延伸，而不是在后面
重新猜测中文身份。

### 3.2 真实反例和限制

上游并非所有文本都是 `{"Hash": ...}`：

- `RelicSetSkillConfig.SkillDesc` 使用 symbolic key，如 `RelicDesc_1012`，由
  `xxhash64(key, seed=0)` 映射到 TextMap；
- 某些表使用字符串 enum、asset key、internal ability key 或参数化 template；这些
  是 stable source/code，不应被当作已本地化文本；
- `GameText` 本身可含 `<color>`、`<unbreak>`、`{F#...}{M#...}`、`{NICKNAME}` 和
  `#1[i]%` 等语法；locale projection 需要 context 和参数，而不只是 scalar lookup；
- 网站自己的展示名，如 `基础名·命途名`，是 presentation policy，不是上游一个完整
  的 TextMap field；
- `character-player-aliases.json` 是中文站点人工搜索 metadata，不属于游戏 config；
- Endgame 当前的“同名敌人”分组是 CHS presentation grouping，不是上游 neutral
  occurrence identity。

因此正确抽象不是所有内容都包装成 `{ hash: string }`，而是 typed source union。

## 4. 当前 localization boundary：TextHash 在哪里丢失

### 4.1 第一处通用丢失点

`scripts/data/localization.ts`：

- `loadTextMap(root)`（约 line 43）固定读取 `TextMap/TextMapCHS.json`；
- `TextResolver.resolveHash()`（约 line 55）接受 `TextHash`，立即返回 `string`；
- `resolveRef()`（约 line 73）从 raw object 读取 `Hash`，但不返回 ref/provenance；
- `resolveSymbolic()`（约 line 91）把 symbolic key hash 后立即返回 CHS string。

`TextSource` 目前只有 `{ entity, id?, field }`，它是诊断 provenance，不是 runtime
TextRef；hash 本身不在返回值中。

### 4.2 生产 pipeline 的第一个实际替换点

`scripts/data/sync.ts::syncData()`：

```text
createTextResolver(loadTextMap(root))       // CHS only
        ↓
tr(value, source, fallback): string         // line ~337
trSymbolic(value, source, fallback): string
        ↓
normalizeGameText / formatGameText / formatGameMarkup
        ↓
CatalogEntry / Character / LightCone / Relic / Enemy / Endgame
```

`tr()` 先把 empty raw field 记录为 audit，再调用 `resolveRef()`；`trSymbolic()` 将
symbolic key resolve 后也只保留 normalized string。调用方无法区分：

1. config field absent；
2. config 有 ref 但 TextMap 当前 locale missing；
3. ref 合法且 value 是空字符串；
4. generator fallback 被采用；
5. 文本存在但 GameText parser 不支持。

### 4.3 主要 producer → consumer 样本

| producer                                                       | raw input                                                          | first localized output                               | downstream consumers                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| `sync.ts::tr`, character catalog                               | `AvatarConfig.AvatarName.Hash`、`AvatarBaseType.BaseTypeText.Hash` | `CatalogEntry.name`, `baseName`, `pathName`          | overview card、detail hero、Search inputs             |
| `normalizeSkillVariant`（`sync.ts` ~819）                      | `AvatarSkillConfig.SkillDesc.Hash` + `ParamList`                   | `levels[].description`, `descriptionTokens`          | `SkillVariantView`、description component、validators |
| light-cone loop（`sync.ts` ~1219/1264）                        | `EquipmentSkillConfig.SkillDesc.Hash` + params                     | passive level `description`/tokens                   | `SuperimpositionPanel`                                |
| relic loop（`sync.ts` ~1428）                                  | `RelicSetSkillConfig.SkillDesc` symbolic key                       | `effects[].description`, catalog joined description  | relic overview/detail                                 |
| enemy skill (`enemy-skill-policy.ts::resolveEnemySkillSource`) | `SkillTypeDesc`, `SkillTag`, `SkillDesc` refs                      | `kindLabel`, `tag.label`, formatted description      | EnemySkillCard、semantic diagnostics                  |
| Endgame (`sync.ts` ~1517 onward)                               | Maze/buff/guide refs                                               | period/group/stage names, mechanics, occurrence name | Endgame pages、search names、shards                   |
| `search-documents.ts::buildSearchDocuments`                    | generated `catalog.name`, official snapshot, aliases               | `SearchDocument.canonicalName` and label arrays      | FlexSearch browser document                           |
| `search-index.ts::collectEndgameSearchNames`                   | `occurrence.name`                                                  | `Map<name, entryId>` and locators                    | Endgame search bundle/shards                          |

### 4.4 UI 不会恢复 source identity

`GameText.svelte` 和 `DescriptionText.svelte` 只接收已经生成的 string/token。它们能安全
渲染 `<color>`、icon 和 scaling value，但不能知道原始 TextHash、symbolic key、参数
来源或缺失状态。当前 UI 的 `GameText` 是 presentation renderer，不应被误认为
localization resolver。

## 5. Text source taxonomy

| kind                   | raw source                                                    | stable across locale |                 params | current output            | recommended representation                           |
| ---------------------- | ------------------------------------------------------------- | -------------------: | ---------------------: | ------------------------- | ---------------------------------------------------- |
| `DirectTextRef`        | `{ Hash }`，如 `AvatarName`、`SkillDesc`                      |                  yes |   no/embedded GameText | plain/markup string       | `{ kind:'hash', hash, source }`                      |
| `SymbolicTextRef`      | `RelicDesc_1012` 等 key                                       |                  yes |              often yes | resolved string           | `{ kind:'symbolic', key, hash?, source }`            |
| `ParameterizedTextRef` | hash/key + `ParamList` / level values                         |                  yes |                    yes | interpolated text/tokens  | `{ kind:'template', ref, params, parameterSchema? }` |
| `GameTextSource`       | source text containing markup, scaling, icons                 |                  yes |      context-dependent | `descriptionTokens`       | source ref plus immutable token projection           |
| `GenderedTextRef`      | `{F#...}{M#...}`                                              |                  yes |         gender/context | current raw string        | source ref + gender projection context               |
| `NicknameTemplate`     | `{NICKNAME}`                                                  |                  yes | player nickname policy | unresolved placeholder    | source ref + explicit placeholder state              |
| `CompositeTextSource`  | name policy, joined relic effects, fallback piece name        |               partly |              no/varies | website-derived string    | typed composition nodes, never a domain identity     |
| `StableCode`           | `DamageType`, `AvatarBaseType`, `SkillTriggerKey`, asset path |                  yes |                     no | code plus localized label | code only in domain; label in view                   |

单一 `TextHash` 足以表示直接 lookup，但不足以表示 symbolic source、参数、gender、
nickname 或网站 composition。建议概念类型为：

```ts
type TextSource =
  | { kind: 'hash'; hash: TextHash; source: Provenance }
  | { kind: 'symbolic'; key: string; source: Provenance }
  | {
      kind: 'parameterized';
      ref: Exclude<TextSource, { kind: 'parameterized' }>;
      params: readonly number[];
    }
  | { kind: 'template'; parts: readonly TextSourcePart[] }
  | { kind: 'derived'; policy: string; parts: readonly TextSource[] };
```

这是 boundary 设计，不是本轮实施。provenance 应留在 build/audit model；runtime/browser
只需携带 refs 或已经投影的 view。

## 6. Character audit

### 6.1 neutral fields

`AvatarID`、`BaseAvatarID`、gender、path code、element code、rarity、stats、SP、skill
IDs、`RankIDList`、trace/eidolon relationships、servant links、ExtraEffect IDs、
energy kind、BP、toughness、asset keys 都是 neutral。`1001`/`1224`、`8001–8010`、LD
角色和 enhanced/special profiles 的身份均可由 ID/配置关系表达，不应通过“中文名称相等”
推导。

### 6.2 localized refs

`AvatarName`、`AvatarFullName`、`BaseTypeText`、skill name/type/tag/description、
trace/eidolon text、story、ExtraEffect name/description、property labels 和 profile
intro 都是 localized source。当前 Phase 1 的 source-hash 命名验证是正确的 provenance
保护，但 `canonicalName` 写回 `search-inputs.json` 仍是 CHS projection。

### 6.3 naming 结论

Character canonical display name 本质属于 projection。neutral character 应保存：

```text
avatarId / baseAvatarId
rawAvatarNameRef
rawFullNameRef
pathId / pathNameRef
multiple-path relation
```

localized naming policy 再生成 `三月七·存护` 或其他 locale 的 display name。`1001` 和
`1224` 的 official-base-name 资格仍应保留为 reviewed policy，但 policy 输入应是
source refs / IDs，不是 CHS string equality。Trailblazer 的 `FateRinOwner` hash
`4036035618718239522` 也是 provenance evidence，不是 domain name。

## 7. Light Cone and Relic audit

Light Cone 已有清晰的 neutral 骨架：`EquipmentID`、rarity、path code、stats、skill
ID、promotion/rank 和 asset keys；`EquipmentName`、`SkillName`、`SkillDesc`、story
是 refs。当前 `CatalogEntry` 和 passive levels 直接保存 CHS `name`/`description`，
因此应拆成 `LightConeDomain` → `LocalizedLightConeView`，而不是 `LightConeZH` /
`LightConeEN`。

Relic 同样可拆：`SetID`、piece IDs/slots、property IDs、requirements、params、
release/category 关系是 neutral；`SetName`、`RelicSetSkillConfig.SkillDesc` symbolic
key、piece name/description、source display labels 是 localized/composite。`typeName`
（如“隧洞遗器”）尤其是 view label；`category='cavern'|'planar'` 才是 stable code。
当前 catalog description 通过 effects join 合成，不能作为 neutral field。

缺失 effect text 不应删除 relic set 或 piece。建议 view 层区分 absent effect config、
missing locale ref 和 unsupported template，并按领域 policy 决定是否显示空状态。

## 8. Enemy audit and inclusion policy

### 8.1 三层必须分开

Enemy config 中：

- **A. existence**：`MonsterSkillConfig` 是否有 `SkillID`，以及 Monster/Template/phase
  关系；这是 neutral；
- **B. semantic identity**：kind、tag、damage/attack code、phase、extra effects、
  summon relation；这是 neutral；
- **C. locale presentation**：当前 locale 是否有 name/description，是否生成完整
  SkillCard；这是 localized projection policy。

当前 `resolveEnemySkillSource()` 返回 `{ kindLabel, kind, tag, visible,
formattedDescription, localizedTextStatus }`，其中 `visible` 来自
`enemy-skill-inclusion.json`，把 A/B/C 仍压缩成一个输出对象。`kind/tag` 的 reviewed
十进制 source-hash mapping 是正确的 neutral bridge，应保留；`label` 应改为 localized
view 字段。

### 8.2 “description empty → hide” 的实际性质

Phase 1 之前的行为把缺 description、内部技能、没有可显示文本的 row 和 UI 过滤混在
一起。当前 policy 冻结了 3,548 条 MonsterSkillConfig row 的历史结果，并验证
`sourceSignature`，这是 CHS parity 的安全措施，但它不能证明上游把 `included` 作为
neutral semantic field 提供。上游当前没有统一 `HideInUI` 字段可供恢复。

### 8.3 明确推荐：`enemy-skill-inclusion.json` replace，而非立即删除

本轮三选一结论：**replace**。

- 短期保留文件作为 `legacyChsPresentationPolicy`，避免回归并允许审阅 upstream
  变化；不要继续将它称为 skill existence；
- neutral model 收录所有 config skill（包括没有 CHS description 的 row），保留 refs、
  semantic kind/tag、phase 和 source signature；
- locale projector 根据 `TextAvailability`、skill kind/phase 和领域 policy 决定
  `visibleCard`、`missingText` 或 `internal/unsupported` 状态；
- CHS compatibility mode 使用现有 policy 验证输出集合；等 neutral projection 与
  CHS snapshot 完成 parity 后，在后续 implementation PR 删除 policy 的生产依赖；
- 新 upstream skill 先自然进入 neutral model。只有改变 CHS visible card 行为时才需要
  presentation policy review，不应因为英文缺 description 就从 domain 删除。

这比直接 remove 更安全，因为当前无法从 config 结构单独重建历史 UI intent；但最终
目标不是永久冻结每种语言的 snapshot。

## 9. SpecialEffect / ExtraEffect

Phase 1 的 typed semantic relation 已经与目标架构对齐：`extra-effects.ts` 根据 skill
link/ExtraEffect ID 和 reviewed icon provenance 建立关系，展示层消费 semantic reference，
不再用“特殊效果”中文词或相似 token style 判定业务身份。该改动应 **keep**。

仍然需要补边界：ExtraEffect definition 存在于 config 就应进入 neutral definition，
即使 name/description ref 缺失；localized projection 可返回 `available`、`missing` 或
`unsupported`。当前 `resolveText` 仍返回 string，且无展示文本的 definition 可能在
生成路径中被过滤，属于 temporary bridge，不应被解释为 config absence。

## 10. Endgame audit

Endgame 的 neutral 层包括 mode、season/group/config IDs、stage/node/wave、MonsterID、
TemplateID、stats modifiers、phase/slot/occurrence relation、maze/buff/guide refs 和
locator coordinates。`collectEndgameSearchOccurrences()` 已经先枚举 occurrence 再读取
name，这是正确方向，应 **keep**。

当前问题在 `collectEndgameSearchNames(datasets, entryIdForName)`：它按
`occurrence.name` 建 `Map<string, EndgameSearchNameEntry>`，然后用 name hash 生成
`entryId`。因此现有 173 个 CHS name buckets 是 presentation grouping，不是 neutral
domain count。EN 可能产生不同数量的 display-name groups，但 occurrence set 和
locators 应保持相同。

建议分层：

```text
OccurrenceIdentity = mode/group/encounter/battle/stage/wave/occurrence index
NeutralEntity = MonsterID + TemplateID (+ variant/phase context)
LocalizedNameGroup = locale + display-name policy + member occurrence identities
SearchTarget = locale-specific label target pointing to neutral occurrence/template set
ShardKey = content digest + locale projection version + stable group key
```

`mt:{MonsterTemplateID}` 仍可作为 Search/Endgame 的短 target atom，但它不是新的
authoritative domain entity，也不应取代 occurrence identity。若 template ID 已足够表达
neutral target，运行时可以直接使用 typed `{kind:'monster-template', id}`；保留 `mt:`
字符串只为现有 namespace/cache compatibility，未来应在 typed layer 之后序列化。

因此：173 buckets **refine** 为 locale presentation；`entryId` 不再同时承担 occurrence、
name group、search target 和 shard key 四种职责。

## 11. Homepage and Search V2

Homepage 是目标架构的 reference implementation：`homepage.json` 主要保存
`gachaId → avatarId/equipmentId`，页面再 join 当前 catalog。不要重构它。

Search V2 已经把 ordinary target identity 与 labels 部分分开：`searchTargetKey()` 对
character/light-cone/relic/enemy 使用 kind+ID，Endgame 使用 entryId；FlexSearch 的
document 保存 canonical/official/player strings。当前不足是 document schema 只支持
CHS labels，且 Endgame key 已被 name grouping 污染。

推荐未来拆成：

```text
NeutralSearchTarget { kind, id | occurrence/template/group id }
LocalizedSearchLabelBundle { locale, canonical, officialAliases, playerAliases }
SearchDocument(locale projection) { targetKey, labels, ranking metadata }
```

`SearchDocument` 可以继续保存 string，因为它本来就是可丢弃的 locale-specific index
projection；不要把这些 strings 写回 neutral domain。`character-player-aliases.json`
保持为 zh-CN site metadata，未来英文 aliases 独立维护。官方 snapshot 的 source refs
和 canonical string 也应分为 neutral naming evidence 与 locale label cache。

## 12. Site Messages boundary

Phase 1 的 `messages/zh-CN.json`、Paraglide 2.25.0 和 `project.inlang` 架构 **keep**。
Site Messages 只负责 HSR Archive 自有 UI；游戏 TextMap 继续由游戏 data pipeline 解析。
不要把 TextMapEN 导入 Paraglide，也不要把 skill/story 复制到 `messages/en.json`。
两条管线只在 component props / localized view 层汇合。

## 13. Generated schema field classification

| domain / field                             | current type                | original source             | current status           | target status                    |
| ------------------------------------------ | --------------------------- | --------------------------- | ------------------------ | -------------------------------- |
| Character `id`                             | string                      | AvatarID                    | neutral                  | keep in domain                   |
| Character `name`, `baseName`               | string                      | AvatarName + naming policy  | CHS projection in domain | `TextSource` + naming projection |
| Character `path`, `element`                | code string                 | AvatarBaseType / DamageType | neutral code             | keep; label in view              |
| Character `pathName`, `elementName`        | string                      | TextMap refs                | localized                | remove from neutral core         |
| Skill `id`, `category`, `order`, relations | mixed stable strings/arrays | IDs, AttackType, links      | mostly neutral           | keep typed codes/refs            |
| Skill `name`, level `description`          | string + tokens             | Hash + ParamList + GameText | CHS projection           | source + immutable view tokens   |
| Light Cone `path`, stats                   | code/numeric                | EquipmentConfig             | neutral                  | keep                             |
| Light Cone passive/story/name              | string                      | Equipment/Skill/TextMap     | CHS projection           | refs + view                      |
| Relic `category`, slots, requirements      | code/IDs                    | Relic config                | neutral                  | keep                             |
| Relic effects/piece/source labels          | string                      | symbolic/hash/composition   | CHS projection           | refs/composition + view          |
| Enemy IDs, ratios, weakness codes          | IDs/numeric/codes           | Monster config              | neutral                  | keep                             |
| Enemy `name`, guide, skill labels          | string                      | Hash/symbolic refs          | CHS projection           | refs + locale state              |
| Endgame locator and occurrence coordinates | numbers/codes               | challenge config            | neutral                  | keep                             |
| Endgame `name`, mechanics text             | string                      | TextMap refs                | CHS projection           | refs + localized group           |
| Search `canonicalName`, aliases            | string[]                    | projection/site metadata    | locale index             | keep only in locale index        |
| Homepage gacha IDs                         | IDs                         | gacha config                | neutral join             | keep                             |
| manifest `language`                        | `CHS`                       | build choice                | build metadata           | locale projection manifest       |

Not every TypeScript `string` is localized: enum codes, asset keys, URL-safe IDs and internal
keys remain stable strings. Conversely, `pathName`, `typeName`, `tag.label` and joined relic
description are derived presentation strings.

## 14. Localized string as key / identity audit

高风险位置：

- `collectEndgameSearchNames`: localized `occurrence.name` → `Map` key → name bucket →
  `entryId` → occurrence shard/search key；这是 confirmed locale-sensitive identity；
- `search-documents.ts`: canonical/official/player strings → FlexSearch labels；这是合法
  的 locale index projection，但必须明确不属于 domain identity；
- `character-names.ts`: canonical display string 与 catalog name 一致性校验；当前作为
  CHS cache integrity gate 合理，未来应校验 neutral source refs + locale projection；
- `enemy-skill-policy.ts`: kind/tag label 独立于 source-hash mapping 后已不再以中文 label
  决定 semantic code；这项已修复；
- SpecialEffect typed relation：已不再通过 token wording/样式识别关系；已对齐；
- overview sorting：按当前 locale display label 排序是合法 presentation behavior，只要
  不改变 ID、关系、缓存 identity 或 stored order。

没有证据表明普通 character/light-cone/relic/enemy route 使用 localized name 作为 URL；
它们使用 IDs。Endgame name bucket 是唯一需要 breaking identity 分层的重点。

## 15. TextMap CHS/EN coverage

此前基于 lossless raw reader 的全表扫描得到：可解析表约 730,325 个 Hash references、
443,963 个 distinct hashes；CHS 缺 7,747，EN 缺 7,746。这个数字不是生产页面缺失率，
因为包含未消费表、内部 row 和非网站领域。

生产相关样本的可靠结论是：

- 97 个 character canonical names、169 个 light-cone names、60 个 relic set names、
  628 个 enemy template names 的对应 EN refs 均存在；
- AvatarSkillConfig 去重后约 702 个生产相关 skill rows 中 CHS/EN 同时缺 4；
- MonsterSkillConfig 全部 3,548 rows 中 CHS/EN 同时缺 397，这包含隐藏/internal rows，
  不能直接视为网站 visible-card 缺失率；
- CHS-only 的实际 Hash reference 样本为 `12685624858240681224`（“一支试管”），不在
  四类 canonical name 样本中；
- Phase 1 CHS validator 记录 544 个 TextHash 缺失警告，但仍通过，因为它们分布在
  未必需要显示的来源；未来 projection 必须按 entity/field/locale 诊断，而不是一个
  全局 empty string。

结论：应从 production-consumed refs 出发建立 coverage manifest，分 Character names/
skills、Enemy names/skills、Relic effects、Light Cone passives、Endgame mechanics 统计，
并把 missing locale 与 absent config 分开。

## 16. GameText: gender, NICKNAME and parameters

当前 generated JSON 中可观察到：

- 12 个文件含 `{F#...}{M#...}` 分支，主要是 Trailblazer/character profile；
- 3 个文件含 `{NICKNAME}`，包括 character/light-cone descriptions；
- 7 个文件仍含参数 placeholder pattern；
- 297 个 generated JSON 含 markup（如 color/unbreak/i）。

`scripts/data/text.ts` 当前在 generator 使用 regex `/#(\d+)(?:\[(i|f\d*)\])?(%?)/g`
完成 numeric interpolation，再由 `parseGameTextWithScaling()` 形成 `descriptionTokens`。
这对于 CHS 静态页面可用，但存在两个 architectural risks：

1. resolve-first-then-parse 使 locale-specific gender syntax、不同语言 token order 和
   missing parameters 无法在共同 source layer 表达；
2. `NICKNAME` 没有通用 context contract，当前 generated output 仍可携带 placeholder，
   不应被用作 identity、alias 或 visibility 规则。

建议 `TextSource + params + render context → GameTextToken[]`，保留 source markup/token
provenance；plain string 只作为 view projection。业务规则不得检查 token wording、
`includes()` 或中文 label。对 numeric scaling、icons、color、underline、unbreak 应使用
typed token semantics；gender/nickname 应是显式 context policy。

## 17. Missing vs absent and diagnostics

当前 `resolveHash()` 的 `value ?? ''` 与 `tr()` fallback 会把多种状态折叠为 string/empty。
目标层至少需要：

```text
AbsentSource        // config field 不存在
MissingLocaleRef    // ref 存在，当前 TextMap 没有 key
EmptyLocaleValue    // key 存在但 value 为空
InvalidSource       // raw ref 结构/Hash 非法
UnsupportedTemplate // parser 不支持 GameText 语法
Available(value)    // 成功投影
```

建议在 build diagnostics 中统一记录：`locale`、entity type、entity ID、config table/
field、TextHash/symbolic key、reason；runtime view 可压缩为 `available|missing|absent|
unsupported`。不要把完整 provenance/debug 信息发送到浏览器。

## 18. Artifact and cache strategy

当前 generated JSON 约 182.8 MB / 968 个 JSON，build 约 436.9 MB；Enemy + Endgame
占 generated 的约 93.65%。旧报告中的双份 full view 约 364.7–371.2 MB generated、
hybrid proxy 约 210.0–216.6 MB，只能作为成本上界，不能改变 domain architecture。

四种策略重新解释如下：

| strategy                                    | architecture meaning                                               | assessment                                                   |
| ------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| A neutral model + prerender projection      | authoritative neutral source；build 时加载 locale TextMap 生成页面 | 推荐默认；最少 runtime join，最容易保持 CHS 兼容             |
| B neutral + compact locale projection cache | neutral refs 和按 locale 的 page/query cache                       | 推荐用于 Search/Endgame 大型重复读取                         |
| C per-locale full view artifacts            | 两份 derived cache，不是两套 domain model                          | 可用于小型 Character/LC/Relic 页面；必须带 locale/digest key |
| D domain hybrid cache                       | 大型 Enemy/Endgame core + view overlay，小型实体 full view         | 推荐的性能折中，但只作为 serialization strategy              |

不要为了节省磁盘把每个 label 拆成 tiny pointer 文件；build join/debug 成本可能超过
节省。推荐的 runtime artifact 是：

```text
generated/neutral/{characters,light-cones,relics,enemies,endgame}.json
generated/views/{locale}/{domain-or-route}.json
generated/search/{locale}.json
```

第一阶段可以继续只构建 `views/zh-CN`，并保留现有 UI props；neutral artifacts 先作为
build/audit source，不要求浏览器下载完整 neutral DB 或任意 TextMap。浏览器应只收到
当前页面所需 localized view、stable IDs 和必要 navigation metadata。

## 19. Dependency graph and manifest

缓存失效应至少按以下依赖：

```text
config/upstream commit + parser version
  → neutral domain digest

TextMapCHS + projection version + neutral digest
  → zh-CN view/search/endgame shards

TextMapEN + projection version + neutral digest
  → en view/search/endgame shards

Site messages + Paraglide compiler version
  → site UI pages only
```

`upstream.lock.json` 仍是正式 provenance，不能被 content digest 取代。manifest 应从单一
`language: CHS` 改成 neutral root manifest 加 locale view manifests；本轮不改 schema。
缓存键必须包含 locale 和 projection digest，不能只扩展现有单语言 Promise/cache key。

## 20. Server / prerender / browser boundary

SvelteKit adapter-static 和当前部署方式最自然的边界是：

```text
generator/build stage: raw config → neutral model → TextResolver(locale) → view
prerender/server loader: route-specific view join and validation
browser: current locale view only + GameText rendering tokens
```

不要在浏览器加载完整 `TextMapCHS.json` / `TextMapEN.json`；这会暴露约 46 万 keys，
增加 payload、lookup 和 cache complexity。`TextResolver(locale)` 应在 build/projection
context 创建，不应作为全局 browser singleton；同一 neutral input 可以在独立 CHS/EN
projection 中 immutable 地生成两个 view。

## 21. Phase 1 decisions revisited

| Phase 1 change                          | decision                                        | reason                                                                       |
| --------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Character naming source-hash/provenance | **keep**, later move to neutral naming evidence | source/ID policy correct；CHS canonical string 不应成为 domain truth         |
| Enemy kind/tag source-hash mapping      | **keep**                                        | source ref → stable semantic code，已脱离中文 wording                        |
| SpecialEffect semantic relation         | **keep**                                        | 已符合 neutral relation + localized text                                     |
| `enemy-skill-inclusion.json`            | **replace**                                     | 作为 CHS compatibility bridge，最终由 neutral existence + locale policy 取代 |
| Endgame eligibility boolean             | **keep/refine**                                 | eligibility 已与 name resolution 分离；后续继续分 occurrence/template/group  |
| Site Messages / Paraglide               | **keep**                                        | 与 game TextMap boundary 独立，无需迁移                                      |

## 22. Previous Architecture Audit decisions revisited

| 旧建议                                      | 新判断                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Character/LC/Relic full localized artifacts | **refine**：可作为 derived cache，但不再是 authoritative domain model             |
| Enemy/Endgame core + overlay                | **keep as cache strategy**，先定义 neutral model，再决定 serialization            |
| `mt:{TemplateID}` atom                      | **refine**：可作 typed search atom 的兼容序列化，不是额外 domain identity         |
| per-locale manifests                        | **keep/refine**：neutral root + locale projection manifests，而不是两份业务数据库 |
| Search labels per locale                    | **keep**：SearchDocument 是 locale projection；neutral target 独立                |
| official aliases                            | **refine**：source evidence neutral，label snapshot locale-specific               |
| player aliases                              | **keep**：站点 locale metadata，中文和英文独立维护                                |
| full dual-language SSG                      | **refine**：可以生成两套 derived pages，但共享一个 neutral source                 |
| 173 CHS buckets                             | **supersede as domain identity**：它们是 CHS presentation grouping                |

## 23. Recommended target architecture

```text
Pinned TurnBasedGameData + TextMap files
              │
              ▼
Lossless raw source / typed refs / provenance
              │
              ▼
Neutral Domain Database
  Character, LightCone, Relic, Enemy, EndgameOccurrence
              │
       ┌──────┴────────┐
       ▼               ▼
TextResolver(CHS)  TextResolver(EN)
       │               │
       ▼               ▼
Localized view     Localized view
       │               │
       └──────┬────────┘
              ▼
Search projection / route view / shared components
              │
              ▼
Site Messages (Paraglide) for website-owned UI only
```

Domain model 不接受 locale；projection 接受 locale 和 context。view 可继续使用当前
component props（`name: string`, `description: string`, tokens），但这些 props 不应
反向定义 domain schema。

## 24. Recommended breaking refactor scope and migration

### Phase A — TextSource foundation, CHS-only compatibility

新增 build-only typed TextSource、locale-aware resolver、missing state 和 provenance；不
改变 URL/UI。让当前 CHS projection 生成与现有 artifacts 完全相同。保留 policy 和
protected fixtures。

### Phase B — Character / Light Cone / Relic neutralization

先把 names/descriptions/story/passives/effects 改为 refs + params；新增 view builder，
保留旧 generated view 作为 compatibility output。覆盖 1001、1224、8001–8010、LD 和
gender/nickname samples。

### Phase C — Enemy neutral model

所有 MonsterSkillConfig row 进入 neutral model；kind/tag mapping 保留；将 inclusion
policy 改为 CHS presentation bridge。验证 existence、semantic identity 和 visible card
三套结果分离。

### Phase D — Endgame identity split

先固定 occurrence/template identity，再生成 locale name groups、Search targets 和
shards。引入兼容读取层，旧 CHS `entryId` 只保留一个 release window，待所有 references
迁移后删除。

### Phase E — locale projection/cache manifests

neutral digest、locale TextMap digest、projection version 和 site-message digest 分开；
构建只生成已启用的 CHS view，英文可作为 isolated spike。

### Phase F — EN TextMap projection spike

使用同一 pinned commit 的真实 `TextMapEN.json`，比较 neutral digest、relations、numeric
fields、occurrences；只在 projection parity 达标后考虑 `/en` routing。英文不是本轮
neutralization 的前置条件。

Compatibility window 只保留一个明确版本：旧 generated schema → new view adapter。不要
长期维护两套 domain schema；删除时间点应写在 migration manifest 和 release notes。

## 25. Risks and open questions

- 部分 symbolic keys 的 source table 不是完整 TextMap Hash，需要为每种 key 建 parser
  contract；
- gender/NICKNAME 的 runtime context 尚未形成统一游戏级 contract；
- CHS-only source refs 和无描述 internal skill 需要 domain-specific presentation policy，
  不能用全局 missing rule；
- Endgame name grouping 的跨语言排序、同名合并和 search UX 仍需产品决定，但不应再
  改写 neutral occurrence identity；
- neutral model 可能增大 build-time memory；应优先测 build time、route payload、cache
  invalidation 和调试成本，而非只看 JSON 字节；
- provenance 不应随浏览器 payload 传递；必须保留 build/audit 可追溯证据。

## 26. 明确回答调查问题

1. 上游是否基本 locale-neutral？**是，核心 config 高度是；真实例外是 symbolic、GameText、参数和网站 composition。**
2. 反例？**Relic symbolic keys、GameText gender/NICKNAME/params、derived names、site aliases、Endgame name groups。**
3. 最早过早 resolve？**`localization.ts::resolveHash/resolveRef/resolveSymbolic`，生产统一入口是 `sync.ts::tr/trSymbolic`。**
4. 是否需要 TextRef/TextSource？**需要，且必须是 typed union，不是 giant `{hash}`。**
5. authoritative domain 是否接受 locale？**不应接受。**
6. Character canonical name 是否 projection？**是。**
7. Skill names/descriptions 是否只存 refs？**neutral 层只存 refs/params；tokens 属于 derived view。**
8. Enemy skills 是否全部进入 neutral？**是，config existence 与 visible card 分离。**
9. inclusion policy 是否删除？**最终删除生产依赖；短期 replace 为 CHS compatibility bridge。**
10. locale SkillCard visibility？**由 locale availability + typed presentation policy 决定，不决定 domain existence。**
11. kind/tag mapping？**保留 source-hash mapping。**
12. SpecialEffect relation？**Phase 1 已对齐，保留。**
13. 173 buckets？**CHS presentation grouping，不是 domain identity。**
14. `mt:{TemplateID}`？**可保留为兼容序列化 atom，不能当额外 authoritative entity。**
15. identity 分层？**occurrence、template、localized group、search target、shard key 各自分离。**
16. SearchDocument？**locale projection；neutral target 独立。**
17. Search labels？**按 locale label bundle 生成，aliases 留在站点 metadata。**
18. Homepage？**已接近目标，ID relationship + catalog join，保持不动。**
19. TextMap coverage？**canonical names 双语覆盖良好；技能/全表 refs 有 missing，必须按生产消费集诊断。**
20. missing vs absent？**必须建显式状态，不能继续用 `string | ''`。**
21. GameText 解析？**在 typed source + context 的 projection 层解析；避免默认 resolve string 后再 regex。**
22. projection 层？**build/prerender/server projection，浏览器只收当前 locale view。**
23. 浏览器 payload？**只发当前页面所需 view，不发完整 TextMap 或 neutral DB。**
24. full/hybrid？**都是 derived cache strategy，不是业务模型。**
25. 推荐 artifacts？**neutral root + locale view/search/shard artifacts，按 digest 失效。**
26. 体积？**当前约 182.8 MB generated、436.9 MB build；双份与 hybrid 估算只作 cache 成本上界，不能决定 domain 边界。**
27. 保留 Phase 1？**naming provenance、kind/tag mapping、SpecialEffect relation、Site Messages。**
28. temporary bridge？**CHS inclusion policy、CHS canonical snapshots、Endgame name entryId。**
29. 被 supersede？**把 173 buckets 或 name-hash entryId 当长期 identity 的结论。**
30. 下一步从哪里开始？**先做 Phase A TextSource/locale-aware resolver + CHS parity，不先做英文路由或 Endgame identity。**

## 27. Final recommendation

当前架构存在严重但边界清晰的缺陷：它把上游已经提供的 locale-neutral source refs 在
generator 早期消费掉，并将 CHS view 当成 generated domain。推荐进行必要的 breaking
pipeline refactor，但分阶段、中文兼容优先：

```text
preserve IDs/relations/source hashes
→ introduce typed TextSource and explicit states
→ generate CHS view from neutral model
→ split Endgame identity/group/search/shard
→ add EN projection using real TextMapEN
→ only then consider locale routes
```

这条路线可以在不复制数据库、不把游戏文本导入 Paraglide、不修改本轮 Site Messages
的前提下，让第三种语言成为新增 resolver/view/cache，而不是新增一套业务模型。
