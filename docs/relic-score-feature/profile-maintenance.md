# V2 Profile 维护

生产唯一算法为 V2。Profile schema 6、主映射 avatar-main-slot-max-overrides-v2、副映射与 U 版本见生成产物。完整规则见 [规范](relic-rating-v2.md)。

唯一人工政策输入是 data/relic-score/v2/profile-overrides.json，schema 2。sourceCommit 保留原始批准 commit；sourceDigests 绑定经过审核的八份来源内容，不要求批准 commit 等于当前上游 pin。1505 仅 NECK / PhysicalAddedRatio / 0.4，保存上游 missing；1506 仅 NECK、OBJECT agnostic。配置必须带审批依据和完整原因。未知字段、重复、角色/槽/key 越界、非推荐/异元素、非有限或超范围值被拒绝。

来源集合由共享 source identity 模块维护：RelicMainAffixAvatarValue、RelicSubAffixAvatarValue、RelicMainAffixBaseValue、RelicSubAffixBaseValue、AvatarConfig、AvatarConfigLD、AvatarRelicRecommend、AvatarRelicRecommendLD。每份表先经现有无损 raw adapter，再稳定序列化并计算 SHA-256；对象键排序，数组顺序与精确数值保留，regular/LD 在合并前分别计算。换行、缩进和对象键顺序不影响身份。身份保守覆盖完整八表，不只截取两个特例的行；概率/reference 等分布输入另由 Benchmark identity 检查。

来源内容一致时可沿用原批准，不修改 policy。来源内容发生变化、上游已有覆盖字段或推荐移除时，必须人工复核；错误列出变化表和 approved/current digest。只读调查并审阅差异及三个例外后，由维护者明确批准才可手动更新 sourceDigests、批准 commit 与 basis。不得先复制新 digest 再当作通过审批；所有生成和自动更新命令均不写审批输入。

schema 1 的一次性迁移必须从原批准 commit 的真实 Git 内容计算 schema 2 身份，再与目标来源逐份比较；不能直接复制历史 Profile 的字节 hash，也不能从未经审批的新来源建立基线。本次迁移证据见[修复报告](../investigations/upstream-rating-v2-content-identity-fix-2026-10-19.md)。

维护流程：

1. 准备锁定上游，修改有明确批准依据的稀疏配置。
2. 运行 pnpm data:sync、pnpm relic-score:v2:profiles:generate、pnpm relic-score:v2:review。
3. 检查逐角色异常、原始 missing 与 override 证据；pnpm relic-score:v2:validate 后核对当前来源的全部 Profile ready、0 blocker。98 是现有 pin 的数量，不是未来上游更新的固定门槛。
4. 比较最终副权重及采样 identity、分布覆盖范围。Profile sourceCommit 必须记录当前 pin 并与 manifest 一致；Benchmark 保留其原生成 commit/audit，不能为了匹配当前 pin 改写历史来源。仅主偏好或审批 metadata 改变不使副分布失效。
5. 副映射或采样 identity 变动时运行正式 Benchmark 生成；通过所有门禁后运行 data:ensure 绑定新产物，再完成检查和构建。

没有 approve-current、阈值或旧模板入口。历史报告保留作调查证据，不是当前维护规范。
