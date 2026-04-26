# Black_Hole_HTML_Simulation

Code by DeepSeek v4 pro , Web html , keep updating

# 黑洞模拟 / Black Hole Simulation


基于 Three.js 的黑洞实时物理模拟，实现引力透镜、光子环、吸积盘粒子系统等广义相对论视觉效果。

## 运行方式

直接用浏览器打开 `index.html`（需本地服务器以避免跨域问题，推荐 VS Code Live Server 或 `npx serve .`）。

## 项目结构

```
blackhole/
├── index.html              # 入口页面，加载所有脚本
├── css/
│   └── styles.css           # 暗色主题全局样式 + 控制面板样式
└── js/
    ├── lib/
    │   └── three.min.js     # Three.js 渲染引擎
    ├── main.js              # 总调度器：场景初始化、双通道渲染管线、事件绑定
    ├── blackhole.js         # 黑洞渲染核心：引力透镜着色器、事件视界、光子环
    ├── accretionDisk.js     # 吸积盘粒子系统：Keplerian轨道、拖尾、Doppler效应
    ├── starfield.js         # 3D 星点场：3000颗闪烁点粒子球壳
    ├── cosmicBackground.js  # Canvas 纹理宇宙背景：纯黑底 + 800颗远星
    ├── physics.js           # 物理工具函数：黑体辐射色、Kepler速度、Doppler频移
    ├── controls.js          # 左下角控制面板：温度/亮度/坍缩/粒子大小/旋转速度/黑洞大小
    └── index.html           # (根目录)
```

### 各文件职责

| 文件 | 职责 |
|------|------|
| `main.js` | 场景/相机/渲染器初始化，双通道渲染（PASS1→纹理, PASS2→屏幕叠加黑洞透镜），鼠标旋转/缩放/平移，控制面板事件接线 |
| `blackhole.js` | 自定义 ShaderMaterial，点质量引力透镜方程 `β = θ − θ_E²/θ`，事件视界软边，光子环发光，内部辉光，透镜→背景过渡 |
| `accretionDisk.js` | 3000粒子 Keplerian 轨道，Shakura-Sunyaev 温度分布，相对论 Doppler beaming，64点拖尾历史，坍缩引力坠落 |
| `starfield.js` | Fibonacci 分布 3000 星点，AdditiveBlending，闪烁动画，多色温分布(白/黄/橙/红) |
| `cosmicBackground.js` | Canvas 程序化纹理 + BackSide 大球体，纯黑基底叠加远星 |
| `physics.js` | 黑体辐射 `blackbodyColor(T)`、开普勒速度、Doppler 频移、引力偏转角 |
| `controls.js` | DOM 控制面板，6 滑块，事件发射器模式 |
| `styles.css` | `#000` 背景、控制面板半透明暗色浮层、滑块样式 |

## 黑洞物理结构

```
                        ┌─────────────────────────┐
                        │  宇宙背景 + 星空          │
                        │  (cosmicBackground +      │
                        │   starfield)              │
                        │                          │
                        │   ┌─────────────────────┐ │
                        │   │ 引力透镜球 (8Rs)      │ │
                        │   │  ┌─────────────────┐ │ │
                        │   │ │ 吸积盘粒子       │ │ │
                        │   │ │ (ISCO→22Rs)      │ │ │
                        │   │ │  ┌─────────────┐ │ │ │
                        │   │ │ │ 光子球(1.5Rs) │ │ │ │
                        │   │ │ │  ┌─────────┐  │ │ │ │
                        │   │ │ │ │ 事件视界  │  │ │ │ │
                        │   │ │ │ │  (Rs)    │  │ │ │ │
                        │   │ │ │ └─────────┘  │ │ │ │
                        │   │ │ └─────────────┘ │ │ │
                        │   │ └─────────────────┘ │ │
                        │   └─────────────────────┘ │
                        └──────────────────────────┘
```

### 物理效果一览

| 效果 | 描述 | 实现位置 |
|------|------|----------|
| **引力透镜** | 点质量透镜方程 `β=θ−θ_E²/θ`，光线弯曲、放大率、反转镜像 | `blackhole.js` Fragment Shader |
| **事件视界** | Schwarzschild 半径 Rs 纯黑核心，软边 smoothstep 过渡 | `blackhole.js` |
| **光子环** | 1.5Rs 处高斯辉光，温度驱动颜色（暖金↔蓝白），受粒子亮度联动 | `blackhole.js` |
| **内部辉光** | 视界→光子球之间幂衰减辉光，温度驱动颜色 | `blackhole.js` |
| **吸积盘** | 3000粒子 Keplerian 轨道 `ω∝r⁻³/²`，ISCO 内螺旋坠入、重生 | `accretionDisk.js` |
| **粒子温度** | Shakura-Sunyaev `T∝r⁻³/⁴`，黑体辐射 RGB 映射 | `accretionDisk.js` + `physics.js` |
| **多普勒效应** | 视线速度投影 → 蓝移增亮/红移变暗，相对论 beaming `I∝Doppler⁴` | `accretionDisk.js` |
| **粒子拖尾** | 64点历史轨迹，三次方衰减（头亮尾淡），速度自适应长度 | `accretionDisk.js` |
| **引力坍缩** | ISCO 内螺旋坠落 `dr/dt∝−√(Rs/r)`，视界吞噬+重生 | `accretionDisk.js` |

### 渲染管线

```
PASS 1 (→ sceneRT 纹理)
  renderer → sceneRT
    ├── cosmicBackground 球 (BackSide, fog:false)
    ├── starfield 点云 (AdditiveBlending, fog:false)
    └── accretionDisk 粒子 (AdditiveBlending)
  ↓ sceneRT.texture

PASS 2 (→ 屏幕)
  renderer → screen
    ├── [重复 PASS1 对象] 填满全屏背景
    └── blackHole ShaderMaterial 球 (采样 sceneRT.texture)
        ├── 引力透镜方程变换 UV
        ├── 放大率校正
        ├── 光子环 + 辉光叠加
        └── 外层渐变过渡
```

## 控制面板

| 滑块 | 功能 | 范围 |
|------|------|------|
| 🌡️ 粒子温度 | 吸积盘温度 + 光子环/辉光颜色 | 1200K–10000K |
| 💡 发光亮度 | 粒子亮度 + 光子环亮度 | 0–1 |
| 🌀 坍缩强度 | 引力坍缩力度 × 黑洞大小系数 | 0–1 |
| ⬛ 黑洞大小 | Schwarzschild 半径 Rs | 1.0–6.0 |
| 💫 粒子大小 | 吸积盘粒子尺寸 | 0.3–2.7 |
| 🔄 旋转速度 | 盘面视觉角速度（不影响 Doppler） | 0.3–4.3 |

## 操作快捷键

| 按键 | 功能 |
|------|------|
| 鼠标拖拽 | 旋转视角 |
| 滚轮 | 缩放 |
| 右键/Ctrl+左键拖拽 | 平移 |
| `R` | 重置视角 |
| `F` | 正面视角 |
| `T` | 俯视视角 |

## 依赖

- [Three.js](https://threejs.org/) (r160+, 本地加载 `js/lib/three.min.js`)
- 无需额外构建工具，纯前端运行
