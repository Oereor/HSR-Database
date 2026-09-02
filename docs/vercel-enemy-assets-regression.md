# Vercel Enemy Asset Regression

## Root Cause

Nanoka enemy downloader 的唯一入口是 `pnpm assets:sync:enemies`。普通 `predev` / `prebuild`、StarRailRes `assets:ensure` 和 Phase 02 的 `deploy:build` 都不会调用它。

本地开发机器已有被 `.gitignore` 排除的 `static/generated-enemy-assets/`，所以本地页面正常；Vercel clean checkout 没有该 cache。构建期 resolver 将 manifest 缺失降级为无图 warning，导致 build 成功但整类 enemy 图片缺失。

未修改代码的 clean reproduction 得到：

- downloader 没有执行；
- `static/generated-enemy-assets/` 不存在；
- `build/generated-enemy-assets/index.json` 不存在；
- `build/` 中 enemy WebP 数量为 0；
- Vite 仍成功完成静态构建。

## Implemented Pipeline

```text
TurnBased preparation
→ data:ensure
→ assets:ensure:enemies
→ StarRailRes preparation
→ assets:ensure
→ SvelteKit static build
```

`assets:ensure:enemies` 复用原 downloader、URL resolver、重试、并发、WebP 校验和原子写入。普通 `dev` / `build` 保持不自动联网。

Enemy manifest schema 2 使用 `monsters` 和 `unavailable` 的并集覆盖当前 catalog。detail 404、缺少 `image_path` 和 image 404 是允许 fallback 的单资源缺失；其他 HTTP/network/JSON/image validation 错误会在 manifest 发布前失败。旧 schema 1 仍可被页面 resolver 读取，但不视为可复用的 ensure cache。

完整 cache 还必须满足 canonical URL、区分大小写的文件名、非零有效 WebP、catalog 精确覆盖和 sanity-check ID 校验。Nanoka version 相同时 warm ensure 不再请求所有 detail JSON 或图片；如果版本探测临时失败但 cache 完整，则继续使用本地构建期资源。

检测到 `HTTP_PROXY`、`HTTPS_PROXY` 或 `ALL_PROXY`（含小写形式）时使用项目已有 curl transport；未配置代理时使用 Node fetch。仓库不包含固定代理地址。

## Network Verification

通过本地 `7890` 代理检查 Nanoka manifest、普通敌人、Boss 和 Enemy Overview Hero 样本：

- HTTP status：全部 200
- redirects：0
- JSON：`application/json`
- 图片：`image/webp`
- 图片大小：76,726–113,920 bytes
- 文件签名：`RIFF/WEBP`

没有发现 Nanoka 针对当前请求的 403、429、redirect、TLS 或内容类型异常。该结果只证明当前代理网络可用，不推断所有 Vercel 出口条件恒定可用。

## Clean and Warm Results

Clean deployment-like build 使用 Nanoka 4.5.52：

- 628 个 MonsterTemplateID
- 605 条成功映射
- 23 条合法 `missing-image-path`
- 210 张新下载 WebP
- enemy 图片总计 16,088,650 bytes（15.34 MiB）
- enemy ensure 101.343s
- deployment overall 129.604s；外部计时 130.305s

最终 `static/` 与 `build/` 均包含 210 张图片且字节数一致。`Monster_1005010.webp` 为 113,920 bytes，并通过 `RIFF/WEBP` 和 Sharp metadata 验证。

Warm enemy ensure 独立实测 1.210s；完整 warm deployment 中为 1.122s。605 条映射、210 张图片和 23 条合法缺失全部复用，没有图片下载；完整 deployment script overall 为 34.262s，外部计时为 34.939s。
