# 黑胶 · 网易云音乐桌面播放器

一个跑在 Ubuntu 上的网易云音乐桌面客户端。**不逆向、不抓流地址**，所有音乐能力都通过网易云音乐官方 `ncm-cli`（`@music163/ncm-cli`）开放平台接口获得，出声交给 ncm-cli 内置的 mpv 后端，界面负责「遥控 + 展示」。

```
React 渲染层 → contextBridge → IPC 白名单 → ncm-cli 适配层 → ncm-cli → mpv
```

## 功能

| 模块 | 说明 |
| --- | --- |
| 首次启动向导 | 自动检测 Node / ncm-cli / mpv，引导写入 appId + privateKey，生成扫码登录链接并每 3 秒轮询登录态 |
| 搜索 | 单曲 / 歌单 / 歌手 / 专辑，320ms 防抖，不可播曲目置灰标注原因 |
| 发现页 | 每日推荐主卡、推荐歌单网格、每日曲目表 |
| 歌单详情 | 封面头部、创建者、播放全部、批量加入队列 |
| 播放控制 | 播放/暂停、上/下一首、进度拖动（seek）、音量（140ms 合并防抖）、播放队列抽屉 |
| 歌词 | LRC 逐行高亮 + 自动居中滚动，支持翻译歌词对齐，点击歌词跳转 |
| 全屏播放页 | 旋转黑胶唱片 + 大号歌词舞台，未播时停针 |
| AI 点歌 | OpenAI 兼容 function calling，可直接搜索并播放、调音量、切歌、建歌单；未配置 Key 时用本地意图解析兜底 |
| 桌面集成 | 无边框窗口、系统托盘菜单、全局媒体键；**关闭窗口即退出并停止播放**，最小化则继续后台播放 |

## 环境要求

- Ubuntu 22.04+（本项目在 24.04 / X11 实测）
- **Node.js ≥ 22.12**（ncm-cli 的 `engines` 只写了 ≥18，但它依赖的 `@clack/prompts@1.x` 是纯 ESM 包，
  Node 22.12+ 才支持 `require(esm)`；用 18/20 运行 `ncm-cli configure` 会直接抛 `ERR_REQUIRE_ESM`）
- `mpv`（ncm-cli 的默认播放后端）
- 网易云音乐开放平台账号（个人实名入驻），用于获取 appId / privateKey

```bash
# 1. 装播放后端
sudo apt install -y mpv

# 2. 装 ncm-cli
sudo npm install -g @music163/ncm-cli
ncm-cli --version   # 期望 0.1.x

# 3. 首次配置（也可以完全在应用向导里完成）
ncm-cli configure
```

`configure` 需要交互式终端。在脚本或非 TTY 环境里可以这样写：

```bash
ncm-cli configure --app-id=<appId> --private-key-file=/path/to/key.txt
# 或
NETEASE_APP_ID=<appId> NETEASE_PRIVATE_KEY=<privateKey> ncm-cli login
```

**如果 Node 版本不够**（`ERR_REQUIRE_ESM: require() of ES Module ... @clack/prompts`），升级：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # 需 ≥ 22.12
```

也可以临时指定 node 二进制：`sudo ln -sf /path/to/node22/bin/node /usr/local/bin/node`
（`/usr/bin/env node` 会优先命中 `/usr/local/bin/node`）。

> 安装 mpv 时若遇到 `udev 依赖 libudev1` 版本冲突，可执行
> `sudo apt install -y --allow-downgrades libudev1=<udev 要求的版本> mpv`。

## 使用说明

### 1. 安装与启动

```bash
# 方式 A：deb 安装（推荐，会进应用列表、带图标）
sudo dpkg -i release/ncm-player_1.0.0_amd64.deb
sudo apt install -f          # 若提示缺少依赖

# 方式 B：AppImage（免安装）
chmod +x release/黑胶音乐-1.0.0.AppImage
./release/黑胶音乐-1.0.0.AppImage

# 方式 C：源码运行
npm install && npm run dev
```

> deb 的 `Depends` 已声明 `mpv`，未装时 `apt` 会自动补齐。

### 2. 首次启动向导

窗口第一次打开会自动进入四步向导，顶部状态条显示当前进度：

| 步骤 | 做什么 | 说明 |
| --- | --- | --- |
| ① 环境自检 | 检查 Node / ncm-cli / mpv | 缺什么就在该行右侧点「复制」，粘贴到终端执行，装完点「重新检测」 |
| ② 开放平台凭证 | 填 appId + privateKey | 点「打开开放平台控制台」查看应用详情；也可在终端跑 `ncm-cli configure` |
| ③ 扫码登录 | 点「生成登录链接」 | 浏览器会自动打开授权页，用网易云音乐 App 扫码；页面每 3 秒自动检测，成功后自动跳第 4 步 |
| ④ 完成 | 点「进入播放器」 | 之后启动会直接进主界面，不再走向导 |

凭证与登录态都保存在本机（`~/.config/ncm-cli`），应用自己不存私钥。

### 3. 界面导览

```
┌───────────────────────────────────────────────────────────┐
│ 标题栏：品牌 / 连接状态灯 / 最小化 最大化 关闭（关闭=退出并停播） │
├──────────┬──────────────────────────────┬─────────────────┤
│ 左侧栏   │ 主内容区                     │ 右侧面板        │
│ 发现     │ 发现 / 搜索 / 歌单详情       │ 歌词 | AI 点歌  │
│ 搜索     │ / 全屏播放页                 │（可收起）       │
│ 歌词     │                              │                 │
│ AI 点歌  │                              │                 │
│ 播放队列 │                              │                 │
├──────────┴──────────────────────────────┴─────────────────┤
│ 底部播放栏：封面 曲名 → 上一首/播放/下一首 → 进度 → 音量 → 队列 │
└───────────────────────────────────────────────────────────┘
```

### 4. 日常操作

| 想做的事 | 操作 |
| --- | --- |
| 播放某首歌 | 任意曲目行点击「▶」，或点行内「＋」先入队 |
| 播放整张歌单 | 歌单详情页 → 「播放全部」 |
| 加入队列 | 曲目行右侧「＋」；歌单页的「加入队列」一次加 20 首 |
| 暂停 / 继续 | 底部播放栏中间大圆按钮，或空格以外的媒体键 |
| 切歌 | 底部「⏮ / ⏭」 |
| 拖进度 | 直接拖动底部进度条，松手生效（进度条上会显示时间气泡） |
| 调音量 | 右下角滑块；点喇叭图标可一键静音 / 恢复 |
| 看队列 | 左侧「播放队列」或播放栏右侧队列按钮，抽屉里可点任意一首跳播、点「×」移除、右上角「清空」 |
| 看歌词 | 左侧「歌词」或播放栏的麦克风图标；点击任一行歌词可跳转到该时间点 |
| 全屏播放页 | 点击播放栏左侧的圆形封面 |
| 退出 / 后台播放 | 点关闭（X）会**退出应用并停止播放**；想边听边做别的事请用最小化，进程还在、音乐继续。托盘右键可播放/暂停、上下一首、显示窗口、退出 |

**全局媒体键**支持 `MediaPlayPause` / `MediaNextTrack` / `MediaPreviousTrack`，
若被桌面环境占用会在日志里提示。

### 5. AI 点歌

右侧面板切到「AI 点歌」，直接说人话：

- 「放点适合写代码的歌」「来点林俊杰」
- 「音量 40」「下一首」「暂停」「今天听什么」

**未配置模型**时使用本地规则解析，上面这些都能用；
配置模型后可理解更复杂的表达。点面板右上角齿轮填 `baseUrl / model / apiKey`，
兼容 DeepSeek、通义、Ollama 等 OpenAI 格式接口，Key 用系统钥匙串加密后存本机。

每次执行的工具调用会在气泡下方逐步列出（成功绿勾 / 失败红叉），不是黑盒。

### 6. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 提示「尚未配置开放平台凭证」 | 在向导第 ② 步填 appId/privateKey，或终端 `ncm-cli configure` |
| 提示「登录已失效」 | 向导第 ③ 步重新扫码；应用会自动让会话缓存失效 |
| 提示「请求总量超限」 | 开放平台每日调用配额用尽，等次日或去控制台查看剩余次数 |
| 没有声音 | 确认 `mpv --version` 可用；`ncm-cli config get player` 应为 `mpv` |
| 进度条偶尔跳一下 | 进度来自 `ncm-cli state` 的 1.5 s 轮询（CLI 无推送能力），属预期 |
| `configure` 报 `ERR_REQUIRE_ESM` | Node < 22.12，见上文「环境要求」升级 |
| 装在 dock 里图标没变 | 卸载重装 deb（图标已内嵌），或用 `gtk-update-icon-cache` 刷新缓存 |
| 从应用列表启动闪退，日志有 `setuid_sandbox_host` | 旧版包的 `chrome-sandbox` 权限不对，手动修：`sudo chown root:root "/opt/黑胶音乐/chrome-sandbox" && sudo chmod 4755 "/opt/黑胶音乐/chrome-sandbox"`（v0.6.1 起由安装脚本自动处理） |

## 项目结构

```
ncm-player/
├── electron/                主进程
│   ├── main.ts              窗口 / 单实例 / 托盘 / 媒体键 / 状态广播
│   ├── preload.ts           contextBridge 白名单 API
│   ├── ipc.ts               channel → handler，zod 校验
│   ├── store.ts             本地配置（AI Key 走 safeStorage）
│   ├── tray.ts              托盘菜单
│   ├── ncm/                 ncm-cli 适配层（runner / discovery / command-map /
│   │                        normalize / catalog / player / lyric / session）
│   └── ai/                  AI 点歌（tools 工具集 / local 本地兜底 / service 编排）
├── src/                     渲染层
│   ├── components/          通用组件 + setup/ 向导步骤
│   ├── pages/               发现 / 搜索 / 歌单详情 / 全屏播放 / 向导
│   ├── lib/                 api 桥接 / zustand 状态 / 格式化 / mock 预览
│   └── shared/              主进程与渲染层共享的类型与纯函数
├── spec/                    规格与变更记录（先改规格再改代码）+ 测试策略
├── docs/                    ncm-cli 命令树快照、测试用例清单
├── test/                    单元测试（vitest）与 CLI 输出夹具
├── scripts/                 主进程打包、命令树探针、图标生成
├── build/                   应用图标（打包资源）
└── 配置：vite / tailwind / postcss / tsconfig.* / electron-builder.yml
```

## 开发

```bash
npm install

npm test           # 单元测试（46 例，vitest）
npm run dev        # Electron 桌面开发模式（自动构建主进程 + Vite HMR）
npm run dev:web    # 纯浏览器预览（自动降级为 mock 数据，便于调 UI）
npm run build      # 构建渲染层与主进程
npm run dist       # 打包 deb + AppImage 到 release/
```

`npm run dev:web` 会把 `window.ncm` 缺失的场景交给 `src/lib/mock.ts`，
因此无需真实账号也能完整走查界面与交互。

## 规格与性能

本轮迭代按 spec 驱动，规格文档在 `spec/`：

- `spec/README.md` — 规格索引与**变更记录规则**（任何改动都必须先落规格、再落代码）
- `spec/requirements.md` — 实测基线（每条 CLI 调用耗时）、7 条可验收需求、验收结果对比
- `spec/design.md` — 缓存、懒加载、轮询让路的取舍与风险
- `spec/tasks.md` — 11 项任务与逐项实测数据
- `spec/changelog.md` — 全部变更记录（新增 / 修改 / 删除）
- `spec/testing.md` — 测试分层、门禁、缺陷分级
- `docs/test-cases.md` — 46 条自动化用例 + 60 条手工用例（含优先级与执行记录）

关键数字：

| 指标 | 优化前 | 现在 |
| --- | --- | --- |
| 窗口可见 | ≈ 4.65 s | **437 ms** |
| 启动期阻塞 CLI 调用 | 6 次 | **0 次** |
| 安装包 `app.asar` | 36 MB | **524 KB** |

观测方式：

```bash
NCM_DEBUG=1 npm run dev
# [boot] window ready 437ms
# [cli] recommend daily ... 1470ms
```

## 架构

```
electron/
├── main.ts            窗口 / 单实例 / 托盘 / 媒体键 / 状态广播
├── preload.ts         contextBridge 暴露的白名单 API（contextIsolation + sandbox）
├── ipc.ts             channel → handler，zod 校验，统一错误码
├── store.ts           本地配置；AI Key 用 safeStorage 加密
└── ncm/
    ├── runner.ts      execFile 封装：串行队列、JSON 提取、错误归一
    ├── discovery.ts   解析 `ncm-cli commands`，生成能力可用性矩阵
    ├── command-map.ts 能力 → 命令模板的声明式映射（含多候选回退）
    ├── normalize.ts   与 CLI 输出结构无关的歌曲/歌单归一化
    ├── catalog.ts     搜索 / 歌单 / 每日推荐 / 歌词 + LRU
    ├── player.ts      播控、队列镜像、state 心跳与自动续播
    ├── lyric.ts       LRC 解析、翻译合并
    └── session.ts     环境自检、凭证写入、扫码登录
src/                   React 渲染层（页面 / 组件 / 状态）
```

### 为什么要有「命令映射层」

ncm-cli 的命令树**由服务端动态下发**：启动时上报本地命令版本、拉取增量，新增命令不需要升级客户端。这意味着任何硬编码的命令清单都会过期。因此：

1. 每个能力（`searchSong` / `dailyRecommend` / `getLyric` …）在 `command-map.ts` 里挂多条候选模板；
2. 运行期用 `ncm-cli commands` 判断哪条真实存在，取第一条命中的；
3. 全部落空时在 UI 隐藏入口，而不是让用户点了没反应；
4. 需要时可用 `~/.config/ncm-player/ncm-player.json` 的 `commandOverrides` 直接覆盖某个能力的 argv。

`docs/NCM-COMMANDS.md` 与 `docs/command-tree.json` 是本机实测快照，可用
`node scripts/probe-cli.mjs` 随时重新采集（换账号或 CLI 升级后建议重跑）。

## 安全设计

- `execFile('ncm-cli', args)` 传数组参数，不经过 shell，关键词/歌单名不会被解释成命令
- 渲染层 `nodeIntegration:false`、`contextIsolation:true`、`sandbox:true`，只能访问 `window.ncm` 白名单
- privateKey 只在主进程通过 `ncm-cli config set` 写入，不落渲染层、不进日志
- AI Key 用 `safeStorage`（系统钥匙串）加密后落盘

## 已知限制

- 一阶段播放出声完全依赖 ncm-cli + mpv，进度条来自 `ncm-cli state` 的 1Hz 轮询，自解码能力预留了 `PlaybackBackend` 抽象待二期接入
- ncm-cli 动态命令（`search` / `song lyric` / `playlist` 等）需要**有效凭证 + 已登录**才会注册；未配置时这些入口会自动隐藏或提示
- 每人每天的开放平台接口调用次数有上限，超限时应用会原样提示「请求总量超限」
- 若 Electron 在虚拟机里因 GPU 崩溃，用 `NCM_DISABLE_GPU=1 npm run dev`
- 应用退出后 `mpv` 会转为 `--idle` 常驻（无音频输出），这是 ncm-cli 的「快速恢复」设计；
  真正出声的播放会被 `ncm-cli stop` 停止
