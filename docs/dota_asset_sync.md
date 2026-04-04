# Dota 资产手动更新流程

本项目将 Dota 2 地图、英雄头像、英雄小图、物品图标以及部分文本源文件视为“随 parser 版本一起更新的仓库资产”。

这意味着：
- 不做运行时自动同步
- 当我们准备支持新的 replay / patch 版本时，手动执行一次提取工具
- 提取结果直接提交到 git

## 当前策略

- 解析器版本和资源版本一起推进
- 提取源优先使用本地 Dota 2 安装目录
- 资源产物落盘到项目目录
- 前端优先消费仓库内静态资源
- 录像主工作区的物品图标只使用仓库内静态资源，不再运行时回退到远端 CDN

## 输出目录

提取后的前端资源会落到：

- `frontend/public/assets/dota/minimap/`
- `frontend/public/assets/dota/heroes/`
- `frontend/public/assets/dota/heroes/icons/`
- `frontend/public/assets/dota/items/`

提取出的源文本与元数据会落到：

- `frontend/extracted/dota/source/`
- `frontend/extracted/dota/manifest.json`

基于提取文本生成的前端物品 tooltip 本地化数据会落到：

- `frontend/src/renderer/data/itemTooltipLocalization.generated.json`

## 工具能力

脚本路径：

- `frontend/scripts/sync-dota-game-assets.js`
- `frontend/scripts/generate-item-tooltip-localizations.mjs`
- `frontend/scripts/render-dota-world-minimap.mjs`

当前脚本支持：

- 从本地 `pak01_dir.vpk` 读取目录树
- `--inspect` 模式下检查当前 Dota 安装是否包含目标资源
- 调用外部 `Source2Viewer-CLI` 手动提取以下资源
- 英雄头像
- 英雄小图
- 物品图标
- 小地图底图相关纹理
- `dota_*.txt`
- `abilities_*.txt`
- `scripts/items/items_game.txt`
- `scripts/npc/items.txt`
- `scripts/npc/neutral_items.txt`
- 基于 `abilities_english.txt / abilities_schinese.txt` 与 `scripts/npc/items.txt` 生成物品中文名、描述、注释、背景故事的前端数据文件，并用官方 KV 数值替换 tooltip 占位符

当前小地图提取约定：

- `minimap.png`: 项目默认地图，由 `minimap_source.png` 自动放大生成，默认输出 `3072x3072`
- `minimap_source.png`: 当前默认链路使用的官方 overview 源图，来自 `materials/overviews/dota.vmat_c` 导出的 `dota.png`
- `minimap_game.png`: 游戏 Panorama 中的写实原图，来自 `panorama/images/textures/minimap_game_png.vtex_c`
- `minimap_simple.png`: 本地高分辨率简易图，来自 `panorama/images/textures/dotamap683_psd.vtex_c`
- `minimap_minimal.png`: 官方 `1024x1024` 简化风格 overview，来自 `materials/overviews/dota_minimal*.vmat_c`
- `background.png`: HUD 用的低分辨率背景图，来自 `panorama/images/minimap/background_png.vtex_c`
- `dotamap.png`: 旧的简易底图，来自 `panorama/images/minimap/dotamap_psd.vtex_c`
- `icons/tower_outer.png`: 官方外塔环形图标，来自 `panorama/images/minimap/*_tier1_png.vtex_c` 并裁掉透明边
- `icons/tower.png` / `icons/tower_90.png`: 官方高地塔 / 基地图标，来自 `materials/vgui/hud/minimap_tower*.vmat_c`
- `icons/racks_45.png` / `icons/racks_90.png`: 官方兵营图标，来自 `materials/vgui/hud/minimap_racks*.vmat_c`
- `icons/ancient.png`: 官方遗迹图标，来自 `materials/vgui/hud/minimap_ancient.vmat_c`
- `reference/base_group.png`: 官方高地三件套合成参考图，来自 `panorama/images/minimap/*_base_png.vtex_c` 并裁掉透明边

目前本机 7.41 资源里，与当前写实小地图同源的官方 overview 贴图原生上限是 `512x512`；游戏 Panorama 中的 `minimap_game_png` 则是 `400x400`。脚本会优先保留这张 `512x512` overview 源图，再自动生成更适合前端显示的高清默认图。

建筑层素材现已明确分成两类：

- `panorama/images/minimap/*tier1/*tier2/*base*` 适合作为“官方示意块参考图”
- `materials/vgui/hud/minimap_tower* / minimap_racks* / minimap_ancient` 才是适合逐建筑实时显隐的独立官方图标

因此当前前端建筑渲染不再拆 `dotamap_*_buildings.png`，而是优先使用这套独立 HUD 图标。

## 高清写实小地图生成

基础同步脚本现在会自动完成：

- 提取 `materials/overviews/dota.vmat_c`
- 保留官方同源源图到 `frontend/public/assets/dota/minimap/minimap_source.png`
- 保留 Panorama 原图到 `frontend/public/assets/dota/minimap/minimap_game.png`
- 使用 `sharp` 以 `lanczos3` 重采样并锐化，生成 `frontend/public/assets/dota/minimap/minimap.png`

默认约定：

- 默认输出尺寸：`3072x3072`
- 默认输出不再补透明边框，`minimap.png` 直接铺满整张图

## 实验性 world 渲染

仓库里仍然保留了：

- `frontend/scripts/render-dota-world-minimap.mjs`

这条链路会基于 `world.glb` 做模型俯视渲染，但它生成的是“地图模型视角”，不是当前项目所需的官方 minimap 美术。除非你明确想做实验性对照，否则不建议把它作为默认地图更新流程的一部分。

## 依赖

真实提取依赖 [ValveResourceFormat / Source2Viewer](https://github.com/ValveResourceFormat/ValveResourceFormat) 的 CLI。

脚本会查找：

- `--vrf-cli <path>`
- 环境变量 `SOURCE2VIEWER_CLI`
- 环境变量 `VRF_CLI`
- PATH 中的 `Source2Viewer-CLI`

推荐优先使用上游 GitHub Releases 的预编译 CLI，而不是把工具提交进仓库。

2026-03-25 已验证可用的版本：

- `ValveResourceFormat/ValveResourceFormat` release `18.0`
- macOS Apple Silicon: `cli-macos-arm64.zip`
- 本机验证 build: Dota 2 `buildId=22492873`

如果后续 release 版本升级，优先替换为更新的官方预编译包，再重新运行提取脚本即可。

## 常用命令

先检查本地 Dota 安装中的资源是否齐全：

```bash
cd frontend
npm run assets:sync:dota -- --inspect --patch 7.41
```

执行真实提取：

```bash
cd frontend
SOURCE2VIEWER_CLI=/absolute/path/to/Source2Viewer-CLI \
  npm run assets:sync:dota -- --patch 7.41 --language schinese
```

提取文本后刷新前端物品 tooltip 本地化数据：

```bash
cd frontend
npm run assets:generate:item-tooltips
```

在 macOS Apple Silicon 上下载官方 CLI 的一个示例：

```bash
curl -sSfL \
  https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/18.0/cli-macos-arm64.zip \
  -o /tmp/cli-macos-arm64.zip
unzip -q -o /tmp/cli-macos-arm64.zip -d /tmp/source2viewer-cli

cd frontend
SOURCE2VIEWER_CLI=/tmp/source2viewer-cli/Source2Viewer-CLI \
  npm run assets:sync:dota -- --patch 7.41 --language schinese
```

如果 Dota 安装目录不在默认位置：

```bash
cd frontend
SOURCE2VIEWER_CLI=/absolute/path/to/Source2Viewer-CLI \
  npm run assets:sync:dota -- \
  --patch 7.41 \
  --dota-root "/path/to/dota 2 beta"
```

## 推荐更新节奏

每次版本升级时，按下面的顺序做：

1. 等 Clarity / parser 分支准备好
2. 确认新的 replay 已能稳定解析
3. 运行 `--inspect` 看本地资源路径是否仍符合预期
4. 执行真实提取
5. 目检小地图、英雄头像、物品图标是否正常
6. 提交代码、资源和 `manifest.json`

## 当前已验证结果

2026-03-25 已完成一次真实提取，产物已落盘到仓库：

- `frontend/extracted/dota/manifest.json` 记录 `patch=7.41`
- `buildId=22492873`
- 英雄头像 `128`
- 英雄小图 `127`
- 物品图标 `601`
- 小地图相关文件 `6`
- 文本源文件 `5`

2026-03-27 已补充 minimap 官方建筑图标资产：

- `frontend/public/assets/dota/minimap/icons/`
- `frontend/public/assets/dota/minimap/reference/base_group.png`
- `frontend/public/assets/dota/minimap/minimap_minimal.png`

## 当前前端资源读取逻辑

- 地图优先读取 `frontend/public/assets/dota/minimap/minimap.png`
- `minimap.png` 现在由基础提取脚本自动生成，不再依赖 world 渲染
- 当前默认源图保留在 `frontend/public/assets/dota/minimap/minimap_source.png`
- 游戏内 `400x400` 原图保留在 `frontend/public/assets/dota/minimap/minimap_game.png`
- 当前前端默认把 `minimap.png` 视为无透明边的整图坐标空间，优先回退到 `minimap_source.png / minimap_game.png / minimap_simple.png`
- 若新资产尚未提取，会自动回退到现有的 `minimap_740.png` / `minimap.jpg`
- 录像主工作区的物品图标固定读取 `frontend/public/assets/dota/items/*.png`
- 若本地静态资源缺失，前端直接退回文字缩写占位，不再请求后端缓存代理与 Steam CDN

## 备注

- 这个流程的目标是“分支内资源版本可复现”，不是“用户机器上自动无感升级”
- 如果未来要开始消费本地提取的 tooltip / 本地化文本，再基于 `frontend/extracted/dota/source/` 生成新的前端数据文件即可
