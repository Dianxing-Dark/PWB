# 第二套检查点布局与 C12 生成基线

| 任务 | Relay Terrace | Switchback Gallery |
| --- | ---: | ---: |
| A10 | 6/6 | 6/6 |
| C07 | 7/7 | 7/7 |
| C12 | 12/12 | 12/12 |

Switchback Gallery 沿 Z 轴布置主路，楼层高差为 2.65 米。它通过筛选接触面并选取最高可达面来处理支撑，将跨尝试的检查点和下层供电保存在同一个独立的进度对象中。两套实现用相同的用例、旅程和计分代码，仅替换回放坐标与楼层 ID。

C12 空壳能启动和推进时钟，也会收到真实键盘事件。因玩家位置始终不变，输入探测失败，十个依赖用例记为产品阻断。严格成功为 false，功能分为 0，完整旅程为 0/2。等价正例和空壳控制参考 [CEGame-Bench 第 12 节](https://arxiv.org/html/2610.26098v1)。

另用冻结的 Codex 作品运行 C12。其楼层高差 3.8 米，并经东侧斜坡、转角和上层步道抵达控制室。[基线记录](../../baselines/c12/codex-001/)保留公开输入、路线、生成产物、完整评测和单人视觉复核。

    node scripts/evaluate-checkpoints.mjs
    node scripts/evaluate-checkpoints.mjs --layout=gallery
    node scripts/evaluate-checkpoints.mjs --task=C12 --starter

同一作者写了两套参考及评测回放。定向故障在原布局校准，见 [第一次校准](../checkpoints-001/)。
