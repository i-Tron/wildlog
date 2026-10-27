# 小鸟旅行游戏：2.5D 技术与美术资源规范

日期：2026-10-27
状态：设计草案，可进入原型实现

## 1. 技术结论

首版选择 **Cocos Creator 3.8 LTS + TypeScript + 2.5D 混合渲染**，发布目标先定为**微信小游戏**，再从同一工程构建 iOS / Android 独立 App。鸟窝 UI 和信息卡保持 2D，鸟、树、房间、地面和远景逐步替换成低多边形 3D 资产。Cocos 的官方发布目标同时覆盖 iOS、Android、Web 和微信小游戏，适合“先验证玩法，再扩展端”的路径；脚本使用 TypeScript。

这里的产品形态应理解为“微信小游戏”，而不是普通小程序页面。游戏主界面和 3D 场景都由 Cocos 渲染；文章、活动、商城等内容以后可以由独立内容服务或小程序页面承载。

首版不做开放世界 3D、AR 或实时 GPS，但保留 3D 资产和相机管线。迁徙路线先由可审阅的 JSON 规则驱动，AI 只生成明信片文案和对话候选，经过审核后进入内容库。

### 客户端边界

- `game/`：Cocos Creator 工程，负责场景、交互、动画、缓存和本地状态。
- `content/`：物种、季节、城市节点、明信片和徽章的 JSON 数据；字段可由内容编辑维护。
- `server/`（第二阶段）：账号同步、每日状态、积分流水、内容版本和审核接口。
- `admin/`（第二阶段）：物种卡、迁徙节点、明信片模板和奖励配置，不让 AI 直接改线上路线。

### 首个可玩闭环

每天打开游戏 → 看到今日来访 → 认识一只鸟 → 放进鸟窝 → 留鸟留下、候鸟按日历出发 → 收到一张明信片 → 点亮物种徽章。

垂直切片先做 3 种常见鸟、1 个鸟窝和 1 条迁徙闭环；验证通过后再扩展到 8–12 种鸟和 3 个区域。真实 GPS、自动识鸟、开放世界地图、社交排行和实体徽章都放到后续阶段。

## 2. 为什么选 Cocos

- 微信小游戏、iOS、Android 和 Web 有官方发布路径，后续不需要重写玩法层。
- 2D UI、3D 场景、Sprite、Sprite Atlas、模型、Animation Clip、骨骼动画和音频都在同一编辑器内完成。
- TypeScript 适合把“鸟种、季节、迁徙节点、明信片模板”做成强类型数据。
- 资源可以按鸟种、地区和季节拆成 Asset Bundle，控制微信小游戏首包大小。Cocos 支持导入 glTF 2.0 / FBX 模型，模型中的网格、材质、骨骼和动画可进入场景。

Cocos 的微信适配并非覆盖所有微信原生能力；需要视频、WebView、支付、定位、分享等能力时，保留一层 `platform/wechat` 适配器，直接调用微信 API，不把这些 API 写进鸟窝和迁徙业务逻辑。

## 3. 美术生产方式

### 3.1 工具分工

| 内容 | 推荐工具 | 交付物 |
| --- | --- | --- |
| 鸟、食物、栖木、背景原画 | Procreate / Photoshop / Affinity Designer | 分层源文件 + 透明 PNG |
| 低多边形鸟和 3D 场景 | Blender | `.blend` 源文件 + `.glb` 运行模型 + 贴图 |
| UI、图标、徽章版式、设计规范 | Figma | Figma 源文件 + 标注页 + PNG 导出 |
| 矢量形状和可重复模板 | Illustrator / Affinity Designer / Figma | SVG 源文件，必要时导出 PNG |
| 简单 UI / 物件动效 | Cocos Animation Clip | `.anim` / 场景内动画 |
| 3D 鸟动作 | Blender Armature 或 Spine | glTF 动画或 Spine 数据 |
| 复杂鸟动作（飞、转身、啄食） | Spine（第二阶段再引入） | `.json` 或 `.skel` + `.atlas` + `.png` |
| 音效和环境声 | Audacity / Reaper 等 | `.ogg` 为主，保留无损母版 |

Figma、Procreate、Blender 等文件是**设计源文件**，不能直接作为游戏运行资源。运行时以 PNG、图集、`.glb` 模型和 Cocos 动画资源为准。

### 3.2 首版运行格式

1. **2D UI、图标、明信片和少量装饰**：透明 PNG，按逻辑尺寸导出 2x；先统一使用 PNG，压缩在构建阶段处理。
2. **3D 鸟、树、房间和地面**：优先 `.glb`；保留 `.blend` 源文件。一个模型只使用少量材质，纹理尺寸从 512 或 1024 起步。
3. **相机**：默认使用正交相机制造绘本式 2.5D 观感；需要展示体积时再切换小视角透视相机。
4. **小图标和徽章**：透明 PNG，保留 1x/2x 两档；需要清晰边缘时由源 SVG 导出，不在运行时依赖 SVG。
5. **多张小图**：合并为 Cocos Sprite Atlas（`.png` + `.plist`），按“鸟种 / 场景 / UI”分组。
6. **简单动画**：分层 PNG + Cocos Animation Clip；例如翅膀轻摆、呼吸、眨眼、漂浮。
7. **复杂动画**：3D 鸟优先用 Blender 骨骼并导出 glTF 动画；如果采用 2D 骨骼，再接 Spine。每个角色必须交付骨骼数据、图集数据和 PNG，不能只交一个视频或 GIF。
8. **数据资源**：JSON，和美术资源分离。图片换版不应修改物种和迁徙规则。

### 3.3 画布与清晰度

- UI 设计基准：`750 × 1624`，适配安全区；代码使用 Cocos 的适配组件，不把刘海和底部手势区画死。
- 鸟角色原画工作尺寸：最短边不低于 1024 px；运行时按 512 px 或 256 px 档位导出。
- 小鸟在鸟窝里的常用显示尺寸：约 160–320 逻辑像素；徽章图标：256 × 256；明信片插画：1536 × 1024。
- 单张运行图尽量不超过 2048 × 2048；大背景拆层，避免一张超大图覆盖整个场景。
- 3D 低多边形角色优先控制在 3,000–8,000 三角形；近景主角再单独提供高档模型。
- 场景使用少量灯光、烘焙或卡通材质，先保证微信小游戏中低端机稳定，再增加粒子、雾和动态光。
- 每个可动部件保留透明边距和明确锚点；鸟的脚、坐垫接触点和转身中心必须在标注页写清楚。

## 4. 鸟种资源包规范

每个物种一个目录，例如 `swallow/`：

```text
swallow/
  source/
    swallow_master.psd      # 或 .kra / .afdesign，分层母稿
    swallow_model.blend     # 3D 源模型（若采用 3D 鸟）
    swallow_ui.fig           # 若有专属 UI 组件
  runtime/
    bird_swallow.glb         # 3D 模型、骨骼和动画（若采用 3D 鸟）
    bird_swallow_idle.png
    bird_swallow_eat.png
    bird_swallow_sleep.png
    bird_swallow_depart.png
    bird_swallow_atlas.png
    bird_swallow_atlas.plist
    bird_swallow_badge.png
    bird_swallow_silhouette.png
  preview/
    swallow_contact_sheet.png
  manifest.json
```

`manifest.json` 至少包含：

```json
{
  "species_id": "swallow",
  "display_name": "家燕",
  "residency": "migrant",
  "poses": ["idle", "eat", "sleep", "depart"],
  "badge_asset": "bird_swallow_badge",
  "anchor": {"foot_x": 0.5, "foot_y": 0.88},
  "source_revision": "2026-10-27.v1"
}
```

`residency` 只允许 `resident`、`migrant`、`winter_visitor`、`passage` 四种值，避免把“候鸟”只写在图片文件名里。

## 5. 设计规范 v0.1

### 视觉方向

关键词：纸张、手绘、安静、轻微不完美、自然观察。3D 模型使用低多边形和手绘贴图，配合正交相机、柔和阴影和轻微景深，保持绘本而不是写实游戏的感觉。背景使用低对比米白和植物绿，鸟和徽章用一到两个高识别色。鸟的外轮廓在手机小尺寸下必须清楚，羽毛细节只保留能帮助识别的部分。

建议先固定：

- 主色：苔藓绿、纸张米白、河水蓝、日落橙、泥滩棕。
- 线条：统一外轮廓粗细；不要每种鸟换一种描边风格。
- 阴影：只用一层柔和投影，不做写实光照。
- 鸟的朝向：正侧面用于识别卡，三分之二侧面用于鸟窝，剪影用于“猜鸟”。
- 每个物种先做四个状态：待访、在窝、进食、出发；不要一开始做十几套动作。

### 每种鸟的最小交付清单

- 识别卡立绘 1 张
- 剪影 1 张
- 鸟窝静态立绘 1 张
- 待机、进食、睡觉、出发 4 个状态
- 物种徽章 1 枚
- 明信片小插图 1 张
- 颜色与轮廓标注 1 页
- 不可公开的敏感地点不进入画面和文案

### 命名

统一使用小写英文、下划线和稳定 ID：

```text
bird_swallow_idle.png
bird_swallow_eat.png
bird_swallow_badge.png
bg_nest_spring.png
ui_badge_frame_gold.png
postcard_swallow_moscow_01.png
```

代码里的 `species_id`、图片文件名和徽章 ID 一旦上线不再改名；中文名、物种学名和文案可以在数据层更新。

## 6. 迁徙路线与 AI 边界

路线数据使用城市级节点，不显示精确巢址、夜栖点或可追踪个体的实时位置：

```json
{
  "route_id": "swallow_2027_spring",
  "species_id": "swallow",
  "season": "spring",
  "legs": [
    {"city": "昆明", "arrive": "03-01", "depart": "03-10"},
    {"city": "北京", "arrive": "04-15", "depart": "05-01"},
    {"city": "赤峰", "arrive": "05-05", "depart": "05-20"}
  ],
  "status": "demo"
}
```

AI 可以根据已审核的节点生成“明信片口吻”和科普草稿，但不能自行创造城市节点、日期、保护区规则或“今天一定能看到”的结论。

## 7. 交付验收

鹿老师第一次交付不需要做全套鸟库，只做 3 种鸟的完整资源包：一只留鸟、一只候鸟、一只冬候鸟。每种都能在测试场景里完成待机、进食、睡觉、出发和徽章展示；所有源文件、PNG、图集、锚点和 manifest 齐全，手机小屏上轮廓可辨。

技术侧用这 3 种鸟接通一个鸟窝场景、一个迁徙时间线和一张明信片，确认资源命名、图集加载、模型导入、材质、相机、DPI、锚点、动画状态和换肤流程都顺畅，再批量扩展物种。
