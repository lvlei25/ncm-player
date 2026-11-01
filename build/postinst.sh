#!/bin/bash
# Chromium SUID sandbox 必须为 root:root 且权限 4755。
# electron-builder 打出来的 deb 默认是 755，导致从应用列表启动时直接：
#   FATAL:setuid_sandbox_host.cc The SUID sandbox helper binary was found,
#   but is not configured correctly ... aborting now
# 这里在安装后修正权限（脚本以 root 身份执行）。
set -e

APP_DIR="/opt/黑胶音乐"
SANDBOX="$APP_DIR/chrome-sandbox"

if [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX" 2>/dev/null || true
  chmod 4755 "$SANDBOX" 2>/dev/null || true
fi
