# Issue #45：真实玩家详情页返回交互

日期：2026-10-17。实施分支：`develop`。

## 来源与返回规则

玩家信息页的支援角色、星海同行卡片共用 `playerCharacterHref`，现在生成包含 `uid`、可选 `build` 和 `from=player` 的详情链接。普通角色、光锥列表不增加来源标记。

`resolveDetailBackTarget(category, searchParams, locale)` 是无状态的纯函数。仅角色详情存在唯一的 `from=player`，且既有 UID 解析器确认唯一、有效的 UID 时，才通过 `playerPageHref` 返回该玩家页面。其他情况回到详情所属分类列表，包括没有来源、未知或重复来源、无效或重复 UID，以及所有光锥详情。

来源只接受固定值，不接受任意返回 URL，不使用 `history.back()`、全局状态或额外存储。玩家数据请求失败、加载中或角色未公开，不影响有效来源对应的返回地址。

URL 来源与玩家数据参数分离：单独携带 `uid` 或 `build` 的旧链接、普通列表链接和直接访问仍返回分类列表。复制的带 `from=player` 链接会保留明确的玩家返回上下文；该标记表示链接上下文，不是对浏览器实际访问历史的认证。

## 刷新、本地化与页面兼容

共享 `DetailPage` 在静态预渲染时使用分类列表 fallback，挂载后根据当前页面 URL 响应式计算返回目标，不缓存上一次角色或 UID。来源参数随刷新、浏览器前进后退保留；现有语言切换链接保留查询参数，返回目标使用当前 locale 与既有本地化、trailing slash 工具生成。中文为 `/player/?uid=...`，英文为 `/en/player/?uid=...`。

左上角继续使用原生 `.back-link` 锚点与现有样式。列表返回复用原列表消息，玩家返回复用 `player_character_back_to_player`，不新增或删除消息 Key。

Hero 的 `PlayerCharacterContextNotice` 删除重复链接与无用的 `playerPageHref` 导入，保留 UID Prop、UID 展示、所有状态提示及 `aria-live="polite"`。没有调整 Hero 布局或其他详情区域。

玩家角色中的光锥链接继续只携带 `level`、`rank`；光锥详情返回光锥列表，不传播玩家来源，不引入导航栈。原有 `uid`、`build` 的玩家数据选择逻辑保持不变。

## 修改文件

- `src/lib/player/resolve.ts`：玩家卡片来源标记、返回目标纯函数。
- `src/lib/components/shared/DetailPage.svelte`：响应式返回目标与对应本地化文案。
- `src/lib/components/player/PlayerCharacterContextNotice.svelte`：移除 Hero 内链接。
- `tests/unit/player-resolvers.test.ts`：双语决策、参数异常、安全 fallback、不同 UID 与 build 保留。
- `tests/e2e/player-character.spec.ts`：普通列表、直接访问、刷新、历史、UID 切换、语言切换、键盘返回、Hero 状态与光锥参数。
- `tests/e2e/player.spec.ts`：更新支援角色链接的来源参数断言。
- 本报告。现行开发流程与权威架构没有变化，无须修改相关指南。

## 验证结果

- `pnpm exec vitest run tests/unit/player-resolvers.test.ts tests/unit/navigation.test.ts`：2 个文件、51 项测试通过。调查阶段曾被沙箱临时目录 `rename` 的 `EPERM` 阻止；本次经受审查的沙箱外执行后通过。
- `pnpm messages:check`：425 个消息、2 种语言校验及编译通过。
- `pnpm exec svelte-kit sync` 和 `pnpm exec svelte-check --tsconfig ./tsconfig.json`：通过，0 errors、0 warnings。
- 所有受影响源码与测试文件的 ESLint、Prettier 定向检查通过；`git diff --check` 通过。
- 使用现有 Playwright 配置、Mock 和 localhost Vite 开发服务，在桌面及移动 Chromium 中分组完成 20 个相关用例。首次运行有 4 个历史导航用例因测试误选旧玩家卡片或隐藏移动导航失败；收紧页面等待、普通卡片定位并操作移动菜单后，4 个定向重跑全部通过。补充 URL 等待断言的 4 个列表/直接访问用例也重新验证通过。未对展示文案增加精确断言。
- 浏览器首次启动时服务未就绪，原配置触发默认 prebuild，已立即终止；正式验证设置 `PLAYWRIGHT_REUSE_BUILD=1`，复用已就绪的开发服务，不使用旧生产构建作为验收依据。未完成生产构建、全量数据验证或远程部署。
- 未更改路由定义或静态路由清单；查询参数与双语导航由纯函数及浏览器测试覆盖，未额外运行生产路由输出构建。

浏览器命令：

```powershell
# 先启动并等待终端显示 ready，再运行下方测试；不执行 predev 或 prebuild。
pnpm exec vite dev --host 127.0.0.1 --port 4173 --strictPort
# 在另一个终端：
$env:PLAYWRIGHT_REUSE_BUILD = '1'
pnpm exec playwright test tests/e2e/player-character.spec.ts tests/e2e/player.spec.ts --project=desktop-chromium --project=mobile-chromium --grep 'detail back navigation|reuses the Player cache|keeps static detail|padding stable while loading|submitting a UID|preserves locale' --retries=0 --workers=2 --reporter=line
```

## 本地人工验收

自动测试使用 Mock，尚未调用真实 Enka 玩家 API。建议用两个有公开角色的真实 UID，在中英文分别确认：

1. 从支援角色或星海同行卡片进入详情，刷新、前进后退、切换语言后，左上角仍能回到同一玩家；Hero 展示 UID 和状态且没有重复链接。
2. 从普通角色、光锥列表进入详情，使用鼠标或键盘激活左上角返回；直接打开带 UID 但没有来源标记的链接仍返回角色列表。
3. 从玩家角色打开光锥，等级与叠影保持正确，左上角返回光锥列表。

最终交付保留未提交的本地差异；不 Commit、Push、创建 PR、部署或修改 Issue。两个上游仓库保持只读并核对工作区状态。
