# 移动平台第二套实现校准

原布局的玩家和货箱各自用世界坐标更新，受平台支撑时加上平台位移差。第二套实现把受支撑物体存为平台局部坐标，离台后再转回世界坐标。新平台沿负 X 方向前进，平滑加减速，在 Z 方向侧移后回到停靠轴线上。两套布局保留 600 步周期与相位步 285 至 405 的半开闸门窗口。

| P04 参考 | 计划检查 | 交付旅程 | 停靠点位移 X/Y | 最大中途 Z 侧移 |
| --- | ---: | ---: | ---: | ---: |
| 原布局 | 14/14 | 2/2 | +4.00 m / +2.20 m | 0 m |
| 曲线布局 | 14/14 | 2/2 | −4.80 m / +2.65 m | 1.40 m |

两套布局共用用例、评分和取证结构。每套回放登记行进方向、停靠点、闸门与交付坐标、连续移动上限，以及参考场景的视觉颜色。新增实现的 A03 与 C03 也分别通过 6/6 和 11/11 项。可查看曲线布局的 [载货登台](cargo-boarded.png)、[运动中](in-motion.png)、[交付](delivery.png) 和 [跌落后重试](retry.png)。

曲线布局的货箱在正常交付与重试后分别于相位步 326 和 329 过闸，玩家分别于 334 和 337 过闸，均在窗口内。两次货箱相对平台的最大漂移都低于 0.001 m，检查阈值为 0.07 m。

四个已登记的定向故障分别破坏货物承载、静止地面隔离、窗口结束和空货判定。新增的装饰平台对照保留正常启动、玩家输入和平台周期，角色无法登台。完整评测在五个对照上都检出失败。合同检查检出五个，试玩加视觉检出三个。对照运行的用例判定与证据哈希见 [校准记录](calibration.json)，计分组合见 [分项对照](profiles.json)。

同一作者完成两套参考实现及回放参数。第二套实现从公开行为合同出发，承载算法有独立代码。等价正例、定向故障与空壳校准参考 [CEGame-Bench §12](https://arxiv.org/html/2610.26098v1)。逐步相位与真实支持面的测试参考 [GameLogicBench 的平台 judge](https://github.com/NJU-LINK/GameLogicBench-Tasks/blob/18c54e69cf962fd402e245811d4925d129f4b33c/atom_platform_ride/judge/judge.gd)。

## 复现

    npm ci
    node scripts/evaluate-platform.mjs --task=P04
    node scripts/evaluate-platform.mjs --layout=curve
    node scripts/evaluate-platform.mjs --task=P04 --layout=curve --calibrate

首个 [P04 Codex 作品](../../baselines/p04/codex-001/)也用同一评测运行。其坐标和支持面 ID 来自冻结作品，视觉条目另行读帧核查。
