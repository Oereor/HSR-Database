# MiHoMo Player Info Phase 0 验证报告

> 验证日期：2026-09-18  
> 范围：Vercel 静态部署与原生 Function 共存证明、MiHoMo parsed V2 fixture 验证  
> 实施边界：未实现正式 Player Info BFF、页面、缓存、DTO 或 UI

## 1. 结论摘要

| Gate | 状态 | 结论 |
| --- | --- | --- |
| Gate A：Vercel 部署证明 | **FAIL** | 静态产物和单一 Node Function 能共同构建、部署；但要求验证的 extensionless 角色 URL 在真实 Preview 返回 404，未满足静态站可用性 Gate。 |
| Gate B：真实 fixture 验证 | **PASS** | 真实样本确认 inactive 行迹以显式 `level: 0` 返回；普通、忆灵和 enhanced 样本的本地连接均完整且唯一。 |

**Phase 1：No-Go。** Gate B 的数据合同已经成立，但 Gate A 暴露了 Preview 上的静态 URL
映射问题。Phase 1 前必须另行决定并验证 extensionless 静态路由策略；Phase 0 不修改
`vercel.json`、adapter 或 Project Settings 来掩盖该失败。

## 2. 仓库与上游基线

- 网站仓库：`HSR-Database`，分支 `develop`；继续使用 `@sveltejs/adapter-static`。
- `svelte.config.js` 使用 `404.html` fallback，并预渲染全部公开路由。
- 当前 manifest 有 1,076 个 canonical route path、2 个公开 locale；构建包含 2,153 个 HTML
  文件。
- `vercel.json` 未改动；没有新增 Function override 或 Production 配置。
- `TurnBasedGameData` 初始 HEAD：`4ce30f69b32dc259ab9a8da3ba57035485103221`。
- `StarRailRes` 初始 HEAD：`d226befe3db13f2ec15f4161d5f34b1b607643fe`。
- 两个上游初始状态干净，SHA 与 `upstream.lock.json` 一致。

## 3. Gate A：Vercel 部署证明

### 3.1 身份、项目与 Preview facts

所有远程步骤使用与 CI 一致的 Vercel CLI `59.16.0`。认证用户为 `oereor`。现有项目列表与域名
核对后，唯一目标是 scope `oereo-studio` 下的 `hsr-database`：

| Setting | 实际值 |
| --- | --- |
| Production domain | `https://www.hsrarchive.cc` |
| Project ID | `prj_1Vn2RGpC3FkuhINPMwgZx0jBkElK` |
| Framework Preset | Other |
| Build Command | `pnpm deploy:build` |
| Output Directory | `build` |
| Root Directory | `.` |
| Node.js | `24.x` |
| Build region | `iad1` |
| Preview pull | `--environment=preview --git-branch=develop` |

只链接了该现有项目，没有创建项目，没有部署 Production。`.vercel/`、`.env.local` 和 pull 生成的
Preview 环境文件均处于既有 ignore 规则内，未进入版本控制。

### 3.2 Baseline vs probe

baseline 和 probe 都使用 `vercel build --target=preview`，指标直接来自 `.vercel/output`：

| Metric | Baseline | With probe | Delta |
| --- | ---: | ---: | ---: |
| `config.json` routes | 2 | 6 | +4 |
| overrides | 0 | 0 | 0 |
| `functions/**/*.func` | 0 | 1 | +1 |
| static files | 7,126 | 7,126 | 0 |
| HTML files | 2,153 | 2,153 | 0 |

probe 产物只有 `.vercel/output/functions/api/player.func`，运行时为 `nodejs24.x`；静态
`index.html`、`characters/1304.html`、`en/characters/1304.html` 与 `404.html` 均存在。新增路由
仅为 Vercel 对 `/api` filesystem/miss/function mapping 所需的 4 项，没有出现按静态页面展开的数千
条 route，也没有 route-limit 警告。

临时 `api/player.ts` 不依赖外部包、SvelteKit alias、生成数据或文件系统。验证完成后已经删除，仓库
不保留正式 endpoint。

### 3.3 Preview deployment

- Deployment ID：`dpl_7iF4Gzo1icRTtomoDABirYEgEWZJ`
- Preview URL：
  `https://hsr-database-k5s4vvjwk-oereo-studio.vercel.app`
- Inspector：
  `https://vercel.com/oereo-studio/hsr-database/7iF4Gzo1icRTtomoDABirYEgEWZJ`
- Target / state：`preview` / `READY`
- Build log：使用 `.vercel/output` 预构建产物；提取 7,135 个 deployment files；部署完成；无
  route-limit 警告。
- Inspect 可见唯一 Function：`api/player`，2.88 KB，`iad1`。

首次普通文件上传触发 Vercel `api-upload-free` 的 5,000 文件限制，尚未创建部署；按 CLI 明确建议
改为 `--archive=tgz` 后，同一个 Preview 成功上传和部署。

### 3.4 Preview HTTP smoke

Preview 启用了 Deployment Protection。HTTP smoke 通过 Playwright 发起；认证凭据和 bypass secret
仅在忽略目录/进程内存中使用，未打印或写入报告。结果如下：

| Request | 实际结果 | 判定 |
| --- | --- | --- |
| `GET /` | 200, `text/html`, 42,199 bytes | PASS |
| `GET /characters/1304` | 404, fallback HTML | **FAIL** |
| `GET /en/characters/1304` | 404, fallback HTML | **FAIL** |
| `GET /characters/1304?phase0=1` | 404, fallback HTML | **FAIL** |
| `GET /phase0-definitely-missing` | 404, fallback HTML | PASS |
| `GET /api/player` | 200, `{ "ok": true, "probe": "player-info-phase-0" }` | PASS |
| `POST /api/player` | 405, `Allow: GET` | PASS |

定位性补充：`/characters/1304.html` 与 `/en/characters/1304.html` 均返回 200（分别为 132,530 与
139,618 bytes）。因此角色 HTML 没有丢失，失败点是 `.vercel/output/config.json` 没有将
extensionless path 映射到对应 `.html`。baseline 配置同样没有该映射；Phase 0 没有通过新增
rewrite、`cleanUrls` 或 adapter 改造越界修复。

首次使用 `vercel curl` 时，CLI 自动创建了一个 automation-bypass token。发现这一副作用后，本轮
按 secret 精确撤销该唯一 token 并复核剩余 automation-bypass token 数为 0，恢复了原有 Project
Settings；没有触碰其他 deployment-protection 配置。

## 4. Gate B：Fixture findings

### 4.1 Fixture 与隐私边界

两份完整真实响应始终只存在于仓库外的 `MiHoMo-API-Integration` 调查目录。提交的真实 fixture 只
保留三个角色切片所需的：

- `id`；
- `enhanced`；
- `skills[].id/level`；
- `skill_trees[].id/level/max_level`。

fixture 不含 UID、nickname、signature、玩家头像、账号统计或其他玩家文本。另有一份纯 synthetic
fixture 覆盖 nullable 与 unknown vectors。

### 4.2 Skill progression 与 trace activation

当前 MiHoMo parsed V2 官方示例、参考模型和真实响应使用的 wire field 都是
`characters[].skill_trees[].id`，不是 `point_id`。Phase 1 的正式连接规则为：

```text
local SkillProgression.id / Trace.id -> MiHoMo characters[].skill_trees[].id
```

真实样本结果：

| Character slice | Profile | Progressions | Traces | Skill-tree entries | Missing | Duplicate | Extra |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1304 | base | 5 | 13 | 18 | 0 | 0 | 0 |
| 1413 | base / memory | 7 | 13 | 20 | 0 | 0 | 0 |
| 1310 | enhanced | 5 | 13 | 18 | 0 | 0 | 0 |

- 角色 1304 的 `1304209`、`1304210` 都是本地 `Trace.id`，真实响应明确返回 `level: 0`。
- `level > 0` 是 active；`level === 0` 是 inactive。
- missing、重复、非法 level 或未知 ID 都是 unresolved；missing 不得静默等同 inactive。
- `skills[]` 不能作为等级唯一来源。忆灵 progression `1413301`、`1413302` 在
  `skill_trees[]` 中的真实等级均为 6，但不在 `skills[].id` 中。
- enhanced 样本 1310 的全部 18 个节点只与本地 enhanced profile 完整连接，验证
  `characters[].enhanced -> Character.profiles.enhanced`。

### 4.3 Optional / unknown coverage

synthetic fixture 覆盖：

- `player.avatar = null`；
- `player.space_info = null`；
- `relic.main_affix = null`；
- unknown character、light-cone、relic set 与 property ID；
- `sub_affix.count = 0` 的保留。

这些值只作为 Phase 1 guard 的测试向量；Phase 0 没有实现运行时 parser 或 frontend DTO。

## 5. Phase 1 DTO scope

### 5.1 Player metadata

V1 只公开九项：UID、nickname、avatar、signature、level、world level、character count、light-cone
count、achievement count。nullable 字段不得借机扩张 DTO；不得加入 relic count、friend count、
endgame、universe level、book count 或 music count。

### 5.2 Relic

frontend DTO 只包含 `setId/type/level`、nullable `mainAffix` 的 `type/display/percent`，以及
`subAffix` 的 `type/display/percent/count`。必须保留 `count`；不得公开 relic `rarity` 或 affix 的
`value/field/name/icon/step`。

### 5.3 Stats

frontend DTO 使用 `field`、`percent`、`total: string`、`base: string | null`、
`addition: string | null`。`total` 来自 `statistics.display`，`base/addition` 分别来自
`attributes.display` 和 `additions.display`，必须按 `field` join。numeric `value` 只供 BFF 内部 guard
使用，不得进入浏览器 DTO。

## 6. 官方文档

- [Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel CLI: pull](https://vercel.com/docs/cli/pull)
- [Vercel CLI deployment](https://vercel.com/docs/cli/deploying-from-cli)
- [Vercel Build Output API](https://vercel.com/docs/build-output-api/v3)
- [Vercel limits](https://vercel.com/docs/limits)
- [SvelteKit adapter-static](https://svelte.dev/docs/kit/adapter-static)
- [MiHoMo Parsed Data API](https://march7th.xyz/en/api/parsed.html)

Phase 1 若采用 `api/_player/*`，加入 endpoint 前仍须以当时 Vercel 官方文档与实际 Function bundle
验证下划线文件不会被识别为公开 Function。

## 7. 验证与清理

- targeted fixture Vitest：5/5 PASS。
- 全量 Vitest：47 files、486 tests PASS。
- `pnpm check`：0 error、0 warning。
- `pnpm build`：PASS；清理 probe 后 `adapter-static` 正常写入 `build/`。
- `pnpm test:e2e:smoke`：Windows 将默认 4173 保留在 `4117–4216` 排除范围，原命令在启动测试前
  因 `listen EACCES` 退出。使用 `.vercel/` 内忽略配置改为 4317、复用成功 build 并指向本机已有
  Chromium 后，同一 `ci-smoke` 项目 5/5 PASS。
- `pnpm lint`：全仓 Prettier 仍因任务前已有的同一组 17 个文件失败；本次新增的 report、fixtures、
  test 的 targeted Prettier PASS，新增测试 ESLint PASS。没有批量改写无关文件。
- Preview build/deploy log 无 route-limit 警告；唯一 probe Function 可见且 GET/405 行为正确。
- 临时 `api/player.ts` 已删除；未新增正式 BFF、Player route/UI、cache、DTO、adapter 或
  Production 配置。
- `.vercel/`、环境文件、token、完整玩家响应与 `.vercel/output` 均未加入 tracked files。
- 用户已有未跟踪调查报告
  `docs/investigations/mihomo-player-info-implementation-audit-2026-09-18.md` 保持未覆盖。

## 8. Go / No-Go

- **Gate A：FAIL** — Function coexistence 本身成立，但计划要求的三项 extensionless 静态 URL smoke
  失败。
- **Gate B：PASS** — inactive trace、普通/忆灵 progression、enhanced profile、nullable/unknown vectors
  均已形成可重复证据。
- **Phase 1：No-Go**。
- 阻塞项：决定 extensionless HTML 的正式托管策略，并在独立变更中验证 `/characters/1304`、
  `/en/characters/1304` 与带 query 请求均为 200；之后重新执行 Gate A。
