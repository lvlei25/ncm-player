# 变更记录（Changelog）

倒序记录，最新在最上。每条包含：变更内容 / 原因 / 影响文件 / 验证方式。

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
