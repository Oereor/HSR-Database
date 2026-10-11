# 排轴模拟器角色选择器优化与验收

日期：2026-10-11。依据 `Action-Simulator/Character-Selector-Polish-01.md` 及本次确认方案实施。本文记录本轮结果，维护时以代码及现行工程规范为准。

## 交付与使用

中文 `/game-tools/action-planner/`、英文 `/en/game-tools/action-planner/` 的左侧现为四个独立角色槽位，使用共享 `SectionHeading` 标题。点击空槽位、头像或名称打开角色选择器；搜索后点击头像选中，使用 × 移除槽位中的角色。

新增 `CharacterSlot.svelte`、`CharacterSelector.svelte`，分别负责槽位表单和原生 Dialog，避免把弹窗、数据读取和推演引擎集中在主组件中。弹窗只有一层遮罩，支持可滚动方形头像 Grid、已选标识、重复角色禁用、缺图 fallback、Esc／背景／关闭按钮及焦点恢复；每次打开清空搜索。真实浏览器验收发现并修复了 search 输入框优先消费 Esc 清空内容的问题，以及站点默认样式对原生 Dialog 居中的影响。

本轮移除了手动友方单位入口和敌人配置 UI。时间线、队列视图、事件编辑器、Preset 及引擎数学没有重构。不同 Character ID 的角色形态仍独立可选。

## 数据与资源接口

- `PlannerCharacterOption` 新增 `officialAliases`、`playerAliases` 数组；页面仍只接收 ID、本语言名称、头像 ID、可选基础速度和别名，不接收完整详情或全局搜索数据。
- 搜索 builder 生成 `views/{locale}/character-search.json`，服务端通过 `getCharacterSearch(locale)` 读取。该产物仅含角色 SearchDocument，不包含敌人、装备目录或高难目标。
- `createCharacterSearch` 直接复用共享 normalization、SearchDocument 规范化、匹配证据和排名；空查询沿用目录顺序。中文维护别名、英文官方别名继续遵循原站点语言政策，不跨语言回退。
- 数据清单新增角色搜索产物必需项；旧缓存缺失时重新生成。`data:ensure` 同步更新全局／角色搜索及对应完整性 metadata；别名修改无需重建领域数据。构建输入校验检查版本、源提交、角色目标、字段与 ID 覆盖。
- 视觉 Manifest 升至 schema 18，新增 `characters.icons`；新增 `resolveCharacterIconAsset`、`getCharacterIconUrl`，输出 URL 为 `/generated-assets/characters/icons/{AvatarID}.png`。
- 按角色目录 ID 从 StarRailRes 的 `icon/character/` 提取，使用 Sharp 生成 128×128 PNG，保持比例并保留透明背景。本轮 98 个头像全部可用；不复制上游全部角色素材。缺图被列入 Manifest missing，沿用 `AssetImage` fallback。
- 资源生成、缓存覆盖、输出目录观察、格式尺寸校验及缺图警告均纳入 icons；部署准备新增 `icon/character/` 稀疏检出路径。浏览器不直接访问上游目录或远程 CDN。

## 速度、单位身份与兼容

首次选择或更换为另一角色，同时将基础速度和面板速度初始化为真实基础速度。缺少速度则两项留空，用户需填写。之后两项独立修改，不取整；修改基础速度不会覆盖面板速度。重新点击当前角色只关闭弹窗，保留速度与单位 ID。

槽位以位置保持稳定；替换、移除后重新添加均创建新的单位 ID。数值编辑保持 ID，已有事件沿用原 ID；失效锚点及缺失目标继续保留、诊断、允许编辑或删除，不自动改绑。页面仅从当前可见友方槽位构造计划，不保留隐藏敌人状态。当前没有保存／导入入口，无持久化数据需要迁移；引擎的敌人支持保留。

## 验收结果

| 检查 | 结果 |
| --- | --- |
| 角色选择、投影、引擎、头像资源、缓存、搜索与部署准备相关 8 个 Vitest 文件 | 107 项通过 |
| 构建输入校验 Vitest | 9 项通过，包括旧缓存缺失角色搜索和非法非角色文档 |
| Playwright：5 个场景 × 桌面／移动 Chromium | 10 项通过；中文／英文、四槽 CRUD、重复禁用、别名／无结果、独立速度、重算、失效事件、队列、缺图、键盘、背景关闭、焦点恢复、无隐藏敌人 |
| `pnpm check` | 通过，独立运行 Svelte 检查 0 错误、0 警告 |
| 目标文件 Prettier、ESLint、`git diff --check` | 通过 |
| `pnpm data:ensure`、`pnpm assets:ensure` | 新缓存生成成功；后续部署准备命中缓存 |
| `pnpm data:validate:build-inputs`、`pnpm assets:verify` | 通过，新增搜索与头像纳入验证 |
| `pnpm deploy:build:preview` | 本地 preview profile 通过，包括 pinned upstream 准备、静态构建及输出 smoke；没有远程部署 |
| 修正后的 `pnpm exec vite build` | 通过；浏览器测试复用静态输出 |
| `pnpm deploy:verify:routes`、`pnpm deploy:verify` | 2184 个公开页面索引／内部链接及视觉资源引用闭包通过 |

已检查桌面和移动端编队／弹窗截图。最后的弹窗居中样式另有几何与交互复测。第一次浏览器测试暴露 Esc 问题，修复后上述 10 项全部通过；类型检查曾与构建并发生成 Paraglide 文件出现临时警告，独立复查已消除。测试没有锁定站点可变文案原文。

未运行全站单元／浏览器回归、Firefox／Safari 或远程 Vercel 检查。部署资源准备在网站内部 `.upstream/` 完成，相邻两个上游仓库未修改。Chromium 本地预览仍报告既有 Vercel Analytics 脚本 404，与本轮交互无关。

本地预览：`pnpm preview --host 127.0.0.1 --port 4173`。人工后续验收可重点检查目标设备上的头像尺寸、名称换行、Grid 滚动和 tooltip；本轮没有方案保存能力，刷新会清空方案。

最终修改仅位于 HSR-Database 的 `develop` 分支；未提交、推送、合并或发布。TurnBasedGameData 与 StarRailRes 的 Git 状态均与开工时一致，保持干净。
