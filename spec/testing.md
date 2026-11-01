# 测试策略（Testing）

## 1. 为什么这样分层

这个项目的特殊之处：**核心能力来自外部进程 `ncm-cli`**，而它的命令树由服务端动态下发。

因此测试不能只写「输入 → 输出」的理想用例，必须覆盖三类风险：

| 风险 | 表现 | 应对层 |
| --- | --- | --- |
| CLI 输出结构变化 | 字段改名/嵌套变化 → 界面空白 | 归一化单元测试（吃真实 JSON 夹具） |
| 命令名变化 | 调了不存在的子命令 → 静默失败 | 命令映射/能力探测单元测试 |
| 真实链路问题 | 登录态、串行队列、mpv 出声 | 手工回归 + `NCM_DEBUG` 观测 |

## 2. 测试分层

```
┌─ L4 手工回归（docs/test-cases.md TC-MAN-*）  真实账号 + 真实 mpv
├─ L3 端到端观测（NCM_DEBUG=1 日志断言）       启动耗时 / CLI 调用次数
├─ L2 单元测试（test/*.spec.ts, vitest）       纯函数：归一化 / 歌词 / 命令映射 / 格式化
└─ L1 类型与构建（tsc -b + vite build）        编译期门禁
```

### L2 覆盖范围（自动化，46 例）

| 文件 | 被测对象 | 用例数 |
| --- | --- | --- |
| `test/normalize.spec.ts` | `electron/ncm/normalize.ts` 歌曲/歌单识别、字段别名、https 升级、去重 | 11 |
| `test/lyric.spec.ts` | `electron/ncm/lyric.ts` + `src/shared/lyric.ts` 解析、翻译对齐、当前行定位 | 11 |
| `test/command-map.spec.ts` | `command-map.ts` / `discovery.ts` 命令树解析、候选回退、能力矩阵 | 13 |
| `test/format.spec.ts` | `src/lib/format.ts` 时长/计数/取色/类名合并 | 11 |

测试夹具 `test/fixtures.ts` 全部来自 **2026-11-01 真实 CLI 输出**（脱敏），
不是照文档脑补的 schema——这正是本项目最容易出问题的地方。

### 不覆盖（有意为之）

- React 组件渲染（视觉回归靠截图 + 手工，投入产出比低）
- `ncm-cli` 自身行为（官方责任，我们只测契约假设）
- mpv 出声（需要音频设备，且无法稳定断言）

## 3. 如何执行

```bash
npm test              # 跑全部单元测试
npm run test:watch    # 开发时监听
npm run test:coverage # 带覆盖率
npx tsc -b            # 类型门禁（含主进程）
npm run build         # 构建门禁
```

真实链路观测：

```bash
NCM_DEBUG=1 npm run dev
# [boot] window ready 437ms
# [cli] recommend daily ... 1470ms
```

## 4. 通过标准（合入门禁）

必须同时满足：

1. `npm test` 全绿（46/46）
2. `npx tsc -b` 零错误（含 `tsconfig.electron.json`）
3. `npm run build` 成功
4. 涉及 UI 的改动：`dev:web` 截图回归
5. 涉及播控/会话的改动：手工用例 P0 全通过

## 5. 缺陷分级

| 级别 | 定义 | 例子 | 处理 |
| --- | --- | --- | --- |
| P0 | 阻断使用 | 启动白屏、无法登录、播放无声 | 立即修，禁止合入 |
| P1 | 主流程受损 | 搜索无结果、歌词不滚动、队列错位 | 本轮修 |
| P2 | 局部异常 | 单首歌不可播提示缺失、封面兜底不显示 | 排期修 |
| P3 | 体验瑕疵 | 动效卡顿、文案不统一 | 记录待办 |

## 6. 已知测试债

- 组件层无自动化，`ErrorBoundary`、`Stepper` 等仅靠手工覆盖
- `store.ts`（zustand）的懒加载逻辑没有单测，依赖手工验证
- 无 CI，所有门禁目前靠本地命令；后续可加 GitHub Actions（`npm ci && npm test && npm run build`）
