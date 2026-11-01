# 设计方案（Design）

## 1. 核心判断

CLI 调用是**最贵的资源**（0.5 s 起，带网络 1.5 s+），且必须**串行**。
因此性能优化的第一原则不是「让调用更快」，而是「**让调用更少、更晚、更能被打断**」。

由此得出三条设计线：

1. **能缓存的不重复算** → 会话缓存（R1）、环境自检复用缓存（R2）
2. **能不首屏依赖的就推迟** → 队列懒加载（R3）
3. **后台任务不抢占前台任务** → 轮询让路机制（R4）

## 2. 会话缓存（R1）

### 设计

主进程 `session.ts` 内维护：

```ts
interface SessionCache {
  value: SessionStatus
  at: number
}
let cache: SessionCache | null = null
const TTL = 60_000
```

- `getSession(force = false)`：命中且未过期直接返回；否则重新探测。
- 探测本身做**一次**：`config list` → （有 appId 时）`login --check` → （已登录且昵称未知时）`user info`。
- 昵称/头像探测失败不阻塞登录态（`loggedIn` 由 `login --check` 决定）。
- 失效入口：`setCredentials()`、`logout()`、`markLoggedIn()`（向导轮询检测到登录成功时调用）。

### 为什么缓存放主进程而不是渲染层

向导的 3 s 轮询、`env:check`、侧栏刷新是**三个不同调用方**，只有放在 IPC 后面才能真正合并。

### 取舍

- 缓存 60 s 意味着用户在终端执行 `ncm-cli logout` 后，应用最多 60 s 才感知。
  可接受：应用自身登出会主动失效；外部登出属边缘场景，且可在侧栏提供「刷新」。
- 昵称也持久化到 `store.ts`（`nickname`、`avatarUrl`），冷启动时先用本地值渲染，探测结果回来再覆盖 → 首屏不依赖 1.5 s 的 `user info`。

## 3. 环境自检（R2）

`checkEnv()` 只做**本地**探测：

- `ncm-cli --version`、`mpv --version`、`node --version`（均为本地进程，无网络）
- `config list`（读文件）
- 登录态：`getSession().loggedIn`（缓存）

删除原先的 `login --check`（1.7 s 网络往返）。

## 4. 启动链路（R3）

```
bootstrap()
├─ 1. getSession()          命中缓存时 0 次 CLI
├─ 2. player.state()        1 次（504 ms）
├─ 3. (懒) player.queue()   首次打开队列抽屉 / 队列长度变化时
└─ 4. 后台 refreshEnv()     不阻塞 ready
```

状态设为 `ready` 后立即渲染；`refreshEnv` 与 `queue` 都在后台补。

`queue` 的懒加载落地：`store.ts` 中 `queueLoaded` 标记，`refreshQueue()` 才会真正调用 IPC；
渲染层在 `QueueDrawer` 首次打开、以及 `playback.queueLength !== queue.tracks.length` 时触发。

## 5. 轮询让路（R4）

`runner.ts` 的 `SerialQueue` 增加待处理计数：

```ts
class SerialQueue {
  private pending = 0
  get busy(): boolean { return this.pending > 0 }
  run<T>(task: () => Promise<T>): Promise<T> { this.pending++ ... finally this.pending-- }
}
```

- `player.refreshState()` 入口判断 `if (cliQueue.busy) return`（**直接跳过，不排队**）
- 心跳 1000 ms → 1500 ms
- 非 `playing` 状态不启动定时器（已有逻辑，保留）

取舍：进度条精度从 1 s 降到 1.5 s。人眼对 1.5 s 的进度跳动基本无感，换来的是操作响应不被挤占。

## 6. 结构治理（R5–R7）

### 6.1 `electron/ai/service.ts` 拆分

| 新文件 | 内容 | 行数目标 |
| --- | --- | --- |
| `ai/tools.ts` | `TOOLS` 定义 + `execTool()`（纯能力调用） | ~150 |
| `ai/local.ts` | 无 Key 时的本地意图解析 | ~110 |
| `ai/service.ts` | `remoteChat()` 循环 + `chat()` 编排 | ~90 |

### 6.2 `src/pages/Setup.tsx` 拆分

`components/setup/` 下拆成 `StepEnv.tsx`、`StepCredential.tsx`、`StepLogin.tsx`、`StepDone.tsx`，
`Setup.tsx` 只保留步骤推导、状态与编排（~120 行）。

### 6.3 `src/lib/mock.ts` 拆分

`lib/mock/data.ts`（歌曲/歌单/LRC 常量）+ `lib/mock/index.ts`（桥接实现与播放模拟）。

### 6.4 歌词定位统一（R6）

新建 `src/shared/lyric.ts`：`activeIndex(lines, positionSec)` 二分实现。
- 主进程 `electron/ncm/lyric.ts` 删除 `activeLineIndex`，改为 re-export shared 版本
- 渲染层 `src/lib/lrc.ts` 删除，改从 shared 引入

理由：主进程与渲染层本来就共享 `src/shared/types.ts`，歌词定位是纯函数，没有环境依赖。

### 6.5 错误边界（R7）

`components/ErrorBoundary.tsx`（class 组件，React 唯一支持的错误捕获方式）：

- `getDerivedStateFromError` 记录错误，`componentDidCatch` 打日志
- 兜底 UI 展示错误信息摘要 + 「返回首页」按钮（重置 state + `navigate('/')`）
- 在 `App.tsx` 中包裹 `<main>` 区域，避免整窗白屏

## 7. 验收方法

| 需求 | 手段 |
| --- | --- |
| R1/R2/R3 | 在主进程日志里统计 CLI 调用次数（`NCM_DEBUG=1` 时打印 `[cli] <argv> <ms>`），冷启动一次计数 |
| R4 | 播放中触发搜索，记录两次耗时对比 |
| R5 | `wc -l` 脚本检查 |
| R6 | `grep -rn "activeIndex" src electron` 只命中 shared |
| R7 | 临时在页面抛错，截图兜底 UI |

## 8. 风险

- **会话缓存与服务端失效不一致**：若账号在别处退出，应用仍显示已登录，操作时才报 `UNAUTHORIZED`。缓解：`UNAUTHORIZED` 错误触发 `invalidateSession()`，下次探测会纠正。
- **队列懒加载导致抽屉首次打开有 0.5 s 空白**：抽屉先渲染本地已知队列，加载中显示骨架。
- **拆分文件引入 import 循环**：`ai/tools.ts` 只依赖 `ncm/*`，不得反向依赖 `ai/service.ts`。
