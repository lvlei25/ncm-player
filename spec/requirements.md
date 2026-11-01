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
