import type { NcmBridge } from '../shared/api'
import type { IpcFailure, IpcResult } from '../shared/types'
import { mockBridge } from './mock'

const desktop = (window as unknown as { ncm?: NcmBridge }).ncm

/** Electron 下走 IPC 桥；纯浏览器预览（dev:web）自动降级为 mock，便于 UI 验收 */
export const isDesktop = Boolean(desktop)
export const api: NcmBridge = desktop ?? mockBridge
export const runtimeMode = isDesktop ? 'desktop' : 'preview'

export class BridgeError extends Error {
  code: IpcFailure['code']

  constructor(failure: IpcFailure) {
    super(failure.message)
    this.code = failure.code
  }
}

export function unwrap<T>(result: IpcResult<T>, fallback: T): T {
  return result.ok ? result.data : fallback
}

/** 失败时返回可读文案，UI 统一展示；配额超限按官方要求原样透传 */
export function failureText(result: IpcResult<unknown>): string | null {
  if (result.ok) return null
  const map: Record<string, string> = {
    MISSING_CLI: '未检测到 ncm-cli，请先安装后重启应用',
    MISSING_MPV: '未检测到 mpv，播放需要先安装 mpv',
    CREDENTIALS: '尚未配置开放平台凭证，请前往设置完成',
    UNAUTHORIZED: '登录已失效，请重新扫码登录',
    UNSUPPORTED: '当前 ncm-cli 版本未提供该能力',
    TIMEOUT: 'ncm-cli 响应超时，请稍后重试',
    NETWORK: '网络异常，请检查网络后重试',
  }
  return map[result.code] ?? result.message
}
