# 《崩坏：星穹铁道》档案库

《崩坏：星穹铁道》的非官方数据资料网站。

网站主要整理正式服的角色、光锥、遗器、敌方单位与高难模式数据，采用自行推测的数据计算机制，可能与实际游戏内数据存在差别。

**在线访问：[hsrarchive.cc](https://hsrarchive.cc)**

## 功能

* 角色：基础属性、技能、行迹、星魂数据，并支持逐等级查看；同时还有光锥和遗器推荐信息。
* 光锥：基础属性、光锥效果，同样支持逐等级查看。
* 遗器：套装、部件信息与套装效果。
* 敌方单位：基础属性、弱点、抗性、技能及其他战斗信息。
* 高难模式：三路深渊（混沌回忆、虚构叙事、末日幻影），以及异相仲裁的赛期、关卡、波次与敌方实例数据。
* ……

项目仍在持续完善中。

## 技术栈

* SvelteKit
* TypeScript
* Tailwind CSS
* pnpm

网站使用静态构建，运行时不依赖其他数据仓库。

## 数据来源

项目主要使用以下两个公开仓库：

* [DimbreathBot/TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData)：游戏配置与文本数据
* [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes)：角色立绘、预览图、图标等视觉资源

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

* Node.js 22+
* pnpm 10+
* Git

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

| 命令                      | 用途                       |
| ----------------------- | ------------------------ |
| `pnpm dev`              | 启动开发服务器                  |
| `pnpm data:sync`        | 生成网站使用的数据                |
| `pnpm data:validate`    | 验证生成数据                   |
| `pnpm assets:sync`      | 同步页面所需视觉资源               |
| `pnpm assets:verify`    | 验证生成的视觉资源                |
| `pnpm check`            | Svelte / TypeScript 检查   |
| `pnpm lint`             | Prettier / ESLint 检查     |
| `pnpm test`             | 运行 Vitest 测试             |
| `pnpm test:e2e`         | 运行 Playwright 测试         |
| `pnpm build`            | 生成静态生产构建                 |
| `pnpm deploy:build`     | 使用固定 upstream 版本执行完整部署构建 |
| `pnpm upstreams:update` | 检查并更新 upstream lock      |

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

构建生成的数据和视觉资源会加入 `.gitignore`。

## Upstream 与部署

`upstream.lock.json` 锚定 `TurnBasedGameData` 与 `StarRailRes` 的具体 commit SHA。

正式部署通过：

```bash
pnpm deploy:build
```

根据 lock 获取对应版本的上游数据，再完成数据生成、资源准备与网站构建，而不是直接追踪 upstream 的最新 commit。

项目目前使用以下分支流程：

```text
main
└── Production → hsrarchive.cc

develop
└── Development / Vercel Preview
```

GitHub Actions 会定期检查两个 upstream 是否有更新。发现新版本后，自动更新 `upstream.lock.json`、执行完整构建验证，并创建目标为 `develop` 的 Pull Request，交由人工审核与 Vercel Preview 验证。

## License 与免责声明

本站为玩家自行建立的非官方项目，与米哈游或 HoYoverse 不存在官方关联。

游戏名称、角色、图片及其他相关资产的权利归其各自权利人所有。第三方数据与视觉资源遵循其原始来源的许可条款。

仓库根目录的 MIT License 仅适用于本项目自行编写的代码，不覆盖第三方数据、图片或游戏知识产权。