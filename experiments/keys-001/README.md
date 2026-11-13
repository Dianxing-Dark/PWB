# 3D 钥匙与库存校准

| 层级 | 参考实现通过项 | 完整旅程 |
| --- | ---: | ---: |
| A06 单次消耗与同层交互 | 5/5 | 无计划 |
| C05 拾取、匹配解锁和上层目标 | 8/8 | 1/1 |
| P05 两条独立路线与共享出口 | 10/10 | 2/2 |

关卡具有两条真正不同高度的通路。上下层锁在水平投影上对齐。两条 P05 旅程从空库存的新页面出发，上层走两条坡道，下层走直廊。两条路线各自穿过匹配门，进入同一物理出口。评测记录拾取、消耗、门状态、位置轨迹及胜利事件，同时检查连续位移和正确楼层。

| 对照 | 评测观察 |
| --- | --- |
| 同投影误开上层门 | A06 跨层检查失败，正常同层消耗仍通过 |
| 重复经过已拾取位置增加库存 | 唯一拾取检查失败，两条旅程均可完成 |
| 蓝钥匙可以打开上层琥珀门 | 错色检查失败，正确解锁与两条旅程仍通过 |
| 开门后不消耗钥匙 | 消耗转换失败，两个完整旅程均未达标 |
| 下层出口不触发胜利 | 功能检查全部通过，只有下层旅程失败 |
| 琥珀库存界面固定显示为零 | 两项视觉反馈失败，功能和两条旅程仍通过 |
| 钥匙仅作装饰的空壳 | 页面与输入检查通过，拾取、解锁和两个完整旅程失败 |

[评分对照](profiles.json)对同一批 P05 证据投影到原提案的 A（合同检查）、B（试玩与视觉）和 C（完整评测）。六个 P05 故障或空壳中，A 检出 4 个，B 检出 4 个，C 检出 6 个。A 检出的重复拾取与错色开锁均未被 B 观察到。B 检出的单分支断路与过期库存界面均未被 A 观察到。样本来自人为设计的校准版本，计时为同次运行的分项估计。

动作前后验证库存变化和门锁后置条件参考了 [WorldCoder-Bench 的 StateProbe](https://arxiv.org/html/2606.01869)。合法局部起点与独立通关参考 [GameASG L2 评测源码](https://github.com/areal-project/GameASG-Bench/tree/6427cb6517ce11ff350ec45fcae17b67c5aec245/scripts/l2) 和 [CEGame 的校准协议](https://arxiv.org/html/2610.26098v1#S12.SS3)。[GameCraft 评分源码](https://github.com/FreedomIntelligence/gamecraft-bench/blob/d64cc5d817bd331a840a378e6e42c873b1139055/gamecraft_bench/verifier/score.py) 提供了将视觉条目关联到具体回放证据的参考。

## 复现

    npm ci
    npm run calibrate:keys
    node scripts/compare-profiles.mjs <P05 reference and control report paths>

[校准记录](calibration.json)保留各版本的用例判定和原始报告哈希。三项参考和七个故障或空壳版本在两轮执行中的逐项判定一致。参考画面可查看 [拾取前](amber-key-visible.png)、[拾取后](amber-key-gone.png)、[上层通关](exit-upper.png) 和 [下层通关](exit-lower.png)。颜色定位只用于参考场景。首个独立 Codex 作品的画面另行读帧核查，见 [P05 基线](../../baselines/p05/codex-001/)。
