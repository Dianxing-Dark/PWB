# 3D 隔层拾取与遮挡

A05 和 C09 分别通过 6/6 和 10/10 项参考检查。两层高差 2.3 米。A05 从采样件的同投影下方、同层可见但超过 1.2 米的位置、以及同层合法范围内分别操作。C09 加入实体隔板，从遮挡侧按 E、直接撞墙、绕行后拾取这三个阶段各有证据。C09 另从正常入口登坡并完成拾取和退出。

七个定向故障分别移除楼层限制、距离限制、唯一拾取、视线限制、玩家碰撞、出口库存门槛和界面更新。完整评测全部检出。四个 C09 故障仍通过正常通关，定向检查或视觉反馈揭示了故障。两次校准的逐项判定见 [运行记录](calibration.json)，评测组合见 [分项记录](profiles.json)。

楼层分离、距离与遮挡用动作前后状态验证，参考 [WorldCoder-Bench StateProbe](https://arxiv.org/html/2606.01869)。合法场景用于建立负例，正常旅程只用真实按键。计划与用例检查借鉴 [GameASG L2](https://github.com/areal-project/GameASG-Bench/tree/6427cb6517ce11ff350ec45fcae17b67c5aec245/scripts/l2) 与 [CEGame-Bench 校准](https://arxiv.org/html/2610.26098v1)。

    npm ci
    node scripts/play-spatial-pickup.mjs C09
    node scripts/evaluate-spatial-pickup.mjs --calibrate

该任务族目前采用一套参考布局。视觉条目使用参考关卡的颜色和界面文本取证。
