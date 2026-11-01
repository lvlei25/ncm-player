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

## 后续可做（未在本轮）

- `recommend daily` 单次 1.5 s 属网络耗时，可考虑首屏用上次的每日推荐做「立即渲染 + 静默刷新」
- 红心/收藏、搜索分页、歌单增删
- 自解码播放（二期 `PlaybackBackend`）
