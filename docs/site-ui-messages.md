# 站点 UI 消息维护

本文件说明现行站点消息操作。locale 与数据所有权以[权威架构](architecture/localization-and-data-generation.md)为准；早期仅中文阶段保留在[Phase 1 历史报告](investigations/i18n-l10n-phase1-implementation.md)。

## 所有权与语言选择

网站自有导航、控制、标题、metadata、错误和无障碍标签使用成对的 [zh-CN 消息](../messages/zh-CN.json)与 [en 消息](../messages/en.json)。
游戏名称、描述、故事和机制仍由匹配语言的 pinned TextMap，经 TextResolver / GameText 投影到生成视图；不要把它们搬入 UI 字典。

中文使用无前缀 URL，英文使用 `/en/`。Paraglide 策略为 `url` 与 `baseLocale`，SvelteKit reroute 复用同一路由树，服务端 middleware 将解析结果写入 `event.locals.locale`。
调用方传入该页面的 locale，语言切换使用普通链接；不增加 mutable locale store、cookie 或浏览器语言检测/重定向，也不做跨语言 TextMap 回退。
页面链接通过 [routing helpers](../src/lib/i18n/routing.ts)保持 locale、尾斜杠、查询和 hash。

## 编辑与新增消息

1. 在两个字典维护相同语义 key 的完整句子；只共享相同产品上下文，不按片段拼句。
2. 两种语言使用相同的插值参数集合。例如 `overview_page_count` 使用 `currentPage` 与 `pages`，参数由调用方提供。
3. [contracts.json](../messages/contracts.json)保护已列入契约的 key 与参数接口，不保存翻译。新增需要稳定接口保护的 key 时登记参数；修改或删除既有契约时一起审阅消费者。
4. 直接调用生成函数，并显式传入页面 locale：

   ```ts
   m.overview_page_count({ currentPage, pages }, { locale });
   ```

5. 运行 `pnpm messages:check`，确认双语 key、参数与编译通过；涉及组件或脚本调用接口时追加对应 type check 和定向测试，改变路由或构建行为时才追加相关构建验证。

不要使用 `t(string)`、optional message calls 或自建中文 fallback。新增 key 要符合现有语义命名格式，并在删除时检查源码、测试、契约及动态消费者。

## 配置与编译

[project.inlang/settings.json](../project.inlang/settings.json)记录 `zh-CN` base locale 和 `zh-CN` / `en` 两种语言；[paraglide.config.ts](../paraglide.config.ts)记录编译策略。
Paraglide 固定为 2.25.0，message-format plugin 固定为 4.4.0，从本地已安装包加载，不依赖编译时 CDN。

`pnpm messages:compile` 与 `pnpm messages:check` 当前调用同一个校验编译入口；后者也会写入忽略的编译产物。
校验拒绝重复 key、缺少契约 key、无效消息、双语 key 集合差异和参数形状差异，不锁定可变文案原文。
`pnpm check`、scripts 检查与 deployment profile 都会先准备消息；Vite 开发流程也验证并监听消息变化。

`src/lib/paraglide/` 和 inlang cache 是忽略的编译输出，不手工修改。
UI 消息变化不进入游戏数据或普通资源 manifest；游戏数据投影仍有各自的验证契约。

## 验证与历史资料

测试保护 key/参数、locale 选择、路由、结构、fallback 和交互，不把用户维护的站点文案或导航顺序固定为历史快照。
游戏技能分类、角色命名、敌人按语言描述决定展示等规则，以[架构 Ownership rules](architecture/localization-and-data-generation.md#ownership-rules)及对应源码为准。

双语启用过程见 [R6 验收](audits/i18n-l10n-r6-english-product-enablement.md)；该报告中的版本、数量和测试结果属于当时记录。
通用环境和验证选择见[开发指南](development.md)。
