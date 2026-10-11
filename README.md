# 《崩坏：星穹铁道》档案库 · HSR-Database

《崩坏：星穹铁道》的非官方数据资料网站，整理游戏正式服数据，并提供玩家的公开信息查询功能。

**在线访问：[hsrarchive.cc](https://hsrarchive.cc)**

支持 **简体中文（zh-CN）与英文（en）**。
项目持续完善中，部分数据为自行推断获得，可能与游戏实际表现不同。

## 核心功能

- **角色与光锥**：基础属性、逐等级技能与效果、行迹、星魂及装备推荐。
- **遗器与评分**：套装、部件及效果；对玩家配装提供遗器评分。
- **敌方单位**：属性、弱点、抗性、技能与部分数值详情。
- **高难模式**：混沌回忆、虚构叙事、末日幻影与异相仲裁的赛期、关卡、波次及敌方实例。
- **玩家信息**：通过 UID 查询玩家公开展示的角色、光锥、遗器与面板信息。
- **站内搜索**：在统一的入口处搜索角色、光锥、遗器、敌方单位、关卡与赛期等数据。

## 技术栈

SvelteKit / Svelte、TypeScript、Vite、Tailwind CSS、Paraglide、FlexSearch 与 pnpm。

资料页面为静态构建，无需实时依赖上游的数据仓库。
玩家公开信息由 Vercel 原生 `/api/player/` Function 查询 Enka.Network。

## 快速本地启动

需要 **Node.js 24.x、pnpm 11.9.0 与 Git**。两个上游与网站保持独立仓库，按以下目录准备：

```text
workspace/
├── TurnBasedGameData/
├── StarRailRes/
└── HSR-Database/
```

在 `HSR-Database/` 的 `develop` 分支执行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

默认开发地址为 `http://127.0.0.1:4174`，以终端输出为准。
自定义路径、站点 URL 和代理配置见[开发指南](docs/development.md#环境变量与启动)。

## 文档

从[文档导航](docs/README.md)进入架构、部署 CI、搜索与专题维护指南。
使用 Agent 辅助开发时，仓库修改与验证约束见 [AGENTS.md](AGENTS.md)；详细实施与历史测量保存在 `docs/`。

## 数据来源与致谢

- [TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData)：本站主要的游戏数据来源。
- [StarRailRes](https://github.com/Mar-7th/StarRailRes)：角色、光锥、遗器与图标等视觉资源。
- [nanoka.cc](https://static.nanoka.cc)：敌方单位视觉资源，维护为仓库内快照。
- [Enka.Network](https://enka.network/)：玩家公开信息查询服务。

特别感谢以上项目、社区服务及其维护者。

## License 与免责声明

本项目自行编写的代码及配套文档采用 [MIT License](LICENSE)。
MIT **不覆盖第三方游戏数据、图片及游戏知识产权**；第三方内容遵循原始来源的许可，权利归各自权利人所有。

本站与米哈游或 HoYoverse 无官方关联。资料、配置推导及评分仅供玩家参考，不保证与游戏内结果完全一致。
