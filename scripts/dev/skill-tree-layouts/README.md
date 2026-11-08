# 技能树布局维护

在仓库根目录运行校验器。它读取九份命途布局、共享几何配置及连线，校验结构和数值，并解析连线引用的节点与分叉。

```bash
pnpm exec tsx scripts/dev/skill-tree-layouts/validate.ts
```

正式配置位于 [data/skill-tree-layouts/](../../../data/skill-tree-layouts/)。`paths.json` 提供运行时命途映射。命途文件按 `anchorType` 记录槽位圆心 `[x, y]`，外环圆心为原点，X 向右，Y 向下。`geometry.json` 记录外环半径和三类节点半径，坐标和半径使用相同单位。

`connections.json` 中每条路径的 `through` 按顺序引用节点 `AnchorType`、`junctions` 中的分叉点或显式坐标。直线逐段连接点列，曲线平滑穿过指定点。游戏数据的 `PrePoint` 提供行迹前置关系。

`Point01`–`Point05`、记忆的 `Point19` 和 `Point20`、欢愉的 `Point22` 使用固有技能尺寸。`Point06`–`Point08` 使用额外能力尺寸。其余槽位使用属性加成尺寸。调整单命途时编辑相应命途文件，调整全局尺寸时编辑 `geometry.json`。运行校验器后，在角色详情的养成模式和玩家只读模式中检查受影响的布局。
