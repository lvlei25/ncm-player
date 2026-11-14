# ncm-player 规格说明（Requirements）

> 本轮迭代主题：**代码结构治理 + 启动与请求性能**。
> 每一项都要求可量化验收，避免「感觉快了」。

## 1. 现状基线（实测，非估算）

### 1.1 CLI 单次调用耗时（Node 22.12 / ncm-cli 0.1.7）

| 命令 | 耗时 | 性质 |
| --- | --- | --- |
| `ncm-cli login --check` | **1673 ms** | 需网络 |
| `ncm-cli user info` | **1485 ms** | 需网络 |
| `ncm-cli state` | 504 ms | 本地进程 + IPC |
| `ncm-cli queue` | 508 ms | 本地进程 + IPC |
| `ncm-cli commands` | 476 ms | 本地进程 + IPC |
| `ncm-cli config list` | 483 ms | 本地读文件 |

> 结论：**每次 CLI 调用都有 0.5s 起的固定成本**（Node 进程冷启动），带网络的命令 1.5s+。
> 因此「少调用一次」比「调用得更快」收益大一个数量级。

### 1.2 启动链路（改动前）

`bootstrap()` 串行执行：`session.status()`（`config list` + `login --check` + `user info`）→ `player.state` → `player.queue`。

- CLI 调用次数：**6 次**
- 理论耗时：483 + 1673 + 1485 + 504 + 508 ≈ **4.65 s**（实测首屏 4~5 s）
- 之后 `refreshEnv()` 再跑 `ncm-cli --version` / `mpv --version` / `config list` / `login --check`，**又重复了 1.7s 的登录探测**

### 1.3 轮询放大问题

首次启动向导在未登录时每 3 s 轮询一次 `session.status()`，而它每次都要跑完整三连（≈3.6 s）。
串行队列下这会让队列长期被占满，用户点击「生成登录链接」要排队数秒才有反应。

### 1.4 超大文件

| 文件 | 行数 | 问题 |
| --- | --- | --- |
| `electron/ai/service.ts` | 338 | 工具定义 + 工具执行 + 远端循环 + 本地兜底混在一起 |
| `src/pages/Setup.tsx` | 380 | 四个步骤的全部 UI 挤在一个组件里 |
| `src/lib/mock.ts` | 327 | 演示数据与桥接实现混在一处 |

### 1.5 重复逻辑

- 歌词「当前行定位」实现了两遍：`electron/ncm/lyric.ts:activeLineIndex` 与 `src/lib/lrc.ts:activeIndex`（同算法、同边界，改一处忘另一处即出错）
- `electron/ncm/runner.ts` 同时导出 `playerQueue` 与 `cliQueue`，而 `playerQueue` 已无实际作用

## 2. 功能需求

### R1 会话状态缓存（性能）

- 主进程维护会话状态缓存，TTL 60 s。
- 在以下事件发生时立即失效：保存凭证、登出、扫码登录成功检测。
- 验收：60 s 内重复调用 `session:status` **不产生任何 CLI 调用**；向导 3 s 轮询在缓存有效期内 CLI 调用数为 **0**。

### R2 环境自检去重（性能）

- `env:check` 不再重复执行 `login --check`，登录态一律读会话缓存。
- 验收：`env:check` 的 CLI 调用 ≤ 3 次（`ncm-cli --version`、`mpv --version`、`config list`），耗时下降 ≥ 40%。

### R3 启动链路精简（性能）

- 首屏只依赖：会话状态（缓存命中）+ `player.state`。
- 播放队列改为**懒加载**：首次打开队列抽屉或队列长度变化时才拉取。
- 验收：首屏 CLI 调用 ≤ 3 次、`ready` 时间 **< 1.8 s**（改动前约 4.65 s）。

### R4 轮询不与用户操作抢队列（性能 / 体验）

- `state` 心跳改为 1.5 s，且当串行队列有待处理任务时**跳过本次轮询**（不排队）。
- 验收：播放中执行搜索，搜索结果返回耗时不超过 1.3 × 单次搜索耗时（不再被 1 Hz 的 state 挤占）。

### R5 文件规模（结构）

- 单文件 **≤ 300 行**（`electron/`、`src/` 下所有 `.ts/.tsx`）。
- 验收：`wc -l` 全部达标。

### R6 消除重复（结构）

- 歌词当前行定位只保留一份实现，主进程与渲染层共用。
- 删除已无用途的 `playerQueue` 导出。
- 验收：全局搜索 `activeLineIndex` / `activeIndex` 只命中一处实现；`runner.ts` 只导出 `cliQueue`。

### R7 错误边界（健壮性）

- 渲染层加 React ErrorBoundary：任意页面抛错时显示可恢复的兜底界面，而不是整窗白屏。
- 验收：在 `Discover` 人为抛错后，窗口显示兜底 UI 且可返回首页。

## 3. 非功能约束

- 不改变既有对外行为：`window.ncm` 契约（`src/shared/api.ts`）保持兼容，仅允许新增可选参数。
- 不引入新依赖（除开发期工具外）。
- 所有 CLI 调用仍需串行（`ncm-cli` 并发会互相覆盖 token 刷新，这是真实现象，见 `runner.ts` 注释）。
- `npx tsc -b` 必须零错误；`npm run build` 必须通过。

## 3.1 追加需求 R8（v0.6.0）：测试与文档

- 自动化测试覆盖「易变契约」层：CLI 输出归一化、命令树解析与候选回退、歌词解析定位、格式化工具
- 测试夹具必须取自**真实 CLI 输出**，不允许按文档臆造 schema
- 手工用例按模块编号，含前置条件、步骤、预期、优先级
- 合入门禁：`npm test` 全绿 + `tsc -b` 零错误 + `npm run build` 成功
- 验收：自动化用例 ≥ 40 条且全通过；手工 P0 用例全部有明确结论

## 3.2 追加需求 R9（v0.6.2）：退出必须停止播放

- 关闭窗口 / 托盘退出 / `app.quit()` 任意路径退出时，必须先下发 `ncm-cli stop`，再结束进程
- 退出后再执行 `ncm-cli state`，`status` 必须为 `stopped`、`position` 为 0
- 关闭窗口 = 退出并停播；最小化 = 进程存活、播放继续（后台播放仍可用）
- 验收：播放中用 Alt+F4 关闭，`ps` 中 Electron 进程为 0 且 `ncm-cli state` 为 stopped

## 3.3 追加需求 R10（v0.7.0）：Tauri 阶段 1 —— Rust CLI 桥接

- Tauri 壳（阶段 0）必须能在**不启动 Electron** 的情况下读取真实 `ncm-cli` 数据：环境自检、会话状态、每日推荐、推荐歌单、搜索、歌单详情与歌词。
- 前端继续复用 `NcmBridge` 契约与 `src/shared/types.ts`；运行时自动识别 Electron / Tauri / 纯浏览器预览三种环境。
- Rust 侧统一串行执行 CLI：参数以数组传递（不经过 shell）、首命令白名单校验、25 s 超时、JSON 提取与错误码分类与 Electron 版 `runner.ts` 等价。
- GUI 会话 PATH 缺 npm 全局 bin 时，回落到 `~/.npm-global/bin` 等常见位置（与 `electron/ncm/cli-bin.ts` 等价）。
- 归一化逻辑复用现有纯 TS 模块（`normalize.ts` / `command-map.ts` / `shared/lyric.ts`），不在 Rust 侧重复实现。
- 阶段 1 明确不做：凭证加密存储、扫码登录、AI 点歌、队列持久化、自动续播、MPRIS 真实播控（留阶段 2/3）。
- 验收：`cargo test` 通过、`npx tsc -b` 零错误、`npm test` ≥ 86 例、`npm run build` 成功；Tauri dev 下环境自检三行全绿、发现页显示真实每日推荐。

## 3.4 追加需求 R11（v0.7.1）：界面去装饰化 polish

- 保留既有品牌与视觉：`ink`/`cloud` 中性色阶、网易云红 `#EC4141`、Source Han Sans SC、黑胶唱片沟槽与旋转、页面结构与顺序。
- 移除装饰痕迹：彩色发光阴影、按钮/进度条渐变、玻璃拟态渐变、封面缺失时的随机彩色光晕、黑胶背后的红色光晕、`NEW` 徽标、Sparkles 图标、大写宽字距英文标签。
- 文案改为具体中文短标签；字号归一到 11/12/13/14/16/20/24/30，去掉小字号宽字距；控件半径按层级收敛。
- 动效只保留有语义的（黑胶旋转、播放音柱、一次入场淡入），删除循环 pulse、hover 放大与 `transition-all`。
- 验收：`npm test` 全绿、`tsc -b` 零错误、`npm run build` 成功；重新截图比对发现页与全屏页，审计清单中的迹象全部消失；deb 覆盖安装后渲染层正常。

## 3.5 追加需求 R12（v0.7.2）：IPC 契约与 lint 清理

- `shell:open-external` 必须与其余通道一致返回 `IpcResult<boolean>`，且只允许 http(s) 链接交给系统浏览器。
- 所有 `ipcMain.handle` 通道必须经统一包装注册，不得重复注册。
- 去掉字符组内多余转义后，歌手字符串仍按 `/`、`、`、`,`、`&` 正确分割。
- 验收：`npm test` 全绿、`npm run lint` 零错误、`tsc -b` 零错误；安装版中 `window.ncm.app.openExternal` 返回结构化结果。

## 3.6 追加需求 R13（v0.8.0）：Tauri 阶段 2 增量 A —— 状态持久化与事件推送

- 队列、当前索引、播放模式、音量必须持久化到用户配置目录，应用重启后恢复（与 Electron 版 `store.ts` 对齐）。
- 播放状态由 Rust 侧统一组装，每 1.5 s 通过 `player:state-changed` 推送；渲染层不再自行轮询。
- Rust 侧状态需校验：索引越界收敛、非法播放模式回落 `order`、音量夹到 0–100。
- `player_snapshot` 合并 CLI `state` 与 Rust 状态，返回字段与 `PlaybackState` 一致。
- 阶段 2 后续增量（本轮不做）：凭证加密存储、扫码登录、AI 点歌、自动续播、目录缓存；阶段 3 的 MPRIS 真实播控、托盘与安装包交付同样不在本轮。
- 验收：`cargo test`、`npm test`、`tsc -b`、`npm run lint`、`npm run build` 全通过；`tauri dev` 下状态事件正常推送、播放栏随状态更新。

## 3.7 追加需求 R14（v0.9.0）：阶段 3 Dock 播放状态与系统媒体集成

- 仅在 Tauri 侧实现，Electron 版与现有 deb 不改动。
- Dock：播放中显示进度条与队列序号角标，暂停/停止时隐藏；图标位图不变（Ubuntu Dock 的 `com.canonical.Unity.LauncherEntry` 只支持 `count` / `progress` / `urgent` / `quicklist`，无 `icon` 字段）。
- MPRIS：真实 `PlaybackStatus` / `Metadata`（title、artist、album、artUrl、length）/ `Position`，状态或曲目变化时发 `PropertiesChanged`；`Play` / `Pause` / `Next` / `Previous` / `Stop` 接入真实播控，其中上下一首走 Rust 侧队列推进。
- 托盘 tooltip 动态显示「正在播放：歌名 - 歌手」；切歌时发一条 `org.freedesktop.Notifications.Notify`，按 `current.id` 去重，不刷屏。
- `desktop id` 必须与 Dock 中的 `.desktop` 文件名一致：默认 `com.ncm.player.tauri`，支持 `NCM_DOCK_DESKTOP_ID` 覆盖。
- 数据源唯一：复用阶段 2 `spawn_publisher` 的 1.5 s 循环，不新增轮询。
- 验收：`cargo test` / `npm test` / `tsc -b` / `lint` / `build` 全绿；`tauri dev` 下 `busctl` 能读到实时 MPRIS 属性、`gdbus monitor` 能捕获 `LauncherEntry.Update`、托盘 tooltip 随歌变化、切歌通知只发一条。

## 3.8 追加需求 R15（v0.9.1）：播放列表完整性

- 「播放全部」必须把来源列表的**全部曲目**放入播放队列，与发现页 / 歌单展示的数量一致；`visible:false / playFlag:false` 的无版权曲目仍保留在列表中并标注「不可播放」。
- 播控（起播、上一首 / 下一首、曲末续播、列表循环、随机播放）自动跳过不可播放曲目；顺序播放只向队列尾部查找，末尾无可播曲目时停止而不是绕回开头。
- 整列不可播放或缺少加密 ID 时不下发 `play`，给出明确状态而不是卡在上一首。
- Electron 与 Tauri 两个运行时行为一致；队列抽屉与发现页列表均需标注不可播放曲目。
- 验收：`npm test` ≥ 111 例、`tsc -b`、`lint`、`build` 全通过；实机点击「播放全部」后抽屉显示 30 首（其中 20 首标注不可播放），起播命中首个可播曲目。

## 3.9 追加需求 R16（v0.10.0）：Tauri 阶段 2 增量 B —— 登录闭环

- Tauri 壳必须能在**不启动 Electron** 的情况下完成首次配置向导：保存 `appId` / `privateKey`、获取扫码登录链接、退出登录，与 Electron 版 `session.ts` 行为等价。
- Rust 侧统一执行 `config set` / `login --background` / `logout`：参数数组传递、首命令白名单、`login --background` 单独放宽到 30 s、从混合输出提取第一个 http(s) 链接；凭证为空返回 `CREDENTIALS`。
- 会话状态具备 60 s 缓存与 `force` 绕过；凭证写入 / 退出登录 / 登录完成后通过 `session:changed` 事件推送最新状态，渲染层无需自行轮询。
- 向导完成标记 `onboarded` 持久化到 Tauri 配置目录（与播放状态文件隔离），不再是无操作。
- 明确不做（留后续）：AI 点歌与 AI 配置、发现页缓存、自解码播放、Tauri deb/AppImage 交付。
- 验收：`cargo test` 通过、`npm test` ≥ 120 例、`tsc -b` / `lint` / `build` 全绿；`tauri dev` 下新命令注册成功、只读会话探测正常，且不改动本机真实凭证与登录态。

## 3.10 追加需求 R17（v0.11.0）：Tauri 发现页缓存与首屏提速

- Tauri 壳的每日推荐 / 推荐歌单需在 30 分钟 TTL 内复用缓存，避免每次进入发现页都拉起 CLI（实测 `recommend daily` 单次 2.7–4 s）。
- 缓存分两层：进程内内存缓存 + Rust 侧落盘 `~/.config/ncm-player-tauri/discover.json`；冷启动一次性把落盘数据灌入内存，之后读缓存不再发 IPC。
- 只缓存非空结果；CLI 失败不写盘、不污染内存；落盘 key 白名单 `daily` / `playlists`，拒绝任意键与空数组写入。
- 与 Electron 版 `catalog.ts` 的 TTL / 空结果策略一致；搜索、歌单详情、歌词不缓存。
- 明确不做（留后续）：AI 点歌与 AI 配置、自解码播放、Tauri deb/AppImage 交付。
- 验收：`cargo test` ≥ 31 例、`npm test` ≥ 128 例、`tsc -b` / `lint` / `build` 全绿；`tauri dev` 首次写盘后缓存文件含完整 30 首，且重启不再出现 `recommend daily` 的 CLI 调用。

## 4. 验收结果（实测）

| 指标 | 改动前 | 改动后 | 结论 |
| --- | --- | --- | --- |
| 窗口可见耗时 | ≈ 4.65 s | **437 ms** | 超过 R3 目标（< 1.8 s） |
| 启动期阻塞 CLI 调用 | 6 次 | **0 次**（会话命中缓存，播放态为内存快照） | 达成 R1/R3 |
| `env:check` 的 CLI 调用 | 4 次 | **3 次** | 达成 R2 |
| 单文件最大行数 | 380（`Setup.tsx`） | **243**（`mock/index.ts`） | 达成 R5 |
| 歌词定位实现份数 | 2 | **1**（`src/shared/lyric.ts`） | 达成 R6 |
| 主进程类型检查 | 未覆盖 | 纳入 `tsc -b`，修掉 1 处真实错误 | 达成结构目标 |
| 首屏数据耗时 | — | 每日推荐 1470 ms，歌单 1335 ms（串行、不阻塞首屏） | 可接受 |

命令行采样（`NCM_DEBUG=1`）：

```
[boot] window ready 437ms
[cli] recommend daily ... 1470ms
[cli] playlist radar ... 1335ms
```

## 5. 本轮不做

- 红心/收藏、搜索分页、歌单增删改
- 自解码播放（二期）
- 打包产物进一步瘦身（已在上一轮完成 36 MB → 524 KB）
