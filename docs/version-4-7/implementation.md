# HSR-Database v4.7 实施记录

更新日期：2026-11-11。分支：`develop`。依据：[数据调查](investigation.md)及用户确认的实施方案；调查中的旧建议不覆盖后续产品决策。

## 数据来源与生成

固定游戏数据提交为 `fe44559408d9f53700a5c236edfb64c3122d9449`，版本 `OSPRODWin4.7.0_D17128178_A17108910_L17088526`。资源提交保持 `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。Manifest schema 从 64 升至 65，并更新与新 pin 匹配的首页 4.6 基线快照。

新增配置同时进入角色加载器、生成数据清单、Domain 子集及部署物化清单。固定 `.upstream` 来源已生成中文及英文产物，包含 99 个角色、172 个光锥、64 套遗器及 665 个敌人。首次本地物化通过只读访问相邻仓库的 Git 对象完成；正常部署仍使用既有固定提交下载及稀疏物化流程，不依赖相邻目录。

## 架构决策与功能

- `SkillAha` 使用独立的 `elation-ascension` 类别，标题来自 ExtraEffect `10015111`；`SkillAeon` 归入 talent。阿哈 `151104`、`151131` 各自保留等级和 progression，仓库技沿用原管线。
- SeriesSkill 通过实际外键构建，保留 9 个角色、18 条条件记录。E0/E2 是阿哈外部条件预览，不进入普通技能升级和训练费用。升格卡复用已有 Variant、DescriptionText、数值高亮和 ExtraEffects。
- 新增 `series-skill-link` 关系，通过有限跨角色索引投影。源关系保留 9 项及顺序，汇总展示 8 项，包括阿哈自身；仅展示开拓者 `8010`，使用 Catalog 的完整命途名称、女性视觉资源及本地化详情链接。此前“星 / Stelle”的专用名称决定已由本轮 UI 修正取代。
- 阿哈升格卡按钮按当前 E0/E2 打开汇总；普通 E2 的宏生成固定 E2 的交互 Token。两个入口复用 Dialog，内联入口不修改卡片选择。未知宏保留明确诊断，不向页面输出原始语法。
- 阿哈使用独立 `elation-aha` 布局。Point23 与普攻、战技、终结技、天赋、忆灵技、忆灵天赋、欢愉技使用相同的技能节点语义。训练分类保持免费默认解锁，固定等级 1、不可切换、不收取材料；玩家 API 缺失该节点时也不推断为未激活。原连线保持不变。
- 奇缘星魂独立存于 `exEidolons`，身份为 `ex-rank:{avatarId}:{id}`，不与普通 E1 或技能 ID 混同。景元、丹恒•饮月、黄泉的卡片位于普通六星魂之后。说明、参数、ExtraEffects 和技能关系来自真实字段。
- 奇缘图标路径保留在 Neutral，首版使用缺图 fallback，不借用普通 E1 图标。资料浏览不显示玩家激活结论；玩家数据缺少可信字段时显示未激活，并在内部保留 `source=missing`。接口可独立接受未来的可信激活状态。

## 版本迁移的必要配套更新

完整生成暴露了评分来源摘要及搜索清单的版本约束。这些是新增角色引起的迁移阻断，与 SeriesSkill/ExRank 解析分别处理。

对比旧 4.6 与固定 4.7 的八张评分来源表：主副词条偏好及普通推荐表仅新增 `1511`，既有记录不变；两张基础值表及 LD 推荐表不变；角色配置中的已有角色仅变化 `SubAvatarTypeList`、`SkillList`，评分使用的身份及命途不变。人工例外所涉及的 `1505`、`1506` 偏好及推荐记录逐条核对无变化。因此保留例外条目及原审批来源，仅更新经核对的来源摘要和依据记录。

新增角色使正式评分分布覆盖从 2744 增至 2772。使用现有生成器、原 N/K/seed、257 点表示及误差门禁重新生成；未降低校验门槛。迁移前备份保存在忽略的 `data/audit/v4.7-migration-backup/`。官方名称快照按正常命令更新，玩家别名仅增加阿哈空条目，保留既有人工内容。

首次完整 CI 在敌方图片快照的目录指纹校验处停止。4.7 增加了 33 个敌方模板，使用既有 `pnpm update:enemy-assets --curl` 更新受跟踪快照：覆盖 665 个模板，其中 642 个有可用图片、23 个按原缺图机制处理；复用 424 张图片，新增 16 张，无既有映射变化。来源版本为 Nanoka 4.7，不修改敌方业务模型或快照校验规则。

完整单元测试还暴露了独立的上游变化：部分混沌回忆赛期以 `GlobalScheduleID` 引用全局排期。增加真实外键解析并保留双重引用报错后，1034、1035 恢复已有排期。历史赛期 1014 的 `291014` 同时提供 `2024-06-24 04:00:00` 与 `2024-06-19 06:00:00` 两个结束时间，缺少优先级证据；生成器记录 `conflicting-schedule-boundary` 审计诊断，UI 保持排期未知。未选择或改写日期。

移除特殊能量测试对 `GridFightFrontSpecialSP.RoleID` 后缀的推断，直接比较 `AvatarUltraSkillConfig` 的全部真实角色与生成结果；补入阿哈覆盖。王棋 11 的新增单波次、敌方出现次数增加及旧 `description` 字段断言仅更新相关测试，不扩大业务重构。

## 验证记录

- 真实 4.7 角色 Domain：99 个角色成功，新增触发键及 Point23 原阻断已解除。
- 初始技能树与角色描述测试：23 项通过；模型、训练与玩家状态相关测试：42 项通过；宏、描述和组件相关测试：35 项通过。
- TypeScript/Svelte/API 检查通过，Svelte 无错误及警告。
- 增加原始来源语义验证，逐语言比较 SeriesSkill 条件、顺序、正文以及 ExRank 身份、名称、参数化描述、ExtraEffects、技能关系，并检查宏泄漏。
- 迁移修复后的五个定向测试文件：201 项通过。
- 最终 `pnpm ci:validate` 的完整生成校验、资源验证、搜索清单、TypeScript/Svelte/API、lint 及 95 个单元测试文件全部通过，共 1185 项测试。
- 生产构建的 SSR 转换及客户端打包完成后，Vite 子进程以 Windows 原生异常 `3221225477`（`0xC0000005`）退出，未返回可定位的业务代码错误。统一 CI 因此未全程通过，后续产物 smoke、资源闭包及路由检查没有运行。按仓库外部工具失败纪律停止重试该构建路径。
- 浏览器使用仓库现有本地开发服务器测试配置。新增 10 项加既有特殊效果 Dialog 的桌面/移动端 2 项，最终分批全部通过：E0/E2 更新、禁止空选择、普通等级及训练费用不变、8 角色汇总、两个入口的状态隔离、键盘触发、焦点恢复和导航关闭；三个奇缘卡的身份、缺图及资料/玩家状态区分；Point23 在玩家 API 缺失时保持固定默认技能语义。
- 首轮浏览器测试的两项开发服务冷启动超时在预热后通过；单选组件使用 `aria-checked`，修正新测试误用 `aria-pressed` 的断言后，四项阿哈完整交互通过。测试文件最终 ESLint/Prettier 检查通过。浏览器结果不能视作生产产物验收。

首次 Vitest 在沙箱临时缓存重命名时遇到 EPERM；按权限流程重跑后通过，未将环境错误记作业务测试失败。

## UI/UX 细节修正（2026-11-11）

本轮仅调整 UI、展示文案及 presentation logic，不变更数据 Schema、SeriesSkill/ExRank/技能树模型或养成算法。

- 技能卡标题栏只为 `availableLevels.length > 1` 的 progression 显示等级控件；仅存在多个可升级 progression 时显示技能名称区分标签。所有 progression 继续参与 Variant 等级解析。阿哈天赋保留一个正常控件，固定「阿哈正传」仍独立展示正文；玩家模式保留正常技能的只读等级及缺失状态。
- 养成 presentation 移除 `variantLabel`，直接使用类别等级标签或既有联合标签。阿哈只有一个付费天赋目标；Point23 继续保留独立默认节点，不生成控件，不增加费用，目标 key、等级范围及费用映射不变。
- 特殊效果关系名称统一经过 `GameText`，保留 `<unbreak>` 的不换行语义。开拓者名称复用 Catalog 完整投影，阿哈汇总显示「开拓者·欢愉」，头像及跳转使用 `8010`；原始 `8009` 关系和展示去重不变。原有关系 helper 的开拓者简称覆盖同步移除，女性头像映射继续保留。
- 头像与名称仍在同一个链接中。名称默认正常文字色，hover 和键盘 focus-visible 使用主题金色，无下划线并保留可见焦点环；通过局部 Tailwind 类处理既有样式优先级。
- 汇总按钮移至升格卡标题后，使用紧凑 ghost Button，仅实际存在对应汇总关系时提供入口。标题区和控件允许窄屏换行，选中效果使用金色强调。
- 卡片与 Dialog 共用“普通效果 / 强化效果”（英文“Normal Effects / Enhanced Effects”），仍映射 Level 1/2。E2 内联“查看强化效果”继续固定打开 Level 2，不修改卡片选择。

验证结果：

- `pnpm check`、`pnpm lint` 通过，Svelte 检查无错误和警告；中英文消息成对编译通过，共 428 项。
- `training-detail-view`、`character-preview` 定向单元测试共 106 项通过；特殊效果关系展示 helper 定向测试 1 项通过。
- 浏览器定向验证共 10 项通过：阿哈中英文桌面/移动端 4 项、玩家模式桌面/移动端 2 项、普通技能标题栏及原有特殊效果 Dialog 桌面/移动端 4 项。覆盖独立 Variant、单一天赋控件、养成标签和费用、8 角色汇总、完整名称及 8010 资源/导航、效果切换和内联 E2 状态隔离、键盘访问及焦点恢复。
- 在中英文 1440px 与 320px 视口核对布局及截图，无横向溢出。实际样式检查确认选中效果金色背景/文字、角色链接 hover/focus-visible 金色与无下划线，以及银狼名称中的 `999` 不换行。截图位于忽略目录 `data/audit/v4.7-ui/`。

本轮使用固定 4.7 数据和本地开发服务器，未重新生成评分基线，未运行完整生产构建。上文记录的 Vite 原生崩溃及后续生产验证待办仍然保留，定向浏览器结果不替代生产产物验收。

## 主要修改入口

| 范围 | 文件 |
| --- | --- |
| 表加载、生成及物化 | `scripts/data/character-sources.ts`、`scripts/data/source-requirements.ts`、`scripts/data/sync.ts` |
| 中立模型与实际外键 | `src/lib/domain/neutral.ts`、`scripts/data/domain/character.ts`、`scripts/data/domain/character-extensions.ts` |
| 投影、宏及校验 | `scripts/data/projection/character.ts`、`scripts/data/localization.ts`、`scripts/data/validation/character-extensions.ts`、`src/lib/domain/types.ts` |
| 卡片及共享 Dialog | `src/lib/components/character/SkillCardPanel.svelte`、`EidolonCard.svelte`、`SpecialEffectDialog.svelte`、`src/lib/components/shared/DescriptionText.svelte`、`DetailPage.svelte` |
| Point23 与玩家状态 | `data/skill-tree-layouts/elation-aha.json`、`src/lib/domain/training/skill-tree-layout.ts`、`src/lib/player/character.ts` |
| 固定来源与迁移配套 | `upstream.lock.json`、`data/homepage/`、`data/relic-score/v2/`、`data/search/`、`static/generated-enemy-assets/`、`scripts/data/endgame.ts` |
| 定向验证 | `tests/unit/version-4-7.test.ts`、`tests/unit/skill-tree-layouts.test.ts`、`tests/e2e/version-4-7.spec.ts` |

## 提交与遗留事项

- `05ca2f8`：4.7 数据入口、技能分类及阿哈专属树。
- `3077ed5`：SeriesSkill/ExRank 模型、投影、文本宏及 UI。
- `4e31962`：固定免费技能的玩家状态、外部条件预览状态及浏览器交互验证。
- 版本 pin、生成基线、必要排期修复及验收记录随本记录所在的迁移提交交付。所有提交均保留在本地，未 push。

玩家 API 的真实奇缘激活字段尚无可信来源；当前未激活是展示策略。奇缘专属图标、独立插画、3D、视频及 Ability 执行逻辑不在实现范围。`NJNDLOFDBHB` 的语义仍未知，不用于计算。

当前资源 pin 缺少阿哈等 56 项资源，按既有机制使用 fallback；敌方快照另有 23 个不可用条目。来源文本审计保留 114 条缺失 TextHash 和 13 个敌方弱点/抗性冲突。历史赛期 1014 的时间冲突保持显式诊断和未知排期。

生产验证待办：在可正常完成 Vite 构建的环境运行 `pnpm ci:validate`；成功后设置 `PLAYWRIGHT_REUSE_BUILD=1`，对生产预览执行 `tests/e2e/version-4-7.spec.ts` 的桌面和移动端项目。不得将开发服务器交互结果替代这些尚未完成的检查。
