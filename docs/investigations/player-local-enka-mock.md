# 本地真实 Enka mock 验收

日期：2026-10-10，Asia/Shanghai。只读使用四份本地 Enka 文件，未复制到静态目录、测试 fixture、Function 或 Git。以按文件名排序的匿名编号记录结果，不记录 UID、昵称、原文或绝对路径。

## 入口与安全

开发专用 Vite middleware 仅在 command=serve、mode=development、非 preview/CI/Vercel/production、PLAYER_MOCK_ENABLED=1 时注册，要求 PLAYER_MOCK_DIR 且绑定 127.0.0.1/localhost；另验证请求来自 loopback。默认关闭。只接受单层目录中的精确九位 UID-Enka.json，检查 realpath 目录边界、重复身份、JSON 与响应 UID。客户端每次请求重新建立，服务端文件不缓存。

middleware 注入既有 Enka client 的 fetchImpl，使用同一 decode、adapter、handlePlayerRequest 和正式 V2 scorer；不调用网络，也不直接返回玩家原文。错误沿用 API code/retryable 契约，不输出文件路径或原文，响应 no-store，删除 CDN 缓存头。前端原有请求合并及导航缓存保留。开发模式关闭 Analytics，确保验收没有外部请求。

PowerShell 启动（目录由操作者自行提供）：

```powershell
$env:PLAYER_MOCK_ENABLED = '1'
$env:PLAYER_MOCK_DIR = (Resolve-Path '<local-private-enka-directory>').Path
pnpm dev --host 127.0.0.1 --port 4174 --strictPort
```

先检查启动日志并请求 /player/ 确认 200，再运行现有 Playwright：

```text
pnpm exec playwright test tests/e2e/player-local-enka.spec.ts tests/e2e/player-character.spec.ts tests/e2e/player.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0
```

trace、截图和录像关闭；验收输出/private 配置已忽略。浏览器日志只计数。结束后停止服务、移除环境变量；本轮服务已停止。

## 真实结果

| 匿名样本 | 角色记录 | 完整可评分 | 缺件 | 有面板记录 | 特殊覆盖 |
|---|---:|---:|---:|---:|---|
| 1 | 7 | 3 | 4 | 7 | 1505、1506 |
| 2 | 1 | 1 | 0 | 1 | 无 |
| 3 | 6 | 6 | 0 | 6 | 无 |
| 4 | 8 | 8 | 0 | 8 | 1506 |
| 合计 | 22 | 18 | 4 | 22 | — |

真实 16 个浏览器用例（4 样本 × zh-CN/en × desktop/mobile）全部通过。每个样本检查 Overview 的全部展示实例，点击角色与配装链接，验证面板、光锥、六槽、V2 badge、评分、固定/普通/agnostic 解释与缺件。桌面/移动无横向溢出。Overview→所有角色→返回 Overview 只产生一次 Player API 请求，刷新增加一次并重读；响应 no-store，外部请求 0，pageerror/console error 0。

既有相关 Player 浏览器用例最终也通过：首轮 36/40 通过，其中真实 16 全通过；两项旧测试在桌面/移动共 4 例失败。已将图片拦截限定为公开 /generated-assets/，避免拦截开发 JS manifest，并在提交前等待 hydration。定向复验 4/4 通过，因此所有相关 40 例的最终行为已覆盖；没有把最初失败报告为一次全量绿灯。

## 正式 Function 和构建隔离

用现有 esbuild 本地打包 api/player.ts（Node 24 ESM，约 25.4 MiB），注入原 Enka client 对同四份私有文件验证：22 个 DTO 均 version:3 / algorithmVersion:2，18 个完整配装全部 available，4 个缺件 unavailable，全部 22 个面板保留；正式 API/缓存头语义保持。该临时包与报告在忽略目录中，不参与发布。

构建输出与 Function 检查无 PLAYER_MOCK_DIR、私有目录路径或私有 UID 字符串 token，静态输出无 Enka/mock/private 文件、无正式评分分布泄漏到前端。原文件 SHA256 在验收前后逐一一致。两个上游仓库 clean，锁文件未改。

## 真实失败与边界

开发 Analytics 曾产生外部请求，已修复。并行 messages 编译与运行中的开发服务曾造成 HMR 模块失效和 Windows rename EPERM；停止服务后重新生成并顺序验收通过。最后启动 ready=21.420 秒，页面 HTTP 200，再接入现有 Playwright，没有第二套框架。

仅验收本地真实样本和本地 Function；未联系真实 Enka 服务、未做远端 Vercel Preview 或部署。Windows 检查子进程另有原生崩溃（3221225477/3221225501），CI 总流程未取得最终成功；分步类型检查曾全部 0 错误，unit/数据/production build 和本报告的浏览器/Function 验收已分别通过。按仓库外部工具失败规则停止该原生检查路径，没有把它描述为类型错误或上线 gate 全绿。
