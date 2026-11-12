# 变更记录（Changelog）

倒序记录，最新在最上。每条包含：变更内容 / 原因 / 影响文件 / 验证方式。

## v0.9.1 — 2026-11-12 修复「播放全部」队列条数不足

**背景**：发现页每日推荐显示「共 30 首」，点击播放全部后队列抽屉只出现 10 首。实测 `recommend daily` 返回的 30 首中 20 首为 `visible:false / playFlag:false`（无版权），`Player.setQueue()` 用 `filter(t => t.playable !== false)` 直接丢弃，导致 UI 与队列数量不一致。归一化标记本身正确，问题在于队列层不应删除展示条目。

**改动**

- `electron/ncm/player.ts`：`setQueue` / `playPlaylist` 保留完整列表；新增 `nextPlayable(start, direction, wrap)`，`playAt` 自动跳到最近可播曲目；`step` 按方向跳过；顺序播放曲末只向尾部查找、无可播则 `stop()`（不绕回开头）。
- `src/components/QueueDrawer.tsx`：不可播条目 40% 透明 + 「不可播放」标签 + 禁止点播，头部计数悬浮提示数量。
- `src/pages/Discover.tsx`：「播放全部」悬浮说明完整数量与不可播数量。
- `src/lib/tauriBridge.ts`：`nextPlayableIndex()` 与播控方法同步，保证 Electron / Tauri 行为一致。

**验证**：`npm test` 111/111（新增 `test/queue-playable.spec.ts` 8 例、`test/tauri-bridge.spec.ts` 2 例）、`tsc -b` 零错误、`lint` 0 错误、`npm run build` 成功；重新打包 deb 覆盖安装，实机点击「播放全部」后主进程队列 30 首 / `state.queueLength` 30、抽屉 30 行（20 首标注「不可播放」且禁止点播）、起播命中首个可播曲目「我会等 (Live版)」。

**影响文件**：`electron/ncm/player.ts`、`src/components/QueueDrawer.tsx`、`src/pages/Discover.tsx`、`src/lib/tauriBridge.ts`、`test/queue-playable.spec.ts`、`test/tauri-bridge.spec.ts`、`spec/*`

## v0.9.0 — 2026-11-12 Tauri 阶段 3：Dock 与系统媒体集成

**方向**：仅在 Tauri 侧实现；Dock 图标用 LauncherEntry 进度条/角标，歌名走 MPRIS + 托盘 + 通知。Ubuntu Dock 的 LauncherEntry 无 `icon` 字段，图标位图不变。

**改动**

- `src-tauri/src/media.rs`（新）：`MediaSnapshot` / `SharedMedia`，从 `PlaybackState` 构造 MPRIS `Metadata`（title、artist、album、artUrl、length、position）；只有播放状态或曲目变化才触发 `PropertiesChanged`，进度推进不刷屏。
- `src-tauri/src/mpris.rs`：属性改实时值；`Play` / `Pause` / `PlayPause` / `Stop` 接 `cli::run`；`Next` / `Previous` 走 Rust 侧队列推进后下发 `play`；新增 `publish_changes` 发 `org.freedesktop.DBus.Properties.PropertiesChanged`。
- `src-tauri/src/desktop.rs`（新）：`LauncherEntry.Update`（`progress` / `progress-visible` / `count` / `count-visible`），播放中显示、暂停隐藏；`org.freedesktop.Notifications.Notify` 切歌通知按 `current.id` 去重；`TrayIconBuilder` 托盘 tooltip 动态显示「正在播放：歌名 - 歌手」（Linux 挂空菜单）；desktop id 默认 `com.ncm.player.tauri`，可用 `NCM_DOCK_DESKTOP_ID` 覆盖。
- `src-tauri/src/commands.rs`：`spawn_publisher` 成为唯一分发点（前端事件 / MPRIS / Dock / 托盘 / 通知）；`main.rs` 接线 MPRIS 与托盘；`Cargo.toml` 启用 `tray-icon`；`tauri.conf.json` 描述更新。

**明确不做**：Electron 版、Dock 图标位图替换、`quicklist` 动态菜单、MPRIS `Quit` / `Raise` 窗口动作、Tauri 安装包交付。

**验证**：`cargo test` 20/20、`cargo check` 零警告、`npm test` 101/101、`tsc -b` 零错误、`npm run lint` 0 错误、`npm run build` 成功；`tauri dev` 实机：MPRIS 注册且 `PlaybackStatus` / `Metadata` 可读（含歌名、歌手、200000000 µs 长度）、六个播控方法注册、`PropertiesChanged` / `LauncherEntry` / 通知日志齐全、`dbus-monitor` 捕获 `Update` 信号体（`application://com.ncm.player.tauri.desktop` + `count=1` + `progress-visible=false`）、窗口 `WM_CLASS=ncm-player-tauri` 与 desktop 入口匹配、托盘无创建失败。

**未验证**：播放中 `progress-visible=true` 的实机表现（验证时 CLI 为 stopped），该分支由 `desktop::tests::playing_shows_progress_and_count` 覆盖；Dock 视觉需打包后确认。

**影响文件**：`src-tauri/{Cargo.toml,tauri.conf.json,src/media.rs,src/desktop.rs,src/mpris.rs,src/commands.rs,src/main.rs}`、`spec/*`

## v0.8.0 — 2026-11-12 Tauri 阶段 2 增量 A：状态持久化与事件推送

**改动**

- `src-tauri/src/state.rs`（新）：`PlayState`（队列 / 索引 / 播放模式 / 音量）落盘到 `~/.config/ncm-player-tauri/state.json`，启动时恢复；`sanitize` 收敛越界索引、非法模式回落 `order`、音量夹到 0–100；`build_playback` 合并 CLI `state` 与本地队列（含毫秒位置换算）。
- `src-tauri/src/commands.rs`：新增 `player_state_get` / `player_state_set` / `player_snapshot`；`spawn_publisher` 每 1.5 s 组装 `PlaybackState` 并 emit `player:state-changed`，`NCM_DEBUG=1` 下打印启用 / 失败日志。
- `src-tauri/src/main.rs`：`manage` 共享状态、注册 3 个命令、启动推送线程；`capabilities/default.json` 补 `core:event:default`。
- `src/lib/tauriBridge.ts`：启动从 Rust 恢复状态，队列 / 模式 / 音量写操作同步落盘；`player.state` 走 `player_snapshot`；`onState` 改 `listen` 订阅，**去掉前端 1.5 s 轮询**。
- `Cargo.toml` / `tauri.conf.json` 描述更新到阶段 2。

**明确不做（阶段 2 后续 / 阶段 3）**：凭证加密存储、扫码登录、AI 点歌、自动续播、目录缓存、MPRIS 真实播控、系统托盘、安装包交付。

**验证**：`cargo test` 13/13、`cargo check` 无警告、`npm test` 101/101、`tsc -b` 零错误、`npm run lint` 0 错误、`npm run build` 成功；`tauri dev` 实机：MPRIS 已注册、`[state] player:state-changed 已启用`、周期 `[cli] state`、状态文件生成 `{"queue":[],"index":-1,"play_mode":"order","volume":70}`、前端 `recommend daily` 真实调用。

**影响文件**：`src-tauri/{Cargo.toml,tauri.conf.json,capabilities/default.json,src/state.rs,src/commands.rs,src/main.rs}`、`src/lib/tauriBridge.ts`、`test/tauri-bridge.spec.ts`、`spec/*`

## v0.7.2 — 2026-11-11 IPC 契约与 lint 清理

**修复 1：外链通道返回契约**

- 现象：`window.ncm.app.openExternal(...)` 返回裸 `true`，而 `NcmBridge.app.openExternal` 声明的是 `Promise<IpcResult<boolean>>`。
- 根因：`electron/ipc.ts` 的 `shell:open-external` 是唯一绕过统一 `handle()` 包装、直接 `ipcMain.handle` 注册的通道（全量测试 E36 发现）。
- 修复：改用 `handle()`，入参做 string 校验，保留 http(s) 白名单；渲染层调用点无需改动。

**修复 2：既有 lint 错误清零**

- `normalize.ts:44` 字符组内 `\/` 属多余转义 → `/[/、,&]/`，并补歌手字符串分割回归用例。
- `TitleBar.tsx` 未使用的 `runtimeMode` 已在 v0.7.1 顺带移除。
- `npm run lint` 首次达到 **0 错误**。

**回归用例**：新增 `test/ipc-contract.spec.ts` 3 例（结构化返回、URL 白名单、invoke 通道唯一性），`test/normalize.spec.ts` 补 1 例；自动化 94 → 98。

**验证**：`npm test` 98/98、`tsc -b` 零错误、`npm run lint` 0 错误、`npm run build` 成功；重新打包并覆盖安装 deb（`install ok installed`、sandbox 4755、`dpkg --audit` 干净）；安装版 `[boot] window ready 640ms`，CDP 手工回归 **7/7**（外链契约、环境自检、搜索、静音、播放模式轮换、全屏页、收起播放页）；`docs/test-cases.md` 更新 4 项结果，剩余未执行 40 项。

**影响文件**：`electron/ipc.ts`、`electron/ncm/normalize.ts`、`test/ipc-contract.spec.ts`（新）、`test/normalize.spec.ts`、`spec/*`、`docs/test-cases.md`

## v0.7.1 — 2026-11-11 界面去装饰化 polish（unslop）

**方向**：沉静、有实体感、微暖；听音室与唱片架；黑胶是唯一亮点；唱片沟槽与中心圆标为签名细节。保留既有品牌色、字体与页面结构，只清理装饰层。

**九遍改动**

1. Spacing：播放栏 86 → 88px、侧栏 222 → 240px、导航行统一 36px。
2. Color：删除 `glow` 红色发光阴影；`.glass`/`.glass-soft` 改纯色 + 发丝边；播放按钮、进度条、向导按钮改纯品牌红；头像与封面占位改中性；滑块红环、滚动条 hover 改中性；新增键盘焦点环。
3. Icons：删除全部 `Sparkles`（AI 换 `MessageSquareText`，其余去图标）；图标统一 18px；删除 `NEW` 徽标。
4. Copy：`NETEASE CLOUD MUSIC`→网易云音乐、`POWERED BY`→基于、`DAILY MIX`→每天更新、`NOW PLAYING`→正在播放、`search`→搜索；发现页标题改「今日推荐」并去掉抒情副标题；`by xx`→`来自 xx`。
5. Type：字号归一 11/12/13/14/16/20/24/30，去掉全部大写宽字距与半像素字号，大标题 600 → 500。
6. Layout：保持不变（4 等宽歌单卡、全屏页叠播放栏只作为建议）。
7. Details：控件半径收敛到 8/12/16，全 pill 改圆角；队列抽屉入场统一 `fade-up`。
8. Visuals：删除随机彩色封面光晕、黑胶红晕、向导红晕、App 背景彩色 wash；保留黑胶沟槽与真实封面模糊层。
9. Motion：删除 pulse、hover 放大、`transition-all`、进度条 width 过渡；保留黑胶旋转、播放音柱与一次入场淡入。

**删除**：`src/lib/format.ts` 的 `coverGradient`（随机蓝紫光晕）及 `test/format.spec.ts` 2 条用例、`Cover` 组件无用的 `seed` 属性与全部调用点；`tailwind.config.js` 的 `glow` 阴影与 `breathe` 动画。自动化用例 96 → 94。

**顺带修复**：`TitleBar.tsx` 未使用 `runtimeMode` 的 lint 错误（全量 lint 从 2 个错误降到 1 个，仅剩 `normalize.ts:44`）。

**验证**：`npm test` 94/94、`tsc -b` 零错误、`npm run build` 成功；重新打包并覆盖安装 deb（`install ok installed`、sandbox 4755、`dpkg --audit` 干净）；安装版启动 `[boot] window ready 318ms`，CDP 断言 5/5（新文案生效、旧 slop 文案与类名全部消失、Electron 桥与播放态可用、播放模式按钮正常）；发现页与全屏页截图比对，审计清单中的迹象全部消除。

**影响文件**：`tailwind.config.js`、`src/styles/index.css`、`src/App.tsx`、`src/lib/format.ts`、`src/components/{Cover,PlayerBar,TitleBar,Sidebar,RightPanel,AiPanel,LyricPanel,TrackList,Notice,QueueDrawer,setup/*}.tsx`、`src/pages/{Discover,NowPlaying,Search,Setup,PlaylistDetail}.tsx`、`test/format.spec.ts`、`spec/*`

**建议（未改）**：推荐歌单 4 个等宽卡改有节奏的网格；全屏页是否保留底部播放栏；封面加载态可用沟槽纹理进一步强化黑胶质感。

## v0.7.0 — 2026-11-09 Tauri 迁移阶段 1：Rust CLI 桥接

**背景**：阶段 0 只验证系统 WebView 与最小 MPRIS 服务，前端在 Tauri 壳里走 `mockBridge`，看不到真实数据。

**改动**

- `src-tauri/src/cli.rs`（新）：`ncm-cli` 路径解析（NCM_CLI_BIN / PATH / npm 全局 bin / nvm / fnm / volta / bun）、串行锁、25 s 超时、混合输出 JSON 提取、错误码分类；首命令白名单，参数以数组传递不经过 shell。
- `src-tauri/src/commands.rs`（新）：`cli_invoke` / `cli_text` / `env_check` / `app_info` / `open_external` / `window_*`，返回值统一为 `IpcResult`。
- `src-tauri/src/main.rs`：注册 8 个 Tauri 命令；`Cargo.toml` 加 `serde` / `serde_json`。
- `src/lib/tauriBridge.ts`（新）：实现完整 `NcmBridge` 契约，复用 `electron/ncm/normalize.ts`、`command-map.ts`、`lyric.ts` 做归一化；阶段 1 未实现的能力（凭证/扫码/AI）显式返回 `UNSUPPORTED`。
- `src/lib/api.ts`：新增 Tauri 运行时探测，形成 Electron / Tauri / 预览三态。
- `package.json` 加 `@tauri-apps/api`；`tauri.conf.json` / `capabilities/default.json` 描述更新到阶段 1。

**明确不做（阶段 2/3）**：凭证加密存储、扫码登录、AI 点歌、队列持久化、自动续播、MPRIS 真实播控、系统托盘、安装包交付。

**验证**：`cargo test` 8/8、`npm test` 96/96（新增 `test/tauri-bridge.spec.ts` 10 例）、`npx tsc -b` 零错误、`npm run build` 成功；`npm run tauri dev` 实机启动，窗口标题「黑胶 · 网易云音乐 (Tauri)」、MPRIS `Identity=黑胶音乐`，日志出现 `[cli] recommend daily 1853ms` / `playlist radar 1453ms` / `state` 轮询，证明「前端 → Rust → ncm-cli」链路打通。

**影响文件**：`src-tauri/{Cargo.toml,src/cli.rs,src/commands.rs,src/main.rs,tauri.conf.json,capabilities/default.json}`、`src/lib/{tauriBridge.ts,api.ts}`、`package.json`、`eslint.config.js`（忽略 Rust target 产物）、`spec/*`、`test/tauri-bridge.spec.ts`

## v0.6.2 — 2026-11-01 修复：退出应用后音乐仍在播放

**现象**：关闭应用窗口后，音乐继续播放。

**根因（两层）**

1. 标题栏的 X 按钮走的是 IPC `window:close` → `win.hide()`，
   窗口藏到托盘、进程存活，播放自然继续；同时 `mainWindow.on('close')` 里也做了 `preventDefault()` + `hide()`。
2. 即便真正退出（托盘「退出」/`app.quit()`），退出流程只清理了定时器与托盘，
   **从未下发 `ncm-cli stop`**。mpv 是 ncm-cli 拉起的独立进程，应用退出后它照常出声。

**修复**

- `ipc.ts`：`window:close` 改为 `win.close()`（走正常关闭流程）
- `main.ts`：删除「关闭即隐藏」逻辑；`window-all-closed` → `app.quit()`；
  新增 `shutdown()`：先 `await player.stop()`（`ncm-cli stop`，5s 超时），再注销快捷键、销毁托盘、结束进程；
  `before-quit` 用 `preventDefault()` + 二次确认标记保证异步清理能跑完
- `player.ts`：新增 `stop()`，停轮询、清状态、下发 `ncm-cli stop`
- `TitleBar`：X 按钮 aria-label 从「关闭到托盘」改为「退出应用」

**行为变更（重要）**

关闭窗口 = 退出应用并停止播放；需要后台播放请用**最小化**（进程存活、音乐继续）。
README 的「功能」「界面导览」「日常操作」已同步。

**验证**

播放《飞云之下》时 Alt+F4 关闭窗口：

```
ncm-cli state → {"status":"stopped","position":0}
ps 中 electron 进程数 → 0
```

**遗留说明**：`ncm-cli stop` 后 mpv 会转为 `--idle` 常驻（静音、不出声），
这是 CLI 的快速恢复设计，已在 README「已知限制」记录。

**影响文件**

`electron/{main,ipc}.ts`、`electron/ncm/player.ts`、`src/components/TitleBar.tsx`、`README.md`、`spec/*`、`docs/test-cases.md`

## v0.6.1 — 2026-11-01 deb 实机验收与两处修复

**背景**：实际安装 `release/ncm-player_1.0.0_amd64.deb` 并按「应用列表 → 点击图标」的真实路径启动，
发现两个只在打包产物里出现的缺陷。

**缺陷 1：从应用列表启动直接崩溃（P0）**

```
FATAL:setuid_sandbox_host.cc(163) The SUID sandbox helper binary was found,
but is not configured correctly ... You need to make sure that
/opt/黑胶音乐/chrome-sandbox is owned by root and has mode 4755.
```

- 原因：electron-builder 打出的 deb 里 `chrome-sandbox` 权限为 `755`，
  而 Ubuntu 24.04 限制了 unprivileged user namespace，Chromium 无法降级，直接 abort。
- 修复：新增 `build/postinst.sh`，安装后 `chown root:root` + `chmod 4755`；
  `electron-builder.yml` 增加 `deb.afterInstall`。
- 验证：重装后 `-rwsr-xr-x root root`，`gtk-launch ncm-player`（不带 `--no-sandbox`）正常启动。

**缺陷 2：dock 图标关联不上（P1）**

- 现象：`.desktop` 里 `StartupWMClass=黑胶音乐`，而实测窗口 `WM_CLASS` 为 `ncm-player`（可执行文件名），
  桌面环境会认为这是两个不同应用，导致 dock 出现重复条目 / 图标不显示。
- 修复：`electron-builder.yml` 的 `linux.desktop.StartupWMClass: ncm-player`（注意必须写成扁平键，
  写成 `desktop.entry.StartupWMClass` 不生效——已实测）。
- 验证：包内 `.desktop` 的 `StartupWMClass` 与 `xprop WM_CLASS` 一致。

**顺带确认**

- 窗口标题栏状态灯显示「NCM-CLI 已连接」（绿色）
- 每日推荐 30 首、推荐歌单 7 个、昵称、封面全部真实加载
- 托盘图标出现在 GNOME 顶栏
- `Depends: mpv`、`Recommends: libappindicator3-1` 正确写入

**影响文件**

`build/postinst.sh`（新增）、`electron-builder.yml`、`docs/test-cases.md`、`spec/*`

## v0.6.0 — 2026-11-01 测试体系

**变更**

- 新增 `spec/testing.md`：分层策略（L1 类型/构建 → L4 手工回归）、门禁、缺陷分级、已知测试债
- 新增 `docs/test-cases.md`：46 条自动化用例 + 约 60 条手工用例，含优先级的执行记录
- 新增 `test/` 目录：`fixtures.ts`（真实 CLI 输出夹具）、`stubs/electron.ts`（electron 替身）
- 4 个测试文件：`normalize.spec.ts`(11) / `lyric.spec.ts`(11) / `command-map.spec.ts`(13) / `format.spec.ts`(11)
- 新增 `vitest.config.ts`，通过 alias 把 `electron` 指向替身，使主进程纯逻辑可在 node 下测试
- `package.json` 增加 `test` / `test:watch` / `test:coverage` 脚本与 `vitest` 开发依赖
- **修复缺陷**：`discovery.specExists` 对子命令的判定过于宽松（父命令存在即视为存在），
  会导致调用不存在的 `search artist` 而静默失败；现改为精确匹配父子路径

**原因**

核心风险在「外部 CLI 的输出结构与命令树会变」，而此前没有任何自动化验证；
同时按 spec 流程要求，测试也需要有规格与用例文档。

**影响文件**

`test/**`、`vitest.config.ts`、`package.json`、`electron/ncm/discovery.ts`、`spec/*`、`docs/test-cases.md`

**验证**

`npm test` 46/46 通过；`npx tsc -b` 零错误；修复点由 TC-A26 回归覆盖。

## v0.5.0 — 2026-11-01 结构整理与操作文档

**变更**

- 清理 Vite 模板残留：删除 `src/App.css`、`src/index.css`、`src/assets/react.svg`、`public/vite.svg`
  （全项目仅 `src/styles/index.css` 被 `main.tsx` 引入）
- 将 `resources/command-tree.json` 归入 `docs/`，删除 `resources/` 目录
- 删除仓库根目录的临时产物：`final-discover.png`、`build-deb.log`
- 移除空目录 `shared/`
- README 增加「操作说明」（安装、首次配置、界面导览、快捷键、托盘、排障、FAQ）
- 新建 `spec/README.md`（规格索引 + 变更记录规则）与 `spec/changelog.md`（本文件）

**原因**

仓库根目录混杂构建产物、截图与模板文件，且缺少面向使用者的操作说明；
同时需要把「一切改动必须计入 spec」固化为流程。

**影响文件**

`src/`、`public/`、`docs/`、`scripts/probe-cli.mjs`、`README.md`、`spec/*`

**验证**

`npx tsc -b` 零错误；`npm run build` 通过；Electron 与 `dev:web` 双路径截图回归正常。

## v0.4.0 — 2026-11-01 spec 驱动：性能与结构

**变更**

- 新增 `spec/requirements.md`、`design.md`、`tasks.md`
- 会话缓存 60 s + 冷启动「先渲染后校验」(`getSession(force)`、`session:changed` 推送)
- `checkEnv()` 去掉 `login --check`，登录态读缓存
- 启动链路精简为「会话缓存 + 内存播放态」，队列改懒加载
- 状态轮询 1 s → 1.5 s，且 `cliQueue.busy` 时跳过（不排队）
- 拆分 `ai/service.ts` → `tools.ts` / `local.ts` / `service.ts`
- 拆分 `Setup.tsx` → `components/setup/*` 五件
- 拆分 `mock.ts` → `mock/data.ts` + `mock/index.ts`
- 歌词定位合并到 `src/shared/lyric.ts`，删除 `src/lib/lrc.ts`、删除 `playerQueue` 导出
- 新增 `tsconfig.electron.json`，主进程纳入类型检查
- 新增 `ErrorBoundary`

**原因**

实测每次 `ncm-cli` 调用固定 0.5 s 起（`login --check` 1.67 s、`user info` 1.49 s），
启动串行 6 次 ≈ 4.65 s；同时三个文件超过 300 行、歌词定位有两份实现。

**影响文件**

`electron/**`、`src/{lib,pages,components,shared}/**`、`tsconfig*.json`、`spec/*`

**验证**

`[boot] window ready 437ms`（原 4.65 s）；启动期阻塞 CLI 调用 6 → 0 次；
所有源文件 ≤ 300 行；`tsc -b` 首次覆盖主进程并修掉 `ErrnoException.killed` 类型错误。

## v0.3.0 — 2026-11-01 打包瘦身

**变更**

- `electron-builder.yml` 增加 `!node_modules/**`、`!**/*.map`
- 修正上一次打包进程被中断导致的 deb 缺失

**原因**

`app.asar` 达 36 MB，把整个 `node_modules` 打进了安装包，而渲染层与主进程都已单文件打包。

**影响文件**

`electron-builder.yml`

**验证**

`app.asar` 36 MB → 524 KB；deb 156 MB → 75.9 MB；AppImage 114.3 MB → 108.8 MB。

## v0.2.0 — 2026-11-01 应用图标

**变更**

- 重绘图标：品牌红圆角底座 + 黑胶盘面（径向渐层 / 纹路 / 高光弧 / 边缘光）
- `scripts/make-icon.py` 输出 `build/icon.png` 与 `build/icons/{16..512}.png`
- `main.ts` 新增 `resolveWindowIcon()`；`electron-builder.yml` 改用多尺寸目录

**原因**

原图标为扁平红圈 + 黑盘，小尺寸下灰暗、辨识度低。

**验证**

64px 放大检查可辨识；安装 deb 后 dock 使用 `build/icons` 对应尺寸。

## v0.1.0 — 2026-10-31 首个可用版本

**变更**

- Electron 33 + React 18 + Vite 5 + Tailwind 桌面应用骨架
- `ncm-cli` 适配层：命令树发现、能力映射、串行队列、JSON 归一化
- 功能：配置/扫码登录向导、搜索、每日推荐、歌单详情、播控与队列、歌词滚动、AI 点歌
- 托盘、全局媒体键、无边框窗口
- 打包 AppImage / deb

**验证**

真实账号下：每日推荐 30 首、雷达歌单 7 个、播放 `state.position` 正常增长。

## v0.1.1 — 2026-10-31 真实接口联调修复

**变更**

- CLI 调用统一串行化（并行会互相覆盖 token 刷新，表现为其中一个请求返回空）
- 昵称改从 `user info` 获取（`login --check` 只返回「已登录实名账号」）
- 字段别名校准：`creatorNickName` / `describe` / `noCopyrightRcmd` / 封面 `http→https`
- 「推荐歌单」改调 `playlist radar`（`recommend` 只有 `daily/fm/heartbeat`）
- `play --playlist` 支持传 `originalId`

**影响文件**

`electron/ncm/{runner,session,catalog,normalize,command-map,player}.ts`、`electron/ipc.ts`、`src/lib/store.ts`

## v0.1.2 — 2026-10-31 Node 版本兼容

**变更**

- 环境自检读取**系统 node** 版本（原先是 Electron 内置 node，掩盖了问题）
- 新增 `promptSupport` 判定（≥ 22.12），向导给出升级提示
- README 补充 `ERR_REQUIRE_ESM` 说明与非交互配置方式

**原因**

`ncm-cli` 的 CJS 包里 `require()` 了纯 ESM 的 `@clack/prompts@1.x`，
Node 22.12 以下执行 `ncm-cli configure` 直接抛 `ERR_REQUIRE_ESM`。
