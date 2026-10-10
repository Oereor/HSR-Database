# V2 Profile 维护

生产唯一算法为 V2。Profile schema 5、主映射 avatar-main-slot-max-overrides-v2、副映射与 U 版本见生成产物。完整规则见 [规范](relic-rating-v2.md)。

唯一人工政策输入是 data/relic-score/v2/profile-overrides.json，schema 1，锁定真实来源 SHA。1505 仅 NECK / PhysicalAddedRatio / 0.4，保存上游 missing；1506 仅 NECK、OBJECT agnostic。配置必须带审批依据和完整原因。未知字段、重复、角色/槽/key 越界、非推荐/异元素、非有限或超范围值被拒绝。上游已有对应字段、推荐移除或来源变化均要求重新人工复核，禁止自动补造或自动审批。

维护流程：

1. 准备锁定上游，修改有明确批准依据的稀疏配置。
2. 运行 pnpm data:sync、pnpm relic-score:v2:profiles:generate、pnpm relic-score:v2:review。
3. 检查逐角色异常、原始 missing 与 override 证据；pnpm relic-score:v2:validate 必须 98 ready、0 blocker。
4. 比较最终副权重 digest。仅主偏好改变不使副分布失效，但产物 provenance 和 manifest 仍必须一致。
5. 副映射或采样 identity 变动时运行正式 Benchmark 生成；通过所有门禁后运行 data:ensure 绑定新产物，再完成检查和构建。

没有 approve-current、阈值或旧模板入口。历史报告保留作调查证据，不是当前维护规范。
