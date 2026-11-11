# 任务清单（Tasks）

全部完成。括号内为实测数据。

## T1 观测先行：CLI 调用可计量 ✅

- [x] `runner.ts` 在 `NCM_DEBUG=1` 时打印 `[cli] <argv> <耗时>ms`
- [x] `SerialQueue` 增加 `busy` 计数（供轮询让路使用）
- [x] 主进程打印 `[boot] window ready <ms>`

验收：`NCM_DEBUG=1 npm run dev` 可看到每次调用的命令与耗时。

## T2 会话缓存 ✅

- [x] `getSession(force?)` + 60 s TTL + `invalidateSession()`
- [x] 昵称/头像/登录态持久化到 `store.ts`
- [x] `setCredentials` / `logout` 主动失效；`UNAUTHORIZED` 错误自动失效
- [x] 冷启动 stale-while-revalidate：先渲染本地值，后台探测完成后经 `session:changed` 更正

验收：缓存有效期内重复调用 0 次 CLI 调用；向导 3 s 轮询命中缓存。

## T3 环境自检去重 ✅

- [x] `checkEnv()` 去掉 `login --check`，登录态取会话（缓存）
- [x] `user info` 仅在「已登录且本地无昵称」时发起

验收：`env:check` 的 CLI 调用从 4 次降到 3 次。

## T4 启动链路精简 + 队列懒加载 ✅

- [x] `bootstrap()` 只依赖会话（缓存）+ `player.state()`（内存快照，0 次 CLI）
- [x] `store.ts` 增加 `queueLoaded`，`QueueDrawer` 打开时才拉取
- [x] Discover 先取「每日推荐」，歌单网格随后补上

验收：**`[boot] window ready 437ms`**（改动前约 4.65 s），启动期阻塞型 CLI 调用 0 次。

## T5 轮询让路 ✅

- [x] 心跳 1000 ms → 1500 ms
- [x] `refreshState()` 在 `cliQueue.busy` 时直接返回

验收：`[cli] recommend daily 1470ms` / `playlist radar 1335ms` 为串行真实耗时，未叠加 state 轮询。

## T6 拆分 `electron/ai/service.ts` ✅

- [x] `ai/tools.ts` 159 行（工具定义 + 执行器）
- [x] `ai/local.ts` 74 行（本地意图解析）
- [x] `ai/service.ts` 83 行（远端循环 + 编排）

## T7 拆分 `src/pages/Setup.tsx` ✅

- [x] `components/setup/Stepper.tsx` 38 行
- [x] `components/setup/StepEnv.tsx` 97 行
- [x] `components/setup/StepCredential.tsx` 78 行
- [x] `components/setup/StepLogin.tsx` 70 行
- [x] `components/setup/StepDone.tsx` 29 行
- [x] `pages/Setup.tsx` 179 行（仅编排）

## T8 拆分 `src/lib/mock.ts` ✅

- [x] `lib/mock/data.ts` 91 行
- [x] `lib/mock/index.ts` 243 行（桥接实现）

## T9 歌词定位统一 ✅

- [x] 新增 `src/shared/lyric.ts`
- [x] `electron/ncm/lyric.ts` 改为 re-export
- [x] 删除 `src/lib/lrc.ts`
- [x] 删除无用的 `playerQueue` 导出

## T10 错误边界 ✅

- [x] `components/ErrorBoundary.tsx`（class 组件，兜底 UI + 返回首页）
- [x] `App.tsx` 包裹内容区

## T11 类型与回归 ✅

- [x] 新增 `tsconfig.electron.json`，主进程纳入 `tsc -b`（**首次跑出真实类型错误**：`ErrnoException.killed`，已修）
- [x] 所有文件 ≤ 300 行（最大 243 行）
- [x] `npx tsc -b` 零错误
- [x] Electron 真实账号回归：每日推荐 30 首、推荐歌单 7 个、封面与昵称正常
- [x] `dev:web` mock 预览回归正常
- [x] 提交并推送

---

# v0.6.0 测试体系

## T12 测试基础设施 ✅

- [x] 安装 `vitest`，新增 `vitest.config.ts`（`electron` 走 `test/stubs/electron.ts` 替身）
- [x] `test/fixtures.ts`：真实 CLI 输出夹具（搜索 / 雷达歌单 / 嵌套陷阱 / LRC）
- [x] `package.json` 增加 `test`、`test:watch`、`test:coverage`

## T13 自动化用例 ✅

- [x] `normalize.spec.ts` 11 例
- [x] `lyric.spec.ts` 11 例
- [x] `command-map.spec.ts` 13 例
- [x] `format.spec.ts` 11 例

验收：`npm test` **46/46 通过**（776 ms）。

## T14 缺陷回归 ✅

- [x] 发现并修复 `specExists` 子命令判定过宽（父命令存在即通过）
- [x] 补 TC-A26 作为回归用例

## T15 文档 ✅

- [x] `spec/testing.md`（策略 / 分层 / 门禁 / 缺陷分级 / 测试债）
- [x] `docs/test-cases.md`（46 自动化 + 60 手工用例 + 执行记录）
- [x] `spec/requirements.md` 追加 R8
- [x] README 增加测试命令与文档入口

---

# v0.7.0 Tauri 迁移（进行中）

路线：**阶段 0** 空壳验证（Tauri 2 + zbus MPRIS 骨架）✅ → **阶段 1** Rust CLI 桥接（本轮）→ **阶段 2** 完整能力层（凭证/登录/队列/AI/持久化）→ **阶段 3** MPRIS 真实播控 + 托盘 + deb/AppImage 交付。

## T16 阶段 1：Rust CLI 桥接

- [x] `src-tauri/src/cli.rs`：CLI 路径解析（NCM_CLI_BIN / PATH / npm 全局 bin / nvm / volta / bun）、串行队列、超时、JSON 提取、错误码分类（8 例 Rust 单测）
- [x] `src-tauri/src/commands.rs`：`cli_invoke` / `cli_text` / `env_check` / `app_*` 命令与白名单
- [x] `src/lib/tauriBridge.ts`：复用 `normalize.ts` / `command-map.ts` 实现 `NcmBridge` 的目录、会话与基础播控（10 例前端单测）
- [x] `src/lib/api.ts`：Tauri / Electron / 预览三态运行时探测
- [x] `capabilities/default.json`、`Cargo.toml`、`package.json`、`tauri.conf.json` 同步
- [x] 门禁：`cargo test` 8/8、`tsc -b` 零错误、`npm test` 96/96、`npm run build` 成功
- [x] Tauri dev 实机冒烟：窗口「黑胶 · 网易云音乐 (Tauri)」、MPRIS 服务注册成功、日志出现 `[cli] recommend daily` / `playlist radar` / `state` 轮询（真实数据链路打通）

---

# v0.7.1 界面 polish（unslop）

方向：沉静、有实体感、微暖；听音室与唱片架；黑胶是唯一亮点；沟槽与中心圆标为签名细节。

- [x] 九遍顺序：spacing → color → icons → copy → type → layout → details → visuals → motion
- [x] 删除 `coverGradient` 及其 2 个单测、`Cover` 的无用 `seed` 属性，封面缺失回落为中性底 + 唱片图标
- [x] 门禁：`npm test` 94/94、`tsc -b` 零错误、`npm run build` 成功、lint 仅剩 1 个既有错误

---

# v0.7.2 契约与 lint 清理

- [x] `shell:open-external` 改用统一 `handle` 包装，非 http(s) 链接拒绝打开
- [x] `normalize.ts:44` 去掉字符组内多余转义，补歌手分割回归用例
- [x] 新增 `test/ipc-contract.spec.ts` 3 例：结构化返回、URL 白名单、通道唯一性
- [x] 门禁：`npm test` 98/98、`npm run lint` 零错误、`tsc -b` 零错误、`npm run build` 成功

## 后续可做（未在本轮）

- `recommend daily` 单次 1.5 s 属网络耗时，可考虑首屏用上次的每日推荐做「立即渲染 + 静默刷新」
- 红心/收藏、搜索分页、歌单增删
- 自解码播放（二期 `PlaybackBackend`）
