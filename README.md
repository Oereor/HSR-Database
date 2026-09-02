# 《崩坏：星穹铁道》档案库

《崩坏：星穹铁道》非官方静态数据资料库，使用 SvelteKit、TypeScript 和 Tailwind CSS 构建。

## 基础功能

- 查看角色的各项数据，包括基础属性（生命值，攻击力，防御力，速度），技能组，行迹，以及星魂。
- 角色等级、行迹等级均可单独配置。
- 提供简易的光锥、遗器、敌方单位信息。
- 提供混沌回忆、虚构叙事、末日幻影和异相仲裁的赛期、关卡、波次、弱点与实际敌方实例资料。
- 更多功能正在开发中……

## 仓库布局

```text
workspace/
├── TurnBasedGameData/   # 只读上游数据仓库
├── StarRailRes/         # 只读视觉资源仓库
└── HSR-Database/        # 本网站仓库
```

三个 Git 仓库应保持相互独立。不建议在父目录初始化 Git，或是把数据仓库改为 submodule 或 subtree。

## 环境要求

- Node.js 22 或更高
- pnpm 10 或更高
- Git

## 获取项目与上游仓库

本仓库不包含构建时生成的数据、审计结果或图片。如果 fork 本仓库，请一并 fork 两个上游仓库，形成如下项目结构：

```text
workspace/
├── HSR-Database/
├── TurnBasedGameData/
└── StarRailRes/
```

```bash
git clone https://github.com/<your-username>/HSR-Database.git
git clone https://github.com/DimbreathBot/TurnBasedGameData.git
git clone https://github.com/Mar-7th/StarRailRes.git
```

本项目中，两个上游仓库只作为数据源，在开发过程中可以（且建议）保持只读状态。

## 本地安装与运行

```bash
cd HSR-Database
pnpm install --frozen-lockfile
pnpm data:audit
pnpm data:sync
pnpm data:validate
pnpm assets:sync
pnpm assets:verify
pnpm dev
```

默认配置已内置于脚本；需要覆盖路径或站点 URL 时，请按示例配置环境变量：

```powershell
Copy-Item .env.example .env
```

Linux/macOS：

```bash
cp .env.example .env
```

`.env.example` 默认使用：

```dotenv
HSR_DATA_ROOT=../TurnBasedGameData
HSR_ASSET_ROOT=../StarRailRes
PUBLIC_SITE_URL=http://127.0.0.1:5273
```

也可以把 `HSR_DATA_ROOT`、`HSR_ASSET_ROOT` 改为其他绝对或相对路径。

### 可选：精简检出上游仓库

在目前的项目进度中，只使用 `StarRailRes` 中被页面引用的 index、preview/portrait、遗器资源、语义图标和七张导航图标。fork 时如需精简项目体积，可只检出这些资源：

```bash
git clone --filter=blob:none --no-checkout https://github.com/Oereor/StarRailRes.git StarRailRes
git -C StarRailRes sparse-checkout init --cone
git -C StarRailRes sparse-checkout set index_new/cn/characters.json index_new/cn/light_cones.json index_new/cn/relic_sets.json index_new/cn/relics.json index_new/cn/properties.json image/character_preview image/character_portrait image/light_cone_preview image/light_cone_portrait icon/relic icon/property icon/element icon/path icon/sign
git -C StarRailRes checkout b95e75c7e1273d819d20c530c0b7e13a3ef19fb4
```

当前数据管线需要 `TurnBasedGameData` 中的 `ExcelOutput`、`TextMap` 与敌人机制配置所在的 `Config`：

```bash
git clone --filter=blob:none --no-checkout https://github.com/Oereor/TurnBasedGameData.git TurnBasedGameData
git -C TurnBasedGameData sparse-checkout init --cone
git -C TurnBasedGameData sparse-checkout set ExcelOutput TextMap Config
git -C TurnBasedGameData checkout 648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7
```

### Windows PowerShell 找不到 pnpm 的问题

本机未安装 pnpm 时，可使用不受 PowerShell 脚本策略影响的命令安装：

```powershell
npm.cmd install --global pnpm@11.9.0
```

安装后重新打开终端。如果 PowerShell 提示 `pnpm.ps1` 被执行策略禁止，请直接使用同目录的安全可执行入口：

```powershell
pnpm.cmd --version
pnpm.cmd dev -- --open
```

也可以在“命令提示符”中直接使用 `pnpm`；无需为运行本项目降低 PowerShell 的执行策略。

## 常用命令

| 命令                       | 用途                                              |
| -------------------------- | ------------------------------------------------- |
| `pnpm data:audit`          | 刷新生成数据并输出主键、关系和 A/B/C/D 缺失审计   |
| `pnpm data:sync`           | 生成简中目录、详情、Endgame 数据与来源 metadata   |
| `pnpm data:validate`       | 验证目录、关系、精确战斗属性、详情和搜索索引      |
| `pnpm debug:pf-hp`         | 重用生产 resolver 输出 PF HP sanity scan 与 trace |
| `pnpm assets:sync:enemies` | 手动准备 Endgame 本地敌人立绘；不会随构建自动联网 |
| `pnpm assets:sync`         | 同步并优化当前页面需要的四类视觉资源              |
| `pnpm assets:ensure`       | 按 schema、commit 和需求集合检查资源缓存          |
| `pnpm assets:verify`       | 验证资源映射、manifest、格式、尺寸和生成文件      |
| `pnpm assets:validate`     | `assets:verify` 的兼容命令                        |
| `pnpm assets:clean`        | 仅清理网站仓库内的生成视觉资源                    |
| `pnpm dev`                 | 启动开发服务器，必要时自动同步                    |
| `pnpm check`               | Svelte 与 TypeScript 检查                         |
| `pnpm lint`                | Prettier 和 ESLint 检查                           |
| `pnpm test`                | 运行 Vitest 单元测试                              |
| `pnpm test:e2e`            | 运行 Playwright 桌面与移动浏览器测试              |
| `pnpm build`               | 使用静态适配器生成生产构建                        |

生成数据位于 `src/lib/generated/`、`static/generated/`，视觉文件及资源 manifest 位于 `static/generated-assets/`、`src/lib/generated-assets/`，审计 JSON 位于 `data/audit/`。

数据 manifest 在生成阶段记录 TurnBasedGameData 的完整 Git revision 和 HEAD subject，并从 `OSPRODWin<major>.<minor>.<patch>_...` 解析 `gameVersionFull` 与用于 UI 的 `gameVersion`。格式无法识别时版本字段为 `null` 并输出 warning，不回退到硬编码版本；浏览器和部署运行时不访问兄弟仓库或其 `.git`。

### Endgame 构建数据

`data:sync` 会在 `src/lib/generated/endgame/` 分别生成混沌回忆、虚构叙事、末日幻影和异相仲裁数据。它们区分敌人模板与具体关卡中的 MonsterID 实例，并以无损十进制字符串保存：

```text
HPBase × HPModifyRatio × HardLevelGroup.HPRatio × contextual Elite HPRatio

(SpeedBase × SpeedModifyRatio + SpeedModifyValue)
× HardLevelGroup.SpeedRatio × contextual Elite SpeedRatio

(StanceBase × StanceModifyRatio + StanceModifyValue)
× HardLevelGroup.StanceRatio × contextual Elite StanceRatio
= resolved internal stance

resolved internal stance ÷ 3 = player-facing toughness per bar
```

schema 16 延续 schema 15 的 Endgame HP 分层语义：common factors、`baseEncounterMaxHpPerBar` 中间值和模式专属 final resolution 保持不变，同时保存精确速度、resolved internal stance、玩家侧单管韧性和配置韧性管数。PF final HP 读取已验证的 wave ability `FantasticStory_Wave_Ability_0001`，将 `ParamList[1]` 作为 `HPAddedRatio`，并恢复 HardLevel HP ratio 的 IEEE-754 单精度语义；普通敌人四舍五入，`LittleBoss/BigBoss` 主目标截断。未知或非法 modifier 不回退到 common HP，而是显示“资料未提供”。MoC、AS 与 AA 继续使用原 common resolver，数值语义不变。

`/endgame` 使用独立的构建期 view-model adapter 按赛期读取这些文件；HP 与速度显示整数，韧性直接显示精确换算值，HP 使用完整千分位。多阶段生命和多管韧性分别使用“单条配置值 × 数量”，不会声明为运行时总值。PF 的底层数据继续保存完整有序 spawn sequence，页面仅按波次展示唯一的实际 occurrence 类型。PF wave 另存 HP modifier、HPParentChild 与 kill-transfer 的证据状态；当前 `FantasticStory_BaseAbility_2310` 缺少可验证的 ability body，因此 kill-transfer 百分比保持 unconfirmed，不写入猜测值。

Endgame occurrence 通过 `MonsterTemplateID` 关联现有敌人百科的弱点、详情路由和可选本地立绘。页面只在构建期读取 `static/generated-enemy-assets/index.json`，不会访问远程图片；缺少 manifest、映射或 WebP 时保留完整数据并使用中性降级。下载生成物位于已忽略的 `static/generated-enemy-assets/`。普通 `dev` / `build` 不自动联网；可显式运行 `pnpm assets:ensure:enemies`（按版本和 cache 增量准备）或 `pnpm assets:sync:enemies`（完整刷新映射）。正式 `pnpm deploy:build` 会在 data generation 后自动执行 enemy ensure，保证 clean deployment 将图片写入最终静态产物。

schema 16 的敌人详情只使用 `MonsterID == MonsterTemplateID` 的 canonical 配置，并预生成 Lv.1–100（默认 Lv.95）的生命值、攻击力、防御力、速度、韧性、效果命中和效果抵抗。详情页还保留弱点与全部非零元素抗性、已验证的特殊状态抗性、canonical 召唤链接、声明式 DamageType、PhaseList 和 ExtraEffect；AI、技能参数、延迟、SPHitBase 与 ModifierList 仅参与构建期诊断，不进入浏览器数据。旧的百科“出现关卡”字段和 UI 已删除，Endgame 赛期数据不受影响。

**镜流、刃、卡芙卡、银狼、黑天鹅、花火、希儿、藿藿、流萤、瓦尔特**存在角色加强。详情 JSON 同时保存 `base` 与 `enhanced` Profile，各自包含能量、技能、行迹和星魂；页面默认展示加强后的角色信息，且角色详情中暂不提供加强对比功能。

## 项目结构

- `scripts/data/`：路径验证、无损 JSON、本地化、同步、审计和验证。
- `scripts/assets/`：视觉资源路径验证、按需转换、缓存、清理和验证。
- `src/lib/domain/`：稳定领域模型与分类配置。
- `src/lib/components/`：导航、目录卡片、筛选、详情和 Endgame encounter 展示。
- `src/routes/`：首页、分类、详情、搜索、Endgame、sitemap 和 robots。
- `docs/data-audit.md`：数据结构、缺失项、许可与更新审计。
- `docs/refactor-status.md`：两次重构结果、真实限制和后续候选。
- `tests/`：使用真实生成记录的 Vitest 与 Playwright 测试。

## 构建与部署

`pnpm build` 生成纯静态站点。CI 必须把两个上游仓库作为独立兄弟目录检出到固定 commit，设置 `HSR_DATA_ROOT` 与 `HSR_ASSET_ROOT`，依次运行数据/资源同步、验证和构建。生产环境应把 `PUBLIC_SITE_URL` 设置为正式域名。

资源同步只处理当前数据目录实际引用的角色、光锥、遗器、7 种属性、9 种命途与 7 张导航图标，不复制完整资源仓库。Overview preview 按中文 index 的稳定 ID 路径选择并保留原始透明 PNG；原始立绘生成最大 960px、quality 84 的透明 WebP；属性、命途与导航图标生成 64px PNG，导航图标会先去除纯透明外边缘再等比居中。若 StarRailRes 已新增 index 记录、但路径为 `null` 或对应文件尚未提交，同步会将该 ID 明确写入 manifest 的 `missing` 并输出 fallback warning，其余实际存在的资源仍正常发布；Overview 使用中性占位，详情立绘自动恢复无图 Hero，图标保留中文文字。非法或越界路径、identity 不一致、损坏图片及转换错误仍会中止同步。上游后续提交资源并产生新 commit 后，`assets:ensure` 会自动重同步并解除对应 fallback，无需修改管线。

生成资源始终加入 gitignore。未来 CI 或其他构建平台需要在 build 前单独取得固定版本 StarRailRes，设置 `HSR_ASSET_ROOT`，运行 `pnpm assets:sync` 后再构建。可以使用 shallow clone、partial clone 与 sparse checkout；所需目录以本节上方命令为准，并包含导航使用的 `icon/sign`。

### GitHub Actions 示例

下面的工作流只展示可复现构建流程，不会自动发布。两个上游仓库是公开仓库，因此可以并列 checkout；如果以后改用私有 fork，需要为外部仓库提供具有读取权限的 token。

```yaml
name: Verify static build

on:
  workflow_dispatch:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout website
        uses: actions/checkout@v6
        with:
          path: HSR-Database

      - name: Checkout game data
        uses: actions/checkout@v6
        with:
          repository: Oereor/TurnBasedGameData
          ref: 648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7
          path: TurnBasedGameData
          sparse-checkout: |
            ExcelOutput
            TextMap
            Config

      - name: Checkout visual assets
        uses: actions/checkout@v6
        with:
          repository: Oereor/StarRailRes
          ref: b95e75c7e1273d819d20c530c0b7e13a3ef19fb4
          path: StarRailRes
          sparse-checkout: |
            index_new/cn/characters.json
            image/character_preview
            icon/element
            icon/path
            image/character_portrait

      - uses: pnpm/action-setup@v4
        with:
          version: 11.9.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: HSR-Database/pnpm-lock.yaml

      - name: Install, generate and verify
        working-directory: HSR-Database
        env:
          HSR_DATA_ROOT: ../TurnBasedGameData
          HSR_ASSET_ROOT: ../StarRailRes
          PUBLIC_SITE_URL: https://example.com
        run: |
          pnpm install --frozen-lockfile
          pnpm data:sync
          pnpm data:validate
          pnpm assets:sync
          pnpm assets:verify
          pnpm lint
          pnpm check
          pnpm test
          pnpm build
```

实际部署时，把 `PUBLIC_SITE_URL` 换成正式域名，并由所选平台发布 `build/`。本项目不会自动联网 clone 上游的数据。

## 数据来源与免责声明

文本数据来源于 [DimbreathBot/TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData)，角色 preview、立绘、属性与命途图标等图像资源来源于 [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes)。StarRailRes 仓库附带 GNU AGPL v3；本项目保留其完整许可证副本。

本站为非官方玩家项目，与米哈游或 HoYoverse 不存在官方关联。游戏名称、角色、图片和相关资产的权利归其权利人所有。仓库根目录 MIT 许可证仅适用于本站原创代码，不覆盖第三方数据、图片或游戏知识产权；许可分离说明不构成法律意见。
