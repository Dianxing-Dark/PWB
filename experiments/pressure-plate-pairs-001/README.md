# 双压板 3D / 2D 配对校准

按原提案从单机制、机制组合、完整短关卡三个层级设置平面对照。每组共用浏览器输入、状态与事件记录和评分逻辑。3D 使用上下层与坡道。2D 全程位于同一平面，完整关卡用平面危险区触发与 3D 等价的失败和重试流程。

| 配对 | 共同检查双侧通过 | 完整旅程（3D / 2D） |
| --- | ---: | --- |
| A01 / A02 推箱接触、释放与反馈 | 2/2 | 未计划 |
| C01 / C02 双板计时和通行 | 7/7 | 1/1、1/1 |
| P01 / P02 通关与失败后重试 | 9/9 | 2/2、2/2 |

共同检查之外，A01 用与压板有投影重叠的上层箱子验证垂直分离。A02 用从压板侧边经过的箱子验证平面近失。两项均通过参考实现，并在对应单故障版本中失败，两个故障版本的正常接触检查仍通过。可查看 [A01 上层重叠](a01-different-height.png) 和 [A02 平面近失](a02-near-miss.png) 的玩家视角。

P01 两套 3D 布局和 P02 平面布局均在以下四类单故障上触发各自预先登记的失败检查，登记为应通过的用例仍通过。

| 单故障 | 观测 |
| --- | --- |
| 离开压板后保留计时 | 提前离开用例失败，两个完整旅程仍可完成 |
| 门显示开启但碰撞仍阻挡 | 开门反馈通过，穿门检查和两个完整旅程失败 |
| 门已通行但玩家视角未显示 | 门反馈失败，物理穿门与完整旅程通过 |
| 到达出口后未触发胜利 | 穿门通过，两个完整旅程失败 |

[配对记录](pairs.json)和[单故障记录](calibration.json)包含每项判定和游戏、评测器版本。两个空间反例的图像来自负例路径的关键时刻。[P02 重试后胜利](p02-retry-victory.png)来自从默认入口开始的完整重试轨迹。

## 复现

    npm ci
    npm run evaluate:p01 -- --task=A01 --calibrate
    npm run evaluate:p01 -- --task=A02 --calibrate
    npm run evaluate:p01 -- --task=C01
    npm run evaluate:p01 -- --task=C02
    npm run calibrate:p01
    npm run evaluate:p01 -- --task=P02 --calibrate
    node scripts/compare-pairs.mjs <A01 report> <A02 report> <C01 report> <C02 report> <P01 report> <P02 report>

局部场景从合法前置条件开始，完整试玩由按键推进。对应 GameASG 的 [L2 实现](https://github.com/areal-project/GameASG-Bench/tree/6427cb6517ce11ff350ec45fcae17b67c5aec245/scripts/l2)和 CEGame 的 [局部状态与完整旅程](https://arxiv.org/html/2610.26098v1)。按事件截帧并为每项反馈保留具体证据，参考 [GameCraft 评分器](https://github.com/FreedomIntelligence/gamecraft-bench/blob/d64cc5d817bd331a840a378e6e42c873b1139055/gamecraft_bench/verifier/score.py)。参考关卡使用已知颜色和文字定位视觉变化。生成关卡的视觉反馈另行核查。[首个 P02 Codex 运行](../../baselines/p02/codex-001/)保存了这类核查的示例。

本次校准只涉及双压板家族。两维各有独立的参考几何和路线，平面对照每个层级各一套布局。测得的是同套检查在这些布局上的一致性与对预设故障的区分能力。用这些结果估计空间维度对生成成功率的影响还需要多次固定模型运行。
