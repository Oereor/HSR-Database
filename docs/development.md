# 开发与维护指南

本指南提供现行操作入口。产品与数据边界见[权威架构](architecture/localization-and-data-generation.md)，仓库操作遵守 [AGENTS.md](../AGENTS.md)。

## 环境与目录

使用 Node.js 24.x（[.nvmrc](../.nvmrc) 为 `24`）、pnpm 11.9.0（支持 `>=11.9.0 <12`）及 Git。
安装前检查 `node --version`、`pnpm --version`，使用锁文件安装，不顺带升级依赖。
Vite 固定为 8.3.1，采用默认浏览器目标；版本对齐的历史依据见[工具链验收](investigations/runtime-toolchain-alignment-2026-09-27.md)。

```text
workspace/
├── TurnBasedGameData/  # 结构化游戏数据及 CHS/EN TextMap，只读
├── StarRailRes/        # 视觉资源，只读
└── HSR-Database/       # 网站，develop 分支
```

两个上游是独立 Git 仓库，不是子模块。默认从相邻路径读取，只提取网站需要的配置与资源。
新的本地环境需要先准备两个上游；其来源见[项目 README](../README.md#数据来源与致谢)。
本地 sibling 开发源与部署 pin 是两种入口：部署 profile 会在网站内部 `.upstream/` 准备锁定 SHA，不切换相邻仓库。

## 环境变量与启动

| 变量              | 用途与默认值                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `HSR_DATA_ROOT`   | 脚本游戏数据根目录，默认 `../TurnBasedGameData`                      |
| `HSR_ASSET_ROOT`  | 脚本视觉资源根目录，默认 `../StarRailRes`                            |
| `PUBLIC_SITE_URL` | 页面站点 URL、sitemap 与 robots 的绝对地址基础，应与访问 origin 一致 |

[.env.example](../.env.example) 提供变量参考，本地环境文件不要提交。
当前示例的站点 URL 为 `http://127.0.0.1:5273`，而 [Vite 配置](../vite.config.ts)的开发默认地址是 `http://127.0.0.1:4174`；使用默认端口时在本地覆盖站点 URL。
数据/资源脚本与读取站点 URL 的服务端代码使用进程环境。按下例在 shell 中设置，不假定独立 TypeScript 脚本会自行加载 `.env.local`。

```powershell
$env:HSR_DATA_ROOT = '../TurnBasedGameData'
$env:HSR_ASSET_ROOT = '../StarRailRes'
$env:PUBLIC_SITE_URL = 'http://127.0.0.1:4174'
pnpm install --frozen-lockfile
pnpm dev
```

`predev` 自动执行 `data:ensure` 与 `assets:ensure`，准备或复用生成数据和普通资源；启动后以终端实际地址为准。
这些准备步骤不刷新 tracked enemy snapshot。需要离线核对时运行 `pnpm validate:enemy-assets`。

联网操作先确认代理端口，再配置进程代理变量；本地通常使用 7890，以 [AGENTS.md](../AGENTS.md#internet-connectivity) 为准。
不要把代理、私有路径、token 或本地 `.vercel/` 状态提交到仓库。

## 常用命令与生成产物

命令定义见 [package.json](../package.json)。按需要选择，不把下表作为每次修改的完整检查清单。

| 命令                                      | 用途                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm preview`               | 本地开发 / 查看已存在的静态 build                                               |
| `pnpm data:ensure` / `pnpm data:sync`     | 按身份复用或生成 / 显式重新生成网站数据                                         |
| `pnpm data:validate`                      | 完整输入与业务语义审计，等同 `data:validate:full`                               |
| `pnpm data:validate:build-inputs`         | 独立检查落盘输入、身份、bytes/schema/inventory 及消费者闭包，不重新计算业务语义 |
| `pnpm assets:ensure` / `pnpm assets:sync` | 准备或复用 / 显式同步普通视觉资源                                               |
| `pnpm assets:verify`                      | 验证普通视觉资源 manifest、文件集合与图片 metadata                              |
| `pnpm validate:enemy-assets`              | 离线验证 tracked enemy snapshot                                                 |
| `pnpm check`                              | 消息校验编译、Svelte、scripts 与 API TypeScript 检查                            |
| `pnpm lint`                               | 按现有 ignore 执行 Prettier 与 ESLint 检查                                      |
| `pnpm test`                               | 运行 Vitest；优先用 `pnpm exec vitest run <相关测试文件>` 做定向验证            |
| `pnpm test:components`                    | 组件浏览器测试                                                                  |
| `pnpm test:e2e` / `pnpm test:e2e:smoke`   | 桌面/移动 E2E / 发布门禁 smoke                                                  |
| `pnpm build`                              | 使用本地数据源，经 prebuild 准备数据、资源与评分 Benchmark 校验，再生成静态站点 |
| `pnpm ci:develop` / `pnpm ci:validate`    | 自准备 pinned 输入的轻量开发验证 / 完整 correctness 验证                        |

数据生成结果主要位于 `src/lib/generated/`、`static/generated/`，普通视觉资源位于 `src/lib/generated-assets/`、`static/generated-assets/`；这些目录的生成内容被忽略。
`static/generated-enemy-assets/` 是例外：它是受 Git 跟踪的维护快照，构建只离线消费。
正式评分 Benchmark 与维护输入遵守[遗器评分专题](relic-score-feature/README.md)的独立契约，不能手工改写或混用历史产物。

独立 `pnpm test` 与 `pnpm data:validate` 不自行准备全部 generated inputs。新克隆、pin 更新或发布边界使用自准备的 CI profile；已有工作区的定向测试按其实际依赖准备。
生成失败不能用旧 build 作为新改动的验收证据。Windows 下清理或重生成前停止同仓库 dev/preview，避免文件发布冲突。

## 验证策略

按 [AGENTS.md 的验证约束](../AGENTS.md#verification-discipline)选择最小有效检查：逻辑用定向单元测试，数据处理用相关 validator，浏览器交互或路由用相关浏览器测试。
完整数据验证与 Production 的 build-input integrity 不是同一证明；后者不能替代语义审计。
不要锁定可变站点文案或 changelog 文字；保护结构、参数、locale、数据和交互契约。

纯文档修改检查 Markdown 格式、内部链接、显式引用及 `git diff --check`，不要求生成、生产构建或 E2E。
仓库 `.prettierignore` 排除了 Markdown；单独检查文档时可使用 `pnpm exec prettier --ignore-path .gitignore --check <文档路径>`，只处理目标文件，保留历史报告排版。
`pnpm format` 是全仓写入命令，不作为定向维护的默认步骤。

发布边界的 `pnpm ci:validate` 已涵盖完整数据、资源、type/lint/unit、静态构建及输出验证，不重复执行其子门禁。
GitHub main PR 随后复用 build 执行 smoke；本地复用方式见[部署指南](vercel-deployment-foundation.md#本地验证与清理)。
远端部署只按明确需要执行，纯文档整理不触发 Preview 或 Production。

## 专题操作入口

- 部署、CI、upstream 更新、enemy snapshot 更新：[部署与 CI](vercel-deployment-foundation.md)。
- 官方名称刷新与人工别名：[搜索维护](search-v2.md)。
- 中英文 UI 消息：[站点消息](site-ui-messages.md)。
- Profile 审核与 Benchmark 生成：[遗器评分维护](relic-score-feature/README.md)。
- 敌人技能解析与数值解释：[敌人技能专题](enemy-skill-details/README.md)。
- 可选本地私有 Enka 验收：既有[本地 mock 报告的启动步骤](investigations/player-local-enka-mock.md#入口与安全)。默认关闭，使用 loopback，不提交玩家原文；后文结果是历史验收，不能视为本次验证。

## 中英文 changelog

在 `src/lib/content/changelog/zh-CN/` 与 `src/lib/content/changelog/en/` 新建两个同名 `.svx` 文件：

```text
zh-CN/YYYY-MM-DD-lowercase-kebab-slug.svx
en/YYYY-MM-DD-lowercase-kebab-slug.svx
```

文件名（不含扩展名）提供共享 ID，前缀提供有效 ISO 日期；每份 frontmatter 提供本语言非空标题：

```markdown
---
title: '更新标题'
---

这里写本语言的更新内容，可使用 Markdown、列表和链接。
```

标题包含冒号等 YAML 特殊字符时加引号。不要维护额外索引或只添加一种语言。
现有 Vite 插件在 dev/build 中发现并验证日期、重复 ID、标题与语言配对；deployment profile 也经过同一 Vite 构建。
开发服务器未发现新文件时重启。契约见[架构的 Changelog workflow](architecture/localization-and-data-generation.md#changelog-workflow)。
