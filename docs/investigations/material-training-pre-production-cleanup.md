# Material / Training Pre-Production Cleanup

日期：2026-10-09（Asia/Shanghai）。仓库：HSR-Database；分支：develop。

## 1. Executive Summary

已完成全仓入口、引用、消息、组件样式及测试契约审计，清理能够证明无用途的养成展示接口和重复状态，修复当前 schema 与产品范围的旧断言，更新权威文档并新增中英文发布日志。没有改动游戏费用规则、DAG、生成 schema、路由、依赖或已验收的视觉设计。

全仓 Prettier 和 ESLint、完整数据语义验证、一般及敌方资产验证、消息与更新日志校验、API TypeScript 检查通过。独立 Node 检查验证了 108 套 Profile、864 个等级目标及 loader 缓存/重试。124 个 Svelte 组件的 client/server 编译通过，没有警告。

**Release Readiness：NO-GO。** 全项目静态检查仍有 814 个诊断；Vitest 在执行断言前被缓存 rename EPERM 阻断；pnpm CI 启动失败；本次新 Vite 构建被依赖 realpath EPERM 阻断。没有执行浏览器回归，不能把编译或独立断言等同于全仓测试通过，也不能认定所有静态诊断均为环境问题。

## 2. Scope and Baseline

| 项目 | 本次基线 |
| --- | --- |
| 网站 HEAD | `8af4dadd7285bd2ecf3f8dec605a30371075c771` |
| 分支 / 起始工作区 | `develop` / 干净 |
| Node / pnpm | `24.21.0` / `11.9.0` |
| TurnBasedGameData pinned HEAD | `724b139d8c9c32d12552eb95745a4fee72bfe48b` |
| StarRailRes pinned HEAD | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` |
| 两个上游工作区 | 起始及最终均干净，HEAD 不变 |
| 代理 | Windows Internet Settings：已启用 `127.0.0.1:7890`；CI 尝试使用进程级 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY，没有改全局设置 |

已阅读附件、AGENTS、README、规范性架构、Item/Material 调查、Slices A/B、人工验收修复、Receipt UI、Preview/Training 分离、Toast、Item Modal 报告，以及已有 code hygiene、generated data、CI/test hygiene 报告。历史报告仅作为当时的证据，不重写其结论。

审计范围包括 `src/`、`scripts/`、`api/`、`tests/`、消息、配置及 CI 入口。调查脚本、日志和中间统计仅写入忽略的 `data/audit/`。没有执行 upstream 更新、依赖升级、commit、push、PR、合并或部署。

## 3. Dead Code Audit

- 对 519 个受 Git 跟踪的源码、消息、测试及 workflow 文件建立符号/消息引用候选；另对所有受跟踪的 TS/JS/Svelte/SVX 文件检查字符串 import 关系，并补核根配置、CLI 和文档入口。
- 无普通 import 的部署/data/assets 命令均有 package scripts 或 orchestration 消费者，保留。`search-performance.ts` 有 `docs/search-v2.md` 的显式手工入口，保留。
- Changelog SVX 通过 glob 发现；SvelteKit 的 `reroute`、`trailingSlash`、路由及 API 文件属于隐式入口，保留。`validateChangelogFiles` 被根 Vite 配置消费，保留。
- 124 个组件的初次 Svelte 编译没有未使用 CSS/props 警告。未发现足以证明整个生产文件可删除的候选，因此没有为了减少文件数删除组件或脚本。
- 29 个与 Site Message 值相同的测试字符串候选已复核，涉及 raw enum、合成 fixture 或真实游戏文本；没有将字符串碰撞直接认定为可变生产文案契约。

机器候选和人工入口核对分别见本地 `pre-production-candidates.json`、`pre-production-import-graph.json`、`pre-production-test-copy-audit.json`；候选搜索本身不构成删除证明。

## 4. Removed Obsolete Code

| 清理项 | 证据 / 结果 |
| --- | --- |
| 19 个消息 key，各删除中英文一条 | 非生成源码、脚本、测试、根消息 contracts 无消费者；无动态消息索引调用 |
| 重复客户端 mounted 标志 | 两个 boolean 仅由同一 onMount 同时设为 true；统一为 `clientReady`，SSR 门控保留 |
| 独立 selectedItemId | 始终与 selectedMaterial 同时设置/清空；改用 `selectedMaterial.id`，版本、上下文和焦点保护保留 |
| 费用组两个空 slot | 所有生产调用均为 self-closing，没有内容消费者 |
| 两个费用组旧 class 钩子 | 无生产 CSS 消费，仅浏览器测试使用；测试改用已有 `data-training-expense` |
| 两处 training 数据强制断言 | 使用已验证数据的 `avatarId` 字段收窄联合类型，不改变 loader 验证 |

删除消息清单：

`error_category_not_found`、`error_record_not_found`、`error_endgame_mode_not_found`、`error_endgame_period_not_found`、`endgame_local_stage_label`、`endgame_king_piece_ruinous`、`endgame_king_piece_standard`、`training_target_level`、`training_skill_clamped`、`training_trace_count`、`training_exp_materials`、`training_required_exp`、`training_supplied_exp`、`training_overflow_exp`、`training_exp_credits`、`training_strategy_note`、`training_promotion_credits`、`training_skill_credits`、`training_trace_credits`。

未删除生产文件、函数、组件、测试文件或 fixture；未新增绕过检查的 skip/only。

## 5. Training / Item Domain Cleanup

保留 Material / Cost / Target / Presentation 分层，Catalog 的身份字段与 Detail Metadata 的可选文本没有合并。纯费用算法、材料集合、成本分片与 manifest schema 51 不变。

保留 Preview canonical key、加载前 pending 编辑、Profile 默认工厂、请求版本、失败重试、真实 PrePoint 边、祖先补齐与后继取消。`bindings.displayLevels` 是有效预览数据，继续保留；EXP 明细虽然不再展示，仍是有效计算结果。loader 的 schema 验证和 Catalog 闭合验证分别承担不同职责，其缓存失败清理分支保留。

Modal 的选中身份只保留一个事实来源；关闭/切换仍递增请求版本，迟到响应不能覆盖当前身份或重新打开弹窗。焦点恢复继续检查版本、关闭状态和触发元素连接状态。Player 与静态训练请求仍独立。

## 6. Stale Test Audit

| 分类 | 本次处理 |
| --- | --- |
| Stale Assertion | 两处 schema 48 改为当前 51；旧“禁止所有材料组件”的 invariant 更新为有限材料详情允许、独立物品路由/敌人掉落仍禁止 |
| Obsolete Test | 未发现可以安全删除的完整测试；删除数量 0 |
| Real Regression | 未在已完成的独立验证中发现；框架和浏览器受阻，不能据此宣称全站无回归 |
| Duplicated Coverage | 保留已有有效算法/交互覆盖，没有增加重复的浏览器或 snapshot 基线 |
| Flaky / Race | 保留已有延迟加载、重试、Profile、Modal 与 Toast 生命周期用例，尚未运行浏览器确认 |
| Environment Failure | 定向 Vitest 8 个 suite 在 SSR 缓存 rename EPERM 处失败，0 项断言执行 |
| Unresolved | 全项目 TypeScript/Svelte 的依赖导出与插件诊断；待完整依赖环境复验后逐项归因 |

## 7. CI and Test Repairs

数据缓存测试现在明确要求共享 training、所有角色/光锥分片和双语 Material Catalog/Detail 进入 manifest，同时保留独立 artifact 验证。旧缓存拒绝覆盖保留 schema 46，并扩展到 48/49/50。另一处真实生成数据测试的 schema 断言同步为 51。

产品范围 invariant 不再拒绝已授权的 MaterialCostList 或材料文案，继续拒绝独立 `/items` 入口、item domain kind 和 `detail.drops`，并检查文件系统未新增 items 路由。

Training E2E 的费用定位从无样式用途的旧 class 改为已有费用类别数据标识，金额、去重、Preview 独立等断言保留。总计修改 3 个单元测试文件和 1 个 E2E 文件；没有删除测试。

现有 CI 配置符合当前分支约定：develop 使用 Development，面向 main 的 PR 使用完整 Correctness 和复用新构建的 smoke。没有修改 workflow、重试次数、检查范围或错误策略。

## 8. TypeScript / Svelte Cleanup

仅对 training loader 返回的已验证联合类型使用字段收窄，移除两处数据强制断言；未通过放宽 strict、忽略测试、添加 any 或改变模块解析来隐藏诊断。

初次完整检查为 814 errors / 0 warnings / 62 个问题文件。中途新增 parameterized cache case 的回调出现一个隐式 any，已给出真实的 `number` 参数类型；最终完整检查仍为 **814 errors / 0 warnings / 62 个问题文件**。不能将这 814 个诊断认定为已全部修复或全部确定为环境问题。

TypeScript resolveModuleName 在当前依赖路径不能解析 `playwright/test`、`@vitest/runner`、`rolldown`。对应测试导出缺失、推导类型和 Vite plugin hook 诊断仍需在正常 pnpm 依赖环境复验；未移除这些合法消费者。scripts 检查失败，诊断位于现有 Search performance 工具；API TypeScript 检查通过。

## 9. CSS and Presentation Cleanup

没有删除正在使用的 CSS 规则、媒体查询或动画。仅删除费用组无 CSS 消费的两个 class 钩子及空 slot，不改变容器、标题、材料 Cell、Toast、Divider、Modal、图标、稀有度或布局。

最终 124 个 Svelte 组件各编译 client/server，共 248 次编译，无警告；这证明源码编译有效，不证明真实 DOM、键盘、响应式或视觉验收通过。

## 10. Documentation Updates

- AGENTS 明确授权有限材料信息与 Item Detail Modal，保留完整图鉴、库存、合成、获取来源和独立路由的排除边界。
- README 补充已实现功能、格式化边界、smoke/组件命令及新构建复用顺序；旧的 81 表数量改为由共享 source registry 决定，当前 registry 实测为 91 表。
- 规范性架构移除不存在的 `entries.ts` 引用，说明文件名 ID/日期、title frontmatter、glob 发现及成对验证。
- 历史调查与实施报告没有修改。

## 11. Full Repository Formatting

`pnpm format` 在启动器 realpath EPERM 处失败，未进入 Prettier。随后使用仓库已安装的 `node node_modules/prettier/bin/prettier.cjs --write .` 完成同一 package script 的等价操作，没有安装新工具或更改 ignore。

全仓匹配文件格式检查通过。语义改动文件中 4 个文件被格式化重新排版；其余匹配文件保持原格式。**纯格式化独占文件数量为 0**，没有人为扩大 diff。Markdown、SVX、锁文件、生成数据、Paraglide、缓存与上游均保持既有排除边界。

格式化前 diff 与文件内容保存于忽略的 `pre-production-before-format.diff/json`；分类见 `pre-production-change-classification.json`。最终针对回调类型补正的单文件格式检查也通过。

## 12. Full Validation Results

下列命令均在 HSR-Database 根目录执行。pnpm 启动受阻后，能独立运行的检查使用同版本本地 Node CLI；这不等同于完整 CI 链通过。详细日志保存在忽略的 `data/audit/pre-production-*.log`。

| 验证项目 / 实际命令 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm check`（规划阶段） | Blocked by Environment | realpath EPERM；未执行静态检查 |
| `node --import tsx` 调用 compileSiteMessages / validateChangelogFiles | Passed | 432 条消息、双语 parity；全部日志源配对/编译/元数据有效 |
| `node node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json --output machine` | Failed | 最终 814 errors / 0 warnings / 62 个问题文件 |
| `node node_modules/typescript/bin/tsc -p tsconfig.scripts.json --noEmit` | Failed | Search performance 的 Playwright 导出解析及推导类型诊断 |
| `node node_modules/typescript/bin/tsc -p tsconfig.api.json --noEmit` | Passed | 无诊断 |
| `pnpm format` | Blocked by Environment | 启动器 realpath EPERM |
| `node node_modules/prettier/bin/prettier.cjs --write .` | Passed | 完成全仓匹配文件格式化 |
| `node node_modules/prettier/bin/prettier.cjs --check .` | Passed | 全仓匹配文件格式正确 |
| `node node_modules/eslint/bin/eslint.js .` | Passed | 无诊断；与 package lint 的 ESLint 部分一致 |
| `node node_modules/vitest/vitest.mjs run` 加八个定向文件 `--reporter=dot` | Blocked by Environment | data-cache、data、invariants、training-core、training-detail-view、training-presentation、material-details、training-loaders；8 suites，0 项断言 |
| 全仓 Vitest | Not Run | 同一框架路径已明确受阻，未重复启动 |
| `node --import tsx data/audit/pre-production-invariants.mjs` | Passed | 独立 Node assert；108 Profiles / 864 targets、共享 progression、永久修正、DAG、双语集合、cache/retry、rarity；不计作 Vitest |
| `node --import tsx scripts/data/validate-full.ts` | Passed | 包含独立 build-input、完整语义、双语结构与 training/detail 验证 |
| `node --import tsx scripts/assets/verify.ts` | Passed | 当前已生成一般资产独立验证 |
| `node --import tsx scripts/assets/enemies/validate.ts` | Passed | 当前 tracked enemy snapshot 离线验证 |
| `pnpm ci:validate` | Blocked by Environment | 启动器 realpath EPERM，未进入任何 orchestration 阶段 |
| `node node_modules/vite/bin/vite.js build` | Blocked by Environment | 新构建失败，依赖 realpath EPERM；没有成功产物 |
| E2E Smoke / Full E2E | Not Run | 没有本次修改后的可用新构建 |
| 组件级 Playwright | Not Run | Vite 工具路径受阻，未改配置绕过或另开服务器 |
| 全组件及新 SVX client/server 编译 | Passed | 248 次组件编译、4 次新日志编译；英文日志无 CJK |
| `git diff --check` / 边界核对 | Passed | 无空白错误；依赖、锁、路由、workflow、上游均未修改 |

Vitest、pnpm、Vite 的明确权限失败后没有反复重试相同测试/构建命令，没有更换框架或缓存配置。完整数据校验与资产验证各运行一次，后续没有改变其输入，未重复昂贵检查。

## 13. Build and Artifact Verification

完整 validator 独立重开当前 pinned raw、TextMaps 和生成文件，验证 2,416 个数据 artifacts、397,677,612 bytes、1,090 个 locale-neutral route identities；养成语义覆盖 98 个角色、170 个光锥、140 个材料及双语 Catalog/Detail。两种语言各 1,153 条搜索记录，191 个英文 Endgame shards。

一般资产验证覆盖 2,416 个文件、126,511,478 bytes 及独立图片 metadata；敌方 snapshot 覆盖 609 个映射、23 个明确 unavailable、212 张图片，含 metadata 总计 214 个文件、16,401,822 bytes。未修改或更新这些资产。

数据/资产生成字段未改，没有新增载荷或数据体积变化的实现来源。现有生成产物通过完整校验，但本次 Vite 在 SSR 转换 899 个模块后，client 子构建因 SvelteKit internal/node 与 Vite module-runner 的 realpath EPERM 失败。**未取得成功的新静态站点，因此新构建的图片/JSON 引用闭包、静态页面路由输出及干净环境自准备仍未验证。** 没有使用旧 build 的体积或路由统计冒充本次发布证据。

## 14. Browser Regression Results

本次实际浏览器测试数量为 0。没有启动旧 Preview、复用旧 build、部署远程 Preview 或调用其他浏览器绕过。

正常环境补验顺序：停止占用 4173/4175 的旧测试服务器；执行 `pnpm ci:validate` 并确认成功；设置 `PLAYWRIGHT_REUSE_BUILD=1`；执行 smoke、完整 desktop/mobile E2E、组件测试。没有成功构建时停止浏览器步骤。

人工重点包括：Preview 与费用互不影响；Lv.80→60→80 的培养值不恢复；1510 共享节点只计费一次；三月七共享前置的取消/补齐；Profile、路由和语言切换；Toast 重复失败及清除；Modal 懒加载、快速关闭/重选、Esc/遮罩、焦点恢复、滚动锁、缺图与重试；Player 只读；中英文/桌面/手机；Search、Endgame、导航及新旧 Changelog 加载。

## 15. zh-CN / en Changelog

- `src/lib/content/changelog/zh-CN/2026-10-09-training-calculator.svx`：全新养成计算功能。
- `src/lib/content/changelog/en/2026-10-09-training-calculator.svx`：Character & Light Cone Progression Calculator。

日志描述角色/光锥养成计算、角色技能与行迹目标、材料/信用点实时汇总、独立技能预览和 Item Details，未宣称库存抵扣、合成、获取来源或实机完整经验喂养模拟。文件身份唯一、title frontmatter 有效、全部历史日志配对正常；两份新日志 client/server 编译通过，英文无中文回退内容。真实页面渲染尚待浏览器补验。

## 16. Known Remaining Issues

1. pnpm 运行路径 realpath EPERM、Vitest 临时缓存 rename EPERM 和 Vite 依赖 realpath EPERM 阻断发布工具链。需要在支持完整依赖路径与缓存文件操作的正常开发/CI 环境复验；本轮未改变系统权限、pnpm 管理设置或工具配置。
2. 814 个 Svelte/TypeScript 诊断仍未全部完成正确性归因。依赖解析存在可复现异常，但不能据此 blanket 豁免插件、测试或 scripts 检查；正常环境仍失败时应逐项修复后再发布。
3. 完整单元测试、新构建输出闭包与路由、双语桌面/手机 E2E、组件浏览器验收及新日志页面渲染未完成。
4. 完整数据 validator 保留现有 533 条 CHS missing TextHash 记录，以及已分类的可选缺文与 13 个敌方弱点/抗性冲突诊断。校验通过，没有删除这些审计或伪造来源文本。

## 17. Release Readiness Assessment

**NO-GO：当前不建议合并到 Production。** 源码清理和能够独立运行的校验已完成，但必要的完整静态检查未通过，测试框架和新构建没有成功，重要浏览器正确性风险仍未验证。不能仅凭用户之前的人工验收或独立 Node assert 给出 GO。

转为 GO 的条件：正常环境中 `pnpm ci:validate` 全链通过；基于该次新构建的 E2E smoke 通过；本次关键训练/Modal/Player、双语与响应式交互完成回归；其余 best-effort 项目逐项报告。若届时仅剩已明确、可控的环境性补验缺口，再独立评估 CONDITIONAL GO。

## 18. Changed File Summary

最终 14 个交付文件：3 份当前权威文档、2 份消息 catalog、2 个生产组件、3 个单元测试、1 个 E2E、2 份新日志和本报告。纯格式独占文件 0；语义文件内发生格式重排的文件 4。

可靠清理统计：dead code 文件删除 0、函数/组件删除 0、obsolete tests 删除 0；删除 19 对消息（38 条记录）、净减少 2 个状态变量、删除 2 个空插槽和 2 个无样式 class 钩子、移除 2 处数据强制断言。修复 3 个旧单元断言，并扩展旧 schema 拒绝及训练/详情 artifact 覆盖；E2E 的有效费用断言保留。静态错误最终与起始同为 814，不宣称实现了全仓绿色 CI。

最终 diff 已复核。没有上游、生成文件、dependency/lock、workflow、路由或游戏计算规则的 tracked 修改；没有削弱数据校验、删除覆盖或留下未经解释的批量语义变更。所有修改保持未提交状态，交付后等待用户验收与合并授权。
