# Enemy Skill Details — Pre-Production Deep Cleanup

实施日期：2026-09-30。网站分支 `develop`；Node 24.21.0、pnpm 11.9.0；只读游戏数据版本 `6b2bc17ebf46`。实施前网站及两个上游仓库均干净。

## Summary

完成 parser → Monster-specific detail → projection → page model → UI → messages → tests → CSS → docs 的消费者与历史语义审计。此次仅精简内部联接、同义类型、无用导出／消息和现有测试，没有新增测试文件、测试用例、测试基础设施、产品功能或解析能力。

6 个相关 Vitest 文件由 114 项精简为 90 项，全部通过；删除 1 个历史迁移 E2E 用例，其有效候选切换断言移入已有用例。现有 desktop/mobile 浏览器回归实际运行 16 项，全部通过。

完整重生成后，5,048 个详情绑定、构建期诊断、1,264 个双语 Enemy 生成文件、代表页面模型及源码 SSR 均与清理前一致。UI 组件、DOM、CSS、当前文案、schema 47 和 changelog 没有修改。

## Deleted Technical Debt

| 类别 | 删除／精简内容 | 安全依据 |
| --- | --- | --- |
| Parser | `linkedAbility` 拼接对象、两次关联名称查询和重复 Ability 筛选；未读取的语义输入 `monsterId` | 从 CharacterConfig 一次解析名称，按原 AbilityList 顺序筛选后复用；原任务遍历、早退和收集规则保留；完整详情与诊断逐项一致 |
| Projection / page model | `EnemySkillDetailView = EnemySkillDetail` 同义别名 | 全仓库仅两个本文件字段使用，直接引用现有产品类型；页面数据一致 |
| UI | 未发现可确认的旧 full skill card、跳转组件或废弃数值行残留 | 当前三个 Skill Browser 组件均有实际职责，源码未修改 |
| CSS | 未发现需要删除的旧 anchor／jump／右对齐数值规则 | 当前 scoped selectors 有对应节点；不为了清理制造视觉或级联风险 |
| Messages | 双语 `enemy_skill_groups` | 源码、测试、消息契约及动态调用中均无消费者；编译后的 Paraglide 产物不再包含此键，剩余 413 个双语键校验通过 |
| Tests | 14 个旧 reviewed 存在性样本、SSR 重复 locale 矩阵／空对象／缺 tag 强转、重复 projection 样本及历史 duration／召唤／弹射迁移检查 | 详见下表；数值、目标、绑定和交互的有效保护保留 |
| Comments | 缺 tag 类型强转测试的旧降级解释；去除生产 fixture 中已无意义的输入字段 | 生产契约仍要求 tag；仅移除不符合该契约的测试，组件原有 fallback 未修改 |
| Docs | 8 份旧阶段报告可能被误当作当前规范的问题 | 顶部增加简短历史说明及当前架构／Phase 4／UI Round 1 链接，正文保留 |
| Imports / exports | `normalizeEnemySkillMultipliers` 的测试专用转导出；无人导入的 `SkillSemanticSource` 类型导出 | 测试直接从伤害模块导入 helper；类型留在语义模块内部；实际使用的诊断类型转导出保留 |

### 测试删除依据与剩余保护

| 精简项 | 原检查的不足 | 保留的保护 |
| --- | --- | --- |
| Parser reviewed 矩阵，53 → 39 项 | 只检查是否存在伤害；部分重复精确 fixture，其他仅锁定旧白名单覆盖状态，没有验证正确倍率／target | 真实 Monster override、直接伤害、AQAAAAQR、横扫／标记、全部要求的代表样本；合成表达式拒绝和局部边界测试 |
| SSR，22 → 12 项 | 整套概率、行动和空事实逻辑重复运行两种 locale；`{}` 重复空数组输入；缺 tag 用例通过强转绕过必填契约 | 双语混合伤害组；有／无 target 概率；命名 application 关联；行动分组与顺序；缺 detail、空数组、不可展示概率；native button 图标槽、header metadata |
| SSR shared-chance collapse 断言 | 重复 helper 的数值折叠逻辑 | 现有 formatter 测试验证相同概率折叠及不明确概率过滤；E2E 的 `300305101` 保留单行、匿名概率输出检查 |
| SSR 旧 class 与旧 ARIA role 的缺席断言 | 固定历史实现的删除结果 | 当前 native button、`aria-pressed`、真实 icon slot、浏览器 accessible name／焦点／键盘检查 |
| Projection 重复 Monster／表达式样本及重复行动提前断言 | 在同一纯搬运路径重复不同 parser 数值，未增加投影风险保护 | 双语同一 shared definition 下的 Monster override；Kafka 无 Status ID 概率与行动提前；多值／无 target、目标角色、名称本地化、引用错误与一般召唤 |
| Projection duration 和迁移空事实样本 | duration 已无生产类型／解析路径；部分空事实重复其他层保护 | 现有无 detail 页面、精确产品形状、payload 安全边界及 parser 无支持数值场景 |
| E2E 旧技能召唤／弹射迁移用例与 duration 导航 | 重复 parser 的“不发布支持范围之外的详情”及其他空区检查；多次页面导航只验证历史字段不存在 | 保留 ExtraEffect／空事实、一般召唤路由、真实阶段／Monster 切换；`600% / 4,200%` 和 `1,050%` 原断言移到已有候选用例 |

不固定用户维护的站点文案。SSR 的本地化断言继续使用当前 message resolver；数值字符串属于本功能的有效契约。

## Refactors

- `enemy-skill-semantics.ts` 直接读取 `character.SkillAbilityList`／`character.SkillList`，将同一关联 Ability 数组传给原 Chance／行动变化遍历和伤害收集器。保留 Predicate 跳过、conditional 标记、行动变化条件规则及原无任务早退。
- 语义解析仅接收实际消费的输入；具体 Monster 参数仍由构建器求出，结果仍以 `(MonsterID, SkillID)` 存储，诊断回调仍携带两种 ID。
- 页面 binding 和完整技能 view 直接使用 `EnemySkillDetail`，不增加中间模型或 raw config 暴露。
- 两个 parser 测试名称改为当前“共享收集器”和“无支持数值事实”的语义；已有 E2E 候选用例合并原跨 Ability 切换检查。

## Explicitly Preserved

- **数值正确性与覆盖**：固定值、AQAR 和严格 AQAAAAQR；缺 DynamicHash、非 SkillParam 来源、非法索引、畸形数值、未知 opcode、非攻击力伤害和负伤害的拒绝规则均保留。没有增加 opcode、VM 或 coverage。
- **局部聚合**：两个不同职责的遍历保留。伤害遍历处理 candidate、Retarget、局部数组及聚合边界；Chance／行动变化遍历保留自己的 conditional 规则。它们仅共享 Ability 联接，不合并为通用运行时遍历器。
- **Target**：仍可缺失，不猜 primary，不显示未知目标；审核过的标记映射仍是目标知识，不恢复数值许可白名单。
- **Base Chance**：可无 Status ID，保留名称投影和可见关联过滤。状态索引的 StatusType 资格检查和重复 ModifierName 处理仍有实际用途，未误删为旧 status card 模型。
- **Projection 边界**：`projectSkillDetail` 仍承担 status name 本地化和公开字段组装；中立域与本地化类型继续分开，浏览器不理解 Ability／Task／Predicate。
- **General summon**：EnemySummonReference、Monster summon relation、CompactEntityCard 和原召唤测试保留；官方类型标签里的 Bounce／Summon 不属于废弃 structured detail。
- **UI / CSS**：selection ownership、Monster-change handling、phase fallback、共享精确百分比 formatter、三个现行组件及 subgrid application wrapper 都有消费者；没有建立通用 metadata 框架。520px／820px breakpoint、34rem 数值宽度、固定 icon slot 和 selected styling 原样保留。
- **文档**：研究调查、V2 各阶段和最新两份报告全部保留。仅给 Phase 1、Phase 2A／2B／2C、V2 Phase 1／2／3 和 Phase 4A 调查增加历史说明。当前中文“数值详情”“伤害倍率”和英文文案以代码为准，未按历史报告改写。

## Behavior Equivalence

在仓库忽略目录中使用一次性工具，对改动前后相同上游重新解析并比较；比较完成后删除工具、基线、临时浏览器观察结果及截图。

| 比较对象 | 结果 |
| --- | --- |
| 全量已发布详情 | 2,083 个 Monster、5,048 个 binding 的字段值、顺序及存在性完全一致 |
| 伤害覆盖 | 4,778 个有伤害 binding，前后相同；完整详情比较同时保护有／无 target 分组 |
| 构建期诊断 | 2,838 条伤害／概率诊断的 ID、reason 和顺序完全一致 |
| Generated Enemy output | zh-CN／en 各 632 个 Enemy 文件，共 1,264 个 SHA-256 完全一致 |
| Page model / default selection | 11 个代表 Enemy × 两种 locale，共 22 个页面及初始 selection 完全一致，包含 Monster 绑定、一般召唤及无 detail 页面 |
| Source SSR | 22 个 Skill Browser 输出和 164 个技能详情 HTML 清理前后完全一致 |
| Production static output | 22 个默认技能 article 与对应源码 SSR 一致；仅去除 hydration 注释后比较，默认技能 ID 也一致 |
| Public payload | 全量解析详情、代表页面模型及 22 个静态 `__data.json` 未发现 totals／duration 或 raw Ability、Predicate、Callback、DynamicHashes、ReadInfo、PostfixExpr、ModifierName、Task、诊断等字段 |
| UI / mobile / i18n | 现有浏览器用例验证两种 locale、1440／900／390／320px、紧凑数值列、无目标跨列、窄屏堆叠、长文本、icon slot、header、selection、phase／Monster change 与键盘焦点；四张截图均已视觉核查 |

代表 fixture 还按本次请求的期望逐项独立核对：

| Monster / Skill | 保持结果 |
| --- | --- |
| `1022010/102201001` | primary 300%；行动延后 50% |
| `2004010/200401001` | primary 250%；基础概率 100% |
| `2004010/200401002` | primary 900%；adjacent 200% |
| `2004010/200401004` | 基础概率 120%；行动提前 100% |
| `2034010/203401001` | primary 200%，不重复等值分支 |
| `4014018/401401801` | primary 120% / 240% |
| `4014018/401401802` | 无 target，90% / 110% / 180% / 220% |
| `4014012/401401201` | primary 220%，仅保留可靠部分 |
| `4064012/406401204` | primary 600% / 4200%，不合并为 4800% |
| `8003050/800305004` | primary 450%，不按循环次数放大 |

## Validation

| 检查 | 实际结果 |
| --- | --- |
| Vitest、parser fixtures、SSR、selection / formatting、双语 projection | 6 文件 90 项通过；基线为同 6 文件 114 项通过 |
| 数据同步 | `node --import tsx scripts/data/sync.ts` 通过，重生成后 1,264 个 Enemy 文件无变化 |
| 完整数据验证 | `node --import tsx scripts/data/validate-full.ts` 通过，包括 build-input 重开校验、双语结构 parity 和 English 审计；2,143 个 artifact、1,090 条 route |
| `pnpm check` | 实际命令通过；413 个双语消息，Svelte 0 errors / 0 warnings，scripts/API TypeScript 通过 |
| Prettier / ESLint | 改动源码、测试与 JSON 的定向检查通过；仓库 `.prettierignore` 明确忽略 Markdown，报告与历史说明按手工维护规则审阅，未声称 Markdown 通过自动格式检查 |
| Production build | `pnpm build` 通过；data/assets cache hit，2,744 项 benchmark 验证通过，adapter-static 写入 `build` |
| 双语 static checks | 22 个默认技能 HTML、selection 和 wire payload 检查通过 |
| Playwright | 现有 Enemy Detail 的 8 个相关用例 × desktop/mobile，共 16 项通过，30.6s；单 worker、零重试、复用生产构建；包含一般召唤及页面溢出保护 |
| 临时浏览器观察 | 首页及四个中文／英文 desktop/mobile 场景加载正常，零 pageerror、零 overlay、零页面溢出；截图实际查看 |
| Git diff / hygiene | `git diff --check` 通过；没有 UI/CSS、changelog、两个上游仓库或无关 tracked 文件变化；临时文件已移除，preview 已停止 |

Vitest 与 Playwright 使用仓库已有 Node 依赖入口；规划阶段 `pnpm exec vitest` 的命令解析失败，Node 入口已验证可用，本轮未安装依赖。Playwright 首次调用误用不存在的 `--output-dir` 参数，未执行测试；改用 `--output` 后上述正式运行全部通过，没有重试失败产品用例。

agent-browser CLI 不在当前 PATH，使用已有 Playwright 执行浏览器验证和一次性运行时观察。没有历史 `127.0.0.1:4173` bind 失败。preview 的 `/_vercel/insights/script.js` 404 仍存在，服务器日志确认它属于本地 Analytics 资源，未当作本次技能回归或零 console error。

数据验证沿用既有缺失／fallback 与 13 条弱点抗性冲突提示，以及 533 个中文 TextHash 缺失警告，最终校验通过。此次没有修改这些上游数据，也没有扩大到无关修复。

## Remaining Debt

没有发现必须在上线前修复的本功能回归。未支持表达式与未知数值继续省略；Chance／行动变化和伤害具有不同保守规则，不能仅为减少遍历而统一。历史研究全文仍描述当时规则，应结合新增历史说明阅读。可能存在更大范围的共享类型或遍历抽象机会，本次没有进行高风险重写。

最终只保留清理 diff 和本报告；未提交、推送、合并、远程部署或修改 changelog。Production 发布由用户检查 diff 和本地 Preview 后决定。
