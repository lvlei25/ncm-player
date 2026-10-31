# ncm-cli 真实命令树快照

- 采集时间：2026-10-31T14:38:27.347Z
- ncm-cli 版本：0.1.7
- 采集方式：`node scripts/probe-cli.mjs`（逐条执行 `ncm-cli <cmd> --help`）

> 命令由服务端动态下发，本文件只是某一时刻的快照。接入真实账号后请重新执行探针脚本，
> 应用运行期还会通过 `ncm-cli commands` 自动比对能力可用性。

## 顶层命令

- `play`
- `pause`
- `resume`
- `stop`
- `next`
- `prev`
- `seek`
- `volume`
- `queue`
- `state`
- `login`
- `logout`
- `configure`
- `upgrade`
- `config`
- `cloudupload`
- `cloud`
- `diag`

## 子命令路径

- `config set`
- `config get`
- `config list`
- `cloudupload upload`
- `cloudupload status`
- `cloudupload stop`
- `cloudupload list`
- `cloud downloadFile`
- `diag report`

## 各命令帮助输出

### play

```text
Usage: ncm-cli play [options]

播放音频 URL、歌曲加密 ID 或歌单

Options:
  --playlist           歌单模式：顺序播放整个歌单（需配合 --encrypted-id 或 --original-id 提供歌单 ID）
  --song               歌曲模式：播放单曲（需配合 --encrypted-id 与 --original-id 提供歌曲 ID）
  --encrypted-id <id>  资源加密 ID（歌曲为32位hex，歌单为数字ID）
  --original-id <id>   资源原始 ID（歌曲为明文数字ID，歌单为数字ID）
  --output <format>    输出格式 (human|json) (default: "json")
  -h, --help           display help for command

用法示例:
  $ ncm-cli play --song --encrypted-id 330AC3639A5C32EE474A474D64654431 --original-id 123           # 播放单曲
  $ ncm-cli play --playlist --encrypted-id 330AC3639A5C32EE474A474D64654431 --original-id 13641922862 # 顺序播放歌单（加密ID）

  ID 说明:
    歌曲有两种 ID：加密 ID（32位hex，用于API请求）和原始 ID（数字，用于唤起客户端）
    --player 未指定时默认使用 mpv（安装 mpv: brew install mpv）
    歌曲 ID 可通过 search 命令获取（结果同时包含加密 ID 和原始 ID）：
  $ ncm-cli search all --keyword 林俊杰                   # 综合搜索，结果含 ID 和播放命令
```

### pause

```text
Usage: ncm-cli pause [options]

暂停播放

Options:
  --output <format>  输出格式 (human|json) (default: "json")
  -h, --help         display help for command
```

### resume

```text
Usage: ncm-cli resume [options]

恢复播放

Options:
  --output <format>  输出格式 (human|json) (default: "json")
  -h, --help         display help for command
```

### stop

```text
Usage: ncm-cli stop [options]

停止播放

Options:
  --output <format>  输出格式 (human|json) (default: "json")
  -h, --help         display help for command
```

### next

```text
Usage: ncm-cli next [options]

下一首

Options:
  --output <format>  输出格式 (human|json) (default: "json")
  -h, --help         display help for command
```

### prev

```text
Usage: ncm-cli prev [options]

上一首

Options:
  --output <format>  输出格式 (human|json) (default: "json")
  -h, --help         display help for command
```

### seek

```text
Usage: ncm-cli seek [options] <seconds>

跳转到指定时间（秒）

Arguments:
  seconds            跳转位置（秒）

Options:
  --output <format>  输出格式 (human|json) (default: "json")
  -h, --help         display help for command
```

### volume

```text
Usage: ncm-cli volume [options] <level>

设置音量 (0-100)

Arguments:
  level              音量级别 (0-100)

Options:
  --output <format>  输出格式 (human|json) (default: "json")
  -h, --help         display help for command
```

### queue

```text
Usage: ncm-cli queue [options] [subcommand] [url]

播放队列管理（queue | queue add <url/id> | queue clear）

Arguments:
  subcommand           子命令：add | clear
  url                  音频 URL 或歌曲加密 ID（用于 add 子命令）

Options:
  --encrypted-id <id>  资源加密 ID（歌曲为32位hex）
  --original-id <id>   资源原始 ID（歌曲为明文数字ID）
  --next               插入到当前播放的下一首位置（默认追加到队列末尾）
  --output <format>    输出格式 (human|json) (default: "json")
  -h, --help           display help for command

用法示例:
  $ ncm-cli queue                                  # 查看播放队列
  $ ncm-cli queue add --encrypted-id <歌曲加密ID> [--original-id <原始ID>]
  $ ncm-cli queue clear                            # 清空队列并停止播放
```

### state

```text
Usage: ncm-cli state [options]

查看播放状态

Options:
  --output <format>  输出格式 (human|json) (default: "json")
  -h, --help         display help for command
```

### login

```text
Usage: ncm-cli login [options]

登录网易云音乐

Options:
  --check            检查登录状态
  --background       后台轮询模式，主进程立即退出
  --output <format>  输出格式 (human|json) (default: "json")
  -h, --help         display help for command
```

### logout

```text
Usage: ncm-cli logout [options]

退出登录

Options:
  --output <format>  输出格式 (human|json) (default: "json")
  -h, --help         display help for command
```

### config

```text
Usage: ncm-cli config [options] [command]

配置管理（config set/get/list）

Options:
  -h, --help         display help for command

Commands:
  set <key> <value>  设置配置项
  get <key>          获取配置项
  list               列出所有配置项
  help [command]     display help for command
```

### commands

```text
Usage: ncm-cli commands [options]

列出所有可用命令

Options:
  -h, --help  display help for command
```
