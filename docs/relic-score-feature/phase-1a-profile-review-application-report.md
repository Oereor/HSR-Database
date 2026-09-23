# Relic Score Phase 1A Profile Review Application Report

## 1. Executive Summary

已把 34 个逐项人工审核决定和 63 个批量批准决定应用到 source config，并由 generator 重新生成 Character Profile。最终 97 个角色全部为 `reviewed`；本轮未实现 Phase 1B scorer、benchmark 或 UI。

## 2. Review Source

权威输入为 `phase-1a-profile-review.md` 的 31 个逐角色审核小节（其中三组 Trailblazer 各覆盖两个独立 ID）、勾选回答及 Weight 表最终值。对未修改字段和原 63 个批量批准角色，使用 application 前 generated Profile。原候选统计和 review reason 解释仅作快照。

## 3. Frozen Global Decisions

“生存位”映射为 `sustain`；“Template 不重要”保留原 template。默认暴击率 target 为 100%，之后边际权重为 0；明确写出的角色 target 覆盖默认值。target 是分段边际权重，hard breakpoint 独立保存。比例属性以 `1.0=100%` 保存；ATK、DEF、SPD target 使用最终面板单位。

## 4. 63-Profile Batch Approval

原 63 个 `unreviewed` 的 template 和权重已与 application 前 artifact 逐一比较，均未改变。除集中式暴击率 policy 的生成结果外，未给这些角色增加评分 override；每个角色单独记录最终 `reviewedInputDigest`。

## 5. 34 needs-review Application Summary

34 个角色 ID 均与审核表最终权重逐项核对。共有 10 个 template override、22 个含 weight override 的角色（54 个属性值）、13 个 explicit no-scaling、5 个 hard breakpoint、15 个角色级 target。

## 6. Template Overrides

`1001、1104、1304、1409 → sustain`；`1009、1207、1403、8007、8008 → direct-support`；`1111 → dot-dps`。`1222、1415、1502、1512、8009、8010` 等“Template 不重要”或认可当前模板的角色保持原 template。

## 7. Weight Overrides

生成 override 时先应用选定 template，再比较审核表中的每一个最终 Weight 值；未加删除线的原值也予以保留。最终只有 22 个角色、54 个属性写入与自动结果不同的 weight；未复制 recommendation sets、main stats 或 substats。

## 8. Scaling Decisions

13 个明确无需 scaling stat 的 ID 使用 `scalingStat: null`：`1101、1215、1225、1301、1303、1306、1313、1321、1502、1506、1513、8005、8006`。审核中指定的 ATK、HP、DEF 与当前唯一推断结果一致，不写冗余选择。显式 no-scaling 消除相应的 `AMBIGUOUS_SCALING`。

## 9. Hard Breakpoints

`1409=SPD 200`、`1415=SPD 180`、`1502=SPD 120`、`1506=SPD 160`、`1513=SPD 140`。source 使用 `SpeedDelta`，artifact 同时写明面板目标 `spd`。

## 10. Stat Targets / Curves

角色级 target 共 15 条：击破 `1222=200%/0.25、1301=150%/0.25、1303=180%/0.25`；DEF `1304=4000/0.25`；效果抵抗 `1409=50%/0`；ATK `1412=4000/0.25、1501=3600/0、8009/8010=2200/0.25`；暴击率 `1413=65%/0、1415/1512=50%/0、1505=70%/0、8009/8010=85%/0`。斜杠后的数字为 target 以上的边际权重。生成 artifact 总计 70 条 target（含 55 条默认暴击率 target），没有新增通用 curve 点或 scorer。

## 11. Global Crit Rate Policy

`profile-policy.json` 集中定义 `CriticalChanceBase` 的 `value=1`、`postTargetWeight=0`。最终 61 个非零暴击率权重 Profile 均有暴击率 target：55 个采用默认值，6 个采用角色级 50/65/70/85% 例外；无暴击率权重者没有此 target。

## 12. Digest / Review Application Process

先写 policy 和评分 override，首次生成并核对表格及原 63 个候选；随后读取最终 `inputDigest`，对 97 个 ID 分别写入 `reviewedInputDigest`，再次生成及验证。digest 包含所选模板、推荐、评分 override、适用的默认 policy；排除 review digest、note 与本地化文本。无关模板及不适用的 policy 变化不会使角色 stale。generator 可输出变更后标为 `needs-review` 的 artifact，独立 validate 命令仍会拒绝 stale review。重复生成前后 artifact SHA-256 均为 `B72C38676BCF96ECE49B77B689E9E0A7F0239D74458C8DDDE9592CBFCB6DF10B`。

## 13. Final Profile Statistics

| 指标 | 数量 |
| --- | ---: |
| reviewed | 97 |
| unreviewed | 0 |
| needs-review | 0 |
| template override | 10 |
| weight override 角色 | 22 |
| explicit no-scaling | 13 |
| hard breakpoint | 5 |
| 角色级 stat target / curve | 15 / 0 |
| Crit Rate 非默认 target | 6 |

## 14. Files Changed

新增集中式 policy 和本报告；修改 profile override、generator、validator、profile 类型、generated artifact、profile 单元测试和人工审核文档。未修改 Player normalization 或 production build pipeline。

## 15. Tests Updated

`relic-score-profiles.test.ts` 增加 97 个 reviewed digest、批量批准、默认暴击率与例外、policy/template digest 隔离、no-scaling、canonical breakpoint/target、finite/单调与边际语义、Trailblazer 双 ID 和 recommendation 不重复写入的断言。该测试文件已通过 TypeScript 编译。

## 16. Validation Results

- `relic-score:profiles:generate` 的等价 `node --import tsx` 命令：通过；重复生成 hash 不变。
- `relic-score:validate` 的等价命令：通过，97 个 Profile；另以 Node assertions 验证审核状态、digest 隔离、双 ID 与边际语义。
- scripts/API TypeScript、profile 测试文件 TypeScript、定向 Prettier、全仓 ESLint、`data:validate:build-inputs`：通过；后者验证 2125 个 artifact。
- Vitest 启动被当前沙箱对 `vite.config.ts` 上层目录的访问限制拦截，未运行相关 relic-score 与 player/runtime 单元测试。Svelte check 报 0 errors / 0 warnings，但同时输出同一 Vite 配置访问错误，故不视为完整通过。当前环境未运行 build。
- 全仓 Prettier 未通过，列出的 20 个文件均非本轮修改文件；本轮修改的 TypeScript/JSON 定向格式检查通过。`git diff --check` 通过。

## 17. Deviations / Ambiguities

未发现无法转换的人工审核决定。`scalingStat: null` 为新增的显式审核结论，不产生未推荐属性；`statTargets` 新增 post-target marginal weight，并把 artifact schema 升至 v2。测试运行限制属于当前沙箱环境，不是 Profile 校验失败。

## 18. Remaining Limitations

Profile 只表达后续评分所需契约；没有计算 utility、breakpoint 收益或分数。Vitest 和生产 build 仍需在允许 Vite/esbuild 读取配置的环境补跑。Normalization 精简修复保持原样。

## 19. Phase 1B Readiness

人工审核数据和生成契约已就绪。正式进入 Phase 1B 前需在正常开发/CI 环境完成本轮被沙箱阻断的相关单元测试及 build；本轮未开始 Phase 1B。

## 20. `git status --short`

```text
 M data/relic-score/profile-overrides.json
 M docs/relic-score-feature/phase-1a-profile-review.md
 M scripts/relic-score/generate.ts
 M scripts/relic-score/profiles.ts
 M scripts/relic-score/validate.ts
 M src/lib/relic-score/generated/character-profiles.json
 M src/lib/relic-score/profile-types.ts
 M tests/unit/relic-score-profiles.test.ts
?? data/relic-score/profile-policy.json
?? docs/relic-score-feature/phase-1a-profile-review-application-report.md
```
