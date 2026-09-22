# 《崩坏：星穹铁道》档案库

《崩坏：星穹铁道》的非官方数据资料网站。

网站主要整理正式服的角色、光锥、遗器、敌方单位与高难模式数据，采用自行推测的数据计算机制，可能与实际游戏内数据存在差别。

**在线访问：[hsrarchive.cc](https://hsrarchive.cc)**

## 功能

- 角色：基础属性、技能、行迹、星魂数据，并支持逐等级查看；同时还有光锥和遗器推荐信息。
- 光锥：基础属性、光锥效果，同样支持逐等级查看。
- 遗器：套装、部件信息与套装效果。
- 敌方单位：基础属性、弱点、抗性、技能及其他战斗信息。
- 高难模式：三路深渊（混沌回忆、虚构叙事、末日幻影），以及异相仲裁的赛期、关卡、波次与敌方实例数据。
- ……

项目仍在持续完善中。

## 技术栈

- SvelteKit
- TypeScript
- Tailwind CSS
- pnpm

网站使用静态构建，运行时不依赖其他数据仓库。

## 数据来源

项目主要使用以下两个公开仓库：

- [DimbreathBot/TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData)：游戏配置与文本数据
- [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes)：角色立绘、预览图、图标等视觉资源

它们与本项目保持为相互独立的 Git 仓库。本地开发时推荐使用如下目录结构：

```text
workspace/
├── TurnBasedGameData/
├── StarRailRes/
└── HSR-Database/
```

默认情况下，项目会从相邻目录读取两个上游仓库。

## 本地开发

环境要求：

- Node.js 22+
- pnpm 10+
- Git

准备两个上游仓库：

```bash
git clone https://github.com/DimbreathBot/TurnBasedGameData.git
git clone https://github.com/Mar-7th/StarRailRes.git
```

进入 `HSR-Database` 后安装依赖并启动开发服务器：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

默认路径配置为：

```dotenv
HSR_DATA_ROOT=../TurnBasedGameData
HSR_ASSET_ROOT=../StarRailRes
PUBLIC_SITE_URL=http://127.0.0.1:5273
```

如有需要，可复制 `.env.example` 后覆盖这些配置。

## 常用命令

| 命令                    | 用途                                   |
| ----------------------- | -------------------------------------- |
| `pnpm dev`                     | 启动开发服务器                              |
| `pnpm data:sync`               | 生成网站使用的数据                          |
| `pnpm data:validate`           | 执行完整数据语义审计（`data:validate:full` alias） |
| `pnpm data:validate:full`      | 执行完整 build-input 与 semantic validation |
| `pnpm data:validate:build-inputs` | 仅验证 Production 将消费的落盘输入完整性 |
| `pnpm assets:sync`             | 同步页面所需视觉资源                        |
| `pnpm assets:verify`           | 验证生成的视觉资源                          |
| `pnpm update:enemy-assets`     | 从 Nanoka 增量更新 tracked enemy snapshot   |
| `pnpm validate:enemy-assets`   | 离线验证 tracked enemy snapshot             |
| `pnpm check`                   | Svelte / TypeScript 检查                    |
| `pnpm lint`                    | Prettier / ESLint 检查                      |
| `pnpm test`                    | 运行 Vitest 测试                            |
| `pnpm test:e2e`                | 运行 Playwright 测试                        |
| `pnpm build`                   | 生成静态生产构建                            |
| `pnpm deploy:build`            | 使用固定 upstream 版本执行 Production 构建 |
| `pnpm deploy:build:preview`    | 执行轻量 Preview-equivalent 构建            |
| `pnpm deploy:build:production` | 显式执行 Production 构建                    |
| `pnpm ci:develop`              | 执行 develop 分支的非阻塞轻量验证           |
| `pnpm ci:validate`             | 执行 main PR 的完整 correctness contract    |
| `pnpm upstreams:update`        | 检查并更新 upstream lock                    |

`pnpm test` 和 `pnpm data:validate` 使用 prepared-workspace 模型，不会自行准备全部 generated inputs。clean pinned workspace 应使用自准备的 `pnpm ci:develop`、`pnpm ci:validate` 或 deployment profile；普通 `pnpm build` 继续使用本地 sibling upstream 的既有 `prebuild` 路径。

`data:validate:build-inputs` 是 Production orchestration 的完整性门禁，只证明 manifest、pinned source、TextMaps、artifact bytes/schema/inventory 与 build-consumer closure 自洽；它不会重新计算搜索、Endgame、角色或敌人业务语义，不能替代日常的 `pnpm data:validate`。

## 项目结构

```text
scripts/
├── data/       # 数据同步、解析、审计与验证
└── assets/     # 视觉资源同步与处理

src/
├── lib/
│   ├── components/
│   ├── domain/
│   └── generated/
└── routes/

docs/           # 数据调查与开发文档
tests/          # Vitest / Playwright 测试
```

构建生成的数据和普通视觉资源会加入 `.gitignore`。`static/generated-enemy-assets/` 是例外：它在维护时生成、由 Git 跟踪，并作为部署时不可变的 enemy visual snapshot。

## Upstream 与部署

`upstream.lock.json` 锚定 `TurnBasedGameData` 与 `StarRailRes` 的具体 commit SHA。

部署准备只 materialize 当前生成器实际消费的 81 个 TurnBased Excel 表、CHS/EN TextMap 和保守保留的动态 Config 目录；StarRailRes 的 index 与资源目录在一次 sparse checkout 中准备。普通视觉资源在 cache miss 时通过共享的有界 copy/Sharp worker pools 生成到 staging，验证后原子发布；cache hit 和 Production verifier 复用同一次最终文件树观察，但 verifier 仍独立检查 manifest、文件集合和图片 metadata。

正式部署通过：

```bash
pnpm deploy:build
```

根据 lock 获取对应版本的上游数据，再完成数据生成、资源准备与网站构建，而不是直接追踪 upstream 的最新 commit。

Enemy portraits 已随仓库 checkout 提供。Production、Preview 和 CI 只会离线验证并使用该 snapshot，不会实时请求 Nanoka；维护者通过 `pnpm update:enemy-assets` 显式检查并更新它。

项目目前使用以下分支流程：

```text
main
└── Production → hsrarchive.cc

develop
└── 活跃开发分支 / 代码同步（push 不会自动引发 Vercel preview 部署）
```

`develop` 允许直接 push；push 或可选 PR 会运行非 required 的 `Development` 检查。`develop → main` PR 则必须由完整 `Correctness` check 验证新的 merge candidate。

需要预览 `develop` 或其他分支时，在 GitHub 的 **Actions → Vercel Preview Deployment → Run workflow** 中选择对应分支并手动运行。GitHub Actions 会将所选 commit 的源码部署到 Vercel Preview，由 Vercel 使用 Preview 环境变量执行项目现有的 `pnpm deploy:build`；合并或 push 到 `main` 后，仍由 Vercel Git Integration 自动部署 Production。

首次启用手动 Preview 时，workflow 文件必须先合入仓库默认分支 `main`，之后 GitHub 才会在 Actions 页面提供 Run workflow。仓库还需在 **Settings → Secrets and variables → Actions** 中配置：

- `VERCEL_TOKEN`：来自 Vercel Account Settings 的 Tokens；
- `VERCEL_ORG_ID`：现有 Vercel team/account 的 ID；
- `VERCEL_PROJECT_ID`：现有 Vercel Project 的 ID。

后两个 ID 可从 Vercel Project Settings 获取，也可在本地仅链接现有项目后查看 `.vercel/project.json`。不要提交 token、`.vercel/`、`.env.local` 或其他本机状态。

GitHub Actions 会定期检查两个 upstream 与 Nanoka enemy snapshot 是否有更新。维护任务更新受管 metadata 和 snapshot 后，创建目标为 `develop` 的 Pull Request 交由人工审核；不会自动合并。需要页面验收时再手动部署 Preview。

### 如何添加更新日志

更新日志 Markdown 分别放在 `src/lib/content/changelog/zh-CN/` 和 `src/lib/content/changelog/en/`。每条日志需要新建两个同名 `.svx` 文件，文件名格式为 `YYYY-MM-DD-lowercase-kebab-slug.svx`，例如：

```text
zh-CN/2026-09-10-example-update.svx
en/2026-09-10-example-update.svx
```

文件名（不含扩展名）是两种语言共享的条目 ID，日期也从文件名前缀读取。文件内容格式为：

```markdown
---
title: '更新标题'
---

这里写更新内容。

可以使用 **Markdown**、`inline code`、列表和链接。
```

`title` 是本地化字段；当标题包含冒号等 YAML 特殊字符时必须加引号。无需维护额外索引，`pnpm dev`、`pnpm build` 和 `pnpm deploy:build` 会自动发现、配对并验证日志。如果正在运行的开发服务器没有发现刚创建的文件，重启 `pnpm dev` 即可。

## License 与免责声明

本站为玩家自行建立的非官方项目，与米哈游或 HoYoverse 不存在官方关联。

游戏名称、角色、图片及其他相关资产的权利归其各自权利人所有。第三方数据与视觉资源遵循其原始来源的许可条款。

仓库根目录的 MIT License 仅适用于本项目自行编写的代码，不覆盖第三方数据、图片或游戏知识产权。

## 致谢

本项目的实现离不开以下开源项目与社区服务：

- [TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData) — 提供《崩坏：星穹铁道》的游戏数据，是本站静态数据的主要来源之一。
- [StarRailRes](https://github.com/Mar-7th/StarRailRes) — 提供角色、光锥、遗器、图标等游戏资源，用于本站的本地资源展示。
- [Nanoka](https://static.nanoka.cc) — 提供 enemy visual assets；本站在维护时生成并审核 snapshot，部署不实时依赖该服务。未确认的再分发许可不因本项目的 MIT License 而获得覆盖。
- [Enka.Network](https://enka.network/) — 提供公开玩家信息查询服务，用于本站的「玩家信息 / Player Info」功能。

特别感谢以上项目及其维护者，使 HSR-Database 能够建立在稳定、开放的社区数据与资源之上。
