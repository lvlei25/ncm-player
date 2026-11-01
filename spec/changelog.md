# 变更记录（Changelog）

倒序记录，最新在最上。每条包含：变更内容 / 原因 / 影响文件 / 验证方式。

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
