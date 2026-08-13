# 星轨档案库

《崩坏：星穹铁道》非官方静态数据资料库，使用 SvelteKit、TypeScript 和 Tailwind CSS 构建。

## 基础功能

- 查看角色的各项数据，包括基础属性（生命值，攻击力，防御力，速度），技能组，行迹，以及星魂。
- 角色等级、行迹等级均可单独配置。
- 提供简易的光锥、遗器、敌方单位信息。
- 更多功能正在开发中……

## 仓库布局

```text
workspace/
├── TurnBasedGameData/   # 只读上游数据仓库
├── StarRailRes/         # 只读视觉资源仓库
└── HSR-Database/        # 本网站仓库
```

两个目录是并列且互不合并的独立 Git 仓库。不要在父目录初始化 Git，也不要把数据仓库改为 submodule 或 subtree。

## 环境要求

- Node.js 22 或更高
- pnpm 10 或更高
- Git

## 获取项目与上游仓库

本仓库不提交构建时生成的数据、审计结果或图片。fork 后请把网站与两个上游仓库作为三个并列目录检出：

```text
workspace/
├── HSR-Database/
├── TurnBasedGameData/
└── StarRailRes/
```

```bash
git clone https://github.com/<你的用户名>/HSR-Database.git
git clone https://github.com/Oereor/TurnBasedGameData.git
git clone https://github.com/Oereor/StarRailRes.git
```

建议使用本项目当前审计和验证过的上游版本：

```bash
git -C TurnBasedGameData checkout 648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7
git -C StarRailRes checkout b95e75c7e1273d819d20c530c0b7e13a3ef19fb4
```

上游仓库始终只是只读输入，不应复制到网站仓库、转换为 submodule，或由网站脚本自动修改。

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

默认配置已内置于脚本；需要覆盖路径或站点 URL 时，再复制环境变量示例：

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

可以把 `HSR_DATA_ROOT`、`HSR_ASSET_ROOT` 改为其他绝对或相对路径。

### 可选：精简检出上游仓库

`StarRailRes` 可以只检出本网站使用的四类视觉目录：

```bash
git clone --filter=blob:none --no-checkout https://github.com/Oereor/StarRailRes.git StarRailRes
git -C StarRailRes sparse-checkout init --cone
git -C StarRailRes sparse-checkout set icon/avatar icon/element icon/path image/character_portrait
git -C StarRailRes checkout b95e75c7e1273d819d20c530c0b7e13a3ef19fb4
```

当前数据管线只需要 `TurnBasedGameData` 的 `ExcelOutput` 与 `TextMap`：

```bash
git clone --filter=blob:none --no-checkout https://github.com/Oereor/TurnBasedGameData.git TurnBasedGameData
git -C TurnBasedGameData sparse-checkout init --cone
git -C TurnBasedGameData sparse-checkout set ExcelOutput TextMap
git -C TurnBasedGameData checkout 648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7
```

### Windows PowerShell 找不到 pnpm

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

| 命令                   | 用途                                            |
| ---------------------- | ----------------------------------------------- |
| `pnpm data:audit`      | 刷新生成数据并输出主键、关系和 A/B/C/D 缺失审计 |
| `pnpm data:sync`       | 生成简中目录、详情、搜索索引与来源 metadata     |
| `pnpm data:validate`   | 验证生成数量、重复 ID、详情文件和搜索索引       |
| `pnpm assets:sync`     | 同步并优化当前页面需要的四类视觉资源            |
| `pnpm assets:ensure`   | 按 schema、commit 和需求集合检查资源缓存        |
| `pnpm assets:verify`   | 验证资源映射、manifest、格式、尺寸和生成文件    |
| `pnpm assets:validate` | `assets:verify` 的兼容命令                      |
| `pnpm assets:clean`    | 仅清理网站仓库内的生成视觉资源                  |
| `pnpm dev`             | 启动开发服务器，必要时自动同步                  |
| `pnpm check`           | Svelte 与 TypeScript 检查                       |
| `pnpm lint`            | Prettier 和 ESLint 检查                         |
| `pnpm test`            | 运行 Vitest 单元测试                            |
| `pnpm test:e2e`        | 运行 Playwright 桌面与移动浏览器测试            |
| `pnpm build`           | 使用静态适配器生成生产构建                      |

生成数据位于 `src/lib/generated/`、`static/generated/`，视觉文件及资源 manifest 位于 `static/generated-assets/`、`src/lib/generated-assets/`，审计 JSON 位于 `data/audit/`；它们均不提交。当前数据 schema 为 11，视觉资源 schema 为 2。`data:ensure` 与 `assets:ensure` 使用 schema、上游 commit 和当前角色/属性/命途需求判断是否重新生成。

第二次重构后，网站只生成角色、光锥、遗器和敌人数据。材料、普通物品、养成成本和敌人掉落已从导航、路由、搜索、生成数据与详情中移除；`/items` 使用正常 404 行为。

角色技能通过 `SkillTag`、`AttackType`、`SkillTriggerKey`、`AvatarSkillTreeConfig.LevelUpSkillID` 和忆灵关系规范化为语义卡片。同一类别只有一张卡片，多形态作为内部 Variant 展示。基础属性等级默认 Lv.80；在 Lv.20/30/40/50/60/70 边界选择该等级可达到的最高已突破阶段，角色与光锥的展示数值统一四舍五入为整数。角色能量由 `AvatarUltraSkillConfig`、`GridFightFrontSpecialSP` 与 `SPNeed` 结构化判定，特殊能量不展示上限。光锥叠影等级默认等级为 1，并与光锥等级互不影响。

无本地化描述且与公开技能共享 progression，或共享 `SkillTag + SkillIcon` 的内部实现 Variant 不进入展示模型。属性强化行迹从 `AvatarSkillTreeConfig.StatusAddList` 和 `AvatarPropertyConfig.PropertyNameSkillTree` 恢复官方属性名称、格式与数值。普通游戏文本通过安全 token renderer 支持原始换行、`<color>`、`<i>` 和 `<unbreak>`，不使用 raw HTML。

schema 11 将可读行迹结构化为属性加成与额外能力，并保留同一角色 Profile 内的 `PrePoint` 关系。详情页采用三列卡片列表：额外能力卡直接展示名称、晋阶条件和描述，属性卡沿自身的 `PrePoint` 链追溯并陈列在所属能力下方；无法追溯到能力的属性节点进入底部独立区。记忆开拓者的 `PointType=5`“未完的尾声”作为通栏的第四项额外能力保留。全部行迹均为真实单级节点，页面不显示冗余等级。

遐蝶的隐藏技能记录 `1140712` 与公开忆灵天赋 `1140706` 共享展示身份，但上游将前者标记为 `HideInUI`。网站只在忆灵天赋卡片展示 `1140706`，并对这组特例的结构关系进行数据验证。

`AvatarConfigEnhanced` 为镜流、刃、卡芙卡、银狼、黑天鹅、花火、希儿、藿藿、流萤和瓦尔特提供加强配置。详情 JSON 同时保存 `base` 与 `enhanced` Profile，各自包含能量、技能、行迹和星魂；页面默认展示加强后，关闭开关时写入 `?enhanced=0`。切换时 DOM 中只渲染当前 Profile。

第三次重构将关键词输入改为草稿/已提交语义：只有“搜索”按钮或 Enter 才更新 URL 和结果。角色技能从 `BPNeed/BPAdd`、`SkillNeed`、`SPBase`、`StanceDamageDisplay` 和 `SkillEffect` 生成 Variant 级战斗元数据；特殊资源与战技点是独立语义，可同时展示。

## 项目结构

- `scripts/data/`：路径验证、无损 JSON、本地化、同步、审计和验证。
- `scripts/assets/`：视觉资源路径验证、按需转换、缓存、清理和验证。
- `src/lib/domain/`：稳定领域模型与分类配置。
- `src/lib/components/`：导航、目录卡片、筛选和详情展示。
- `src/routes/`：首页、分类、详情、搜索、sitemap 和 robots。
- `docs/data-audit.md`：数据结构、缺失项、许可与更新审计。
- `docs/refactor-status.md`：两次重构结果、真实限制和后续候选。
- `tests/`：使用真实生成记录的 Vitest 与 Playwright 测试。

## 构建与部署

`pnpm build` 生成纯静态站点。CI 必须把两个上游仓库作为独立兄弟目录检出到固定 commit，设置 `HSR_DATA_ROOT` 与 `HSR_ASSET_ROOT`，依次运行数据/资源同步、验证和构建。生产环境应把 `PUBLIC_SITE_URL` 设置为正式域名。

资源同步只处理当前目录真实需要的 91 个角色、7 种属性与 9 种命途，不复制完整资源仓库。头像保留 128px 透明 PNG；2048px 原始立绘生成最大 960px、quality 84 的透明 WebP；属性与命途图标生成 64px PNG。单图缺失不阻止构建，也不会请求不存在的 URL；头像使用中性占位，立绘自动恢复无图 Hero，图标保留中文文字。

生成资源始终 gitignore。未来 CI 或其他构建平台需要在 build 前单独取得固定版本 StarRailRes，设置 `HSR_ASSET_ROOT`，运行 `pnpm assets:sync` 后再构建。可以使用 shallow clone、partial clone 与 sparse checkout，仅获取 `icon/avatar`、`image/character_portrait`、`icon/element` 和 `icon/path`；项目不会暗中联网 clone，也不绑定 Vercel。

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

      - name: Checkout visual assets
        uses: actions/checkout@v6
        with:
          repository: Oereor/StarRailRes
          ref: b95e75c7e1273d819d20c530c0b7e13a3ef19fb4
          path: StarRailRes
          sparse-checkout: |
            icon/avatar
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

实际部署时，把 `PUBLIC_SITE_URL` 换成正式域名，并由所选平台发布 `build/`。本项目不自动联网 clone 上游，也不绑定 Vercel、Netlify 或其他平台。

## 数据来源与免责声明

数据来源于 [DimbreathBot/TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData)，角色头像、立绘、属性与命途图标来源于固定版本的 [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes)。StarRailRes 仓库附带 GNU AGPL v3；本项目保留其完整许可证副本与第三方声明。

本站为非官方玩家项目，与米哈游或 HoYoverse 不存在官方关联。游戏名称、角色、图片和相关资产的权利归其权利人所有。仓库根目录 MIT 许可证仅适用于本站原创代码，不覆盖第三方数据、图片或游戏知识产权；许可分离说明不构成法律意见。
