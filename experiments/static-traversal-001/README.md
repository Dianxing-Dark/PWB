# 斜坡与单向落差

A04 和 A09 的参考实现各通过 5 项检查。A04 的完整上坡轨迹经过至少两个中间高度区间，玩家横切坡缘后先失去支撑、随后落在低台，落地后仍能移动。A09 正向允许从 2.4 米高台走下，反向在高台投影下可以继续走，玩家高度仍为 0。

四个定向故障分别模拟不可见坡缘护栏、反向串层，以及两个任务的视觉高度失配。行为故障被对应的定向用例检出。视觉故障的状态和轨迹正确，但渲染中的玩家高度不随之变化，由取证帧检出。[运行结论](calibration.json)记录逐项判定和原报告哈希。

回放通过真实浏览器键盘获取轨迹。按离散仿真步追踪空间条件与失败里程碑，参考 [GameLogicBench 3D 导航 judge](https://github.com/NJU-LINK/GameLogicBench-Tasks/blob/18c54e69cf962fd402e245811d4925d129f4b33c/atom_move_navigation_3d/judge/judge.gd)。

    npm ci
    node scripts/play-static-traversal.mjs A09
    node scripts/evaluate-static-traversal.mjs --calibrate

两个任务使用同一套地面解算与不同地图。视觉校准根据参考渲染中的玩家标记与 HUD。
