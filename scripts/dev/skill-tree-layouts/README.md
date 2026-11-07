# 技能树布局维护

在 `HSR-Database/` 根目录运行以下命令。校验和预览读取 `data/skill-tree-layouts/` 下的九份命途 JSON 和共享的 `geometry.json`。预览保存为 `data/audit/skill-tree-layouts/geometry-preview.html`，可直接在浏览器打开。

```powershell
pnpm exec tsx scripts/dev/skill-tree-layouts/validate.ts
pnpm exec tsx scripts/dev/skill-tree-layouts/preview.ts
```

命途文件按 `anchorType` 记录各槽位的圆心 `[x, y]`。外环圆心为原点，X 向右，Y 向下。共享文件记录外环半径和三类节点半径，全部使用同一坐标单位。实际显示时，将圆心坐标和节点半径乘以显示外环半径与配置外环半径的比值，再将坐标平移至显示圆心。

## 视觉连线

`data/skill-tree-layouts/connections.json` 按命途记录截图中的视觉连线。每条路径的 `through` 按顺序引用节点 `AnchorType`、`junctions` 中的分叉点，或记录必要的弯曲点 `[x, y]`。直线逐段连接点列，曲线平滑穿过所有指定点。丰饶的主干和底弧共用 `fork`。节点圆心从现有命途文件解析，行迹依赖仍由游戏数据的 `PrePoint` 决定。

使用下文的 Python 环境在新目录中校准九张截图，再生成叠加图和模板图。校准模式只定位外环。预览会核对原图摘要，使用和网页相同的路径生成器，并将九组对照图写到 `data/audit/skill-tree-layouts/connections/index.html`。

```powershell
.\data\audit\skill-tree-layouts\venv\Scripts\python.exe scripts/dev/skill-tree-layouts/extract.py --reference-only --output data/audit/skill-tree-layouts/calibration
pnpm exec tsx scripts/dev/skill-tree-layouts/preview.ts --calibration data/audit/skill-tree-layouts/calibration/diagnostics.json
```

截图不在默认目录时，校准命令使用 `--input`，预览命令使用 `--screenshots`，两者指向同一个目录。叠加图用于检查连接关系、曲线方向和分叉；模板图使用正式节点半径与裁切范围，用于检查图层遮挡和整体形状。

## 节点尺寸

`Point01`–`Point05`、记忆的 `Point19` 和 `Point20`、欢愉的 `Point22` 使用固有技能尺寸。`Point06`–`Point08` 使用额外能力尺寸。其余槽位使用属性加成尺寸。调整全局尺寸时编辑 `geometry.json`。调整个别布局时编辑对应命途的圆心。正式校验依据 JSON 结构和数值，游戏数据和原图无需参与。

## 截图校准

离线提取器可用于比较新截图。它使用 Python 3.13 和独立的开发依赖，默认读取同级目录 `../Codex-Prompt/Database-Skill-Tree-Images/`。可以用 `--input` 指定其他截图目录，用 `--path` 仅检查某个命途。

```powershell
python -m venv data/audit/skill-tree-layouts/venv
.\data\audit\skill-tree-layouts\venv\Scripts\python.exe -m pip install -r scripts/dev/skill-tree-layouts/requirements.txt
.\data\audit\skill-tree-layouts\venv\Scripts\python.exe scripts/dev/skill-tree-layouts/extract.py --output data/audit/skill-tree-layouts/run-new
```

每次提取须使用新的仓库内输出目录。提取结果是带原图像素坐标、外环拟合参数、临时编号和检测评分的诊断材料。逐张核对青色虚线、圆心和绿色节点编号，橙色标记用于复核低分候选。外环定位失败时保留诊断和叠加图。若需要依据新截图调整正式布局，应先确认节点与现有 `AnchorType` 的对应关系，再更新对应圆心并运行校验和预览。
