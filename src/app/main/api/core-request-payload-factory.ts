import type { BrowserWindow } from 'electron'
import type { CoreRestoreTarget, CoreRestoreTargetPayload, JsonRecord } from '../types'

type NativeWindowHandleSource = Pick<BrowserWindow, 'getNativeWindowHandle'>

const serializeWindowHandle = (handle: Buffer): CoreRestoreTarget['windowHandle'] => {
  if (handle.length !== 4 && handle.length !== 8) {
    throw new RangeError('Native window handles must contain four or eight bytes')
  }

  const value = handle.length === 4
    ? BigInt(handle.readUInt32LE())
    : handle.readBigUInt64LE()

  if (value === 0n) {
    throw new RangeError('Native window handles must not be zero')
  }

  return `0x${value.toString(16).toUpperCase().padStart(16, '0')}`
}

export class CoreRequestPayloadFactory {
  constructor(
    private readonly getOverlayWindow: () => NativeWindowHandleSource
  ) {}

  withRestoreTarget<T extends JsonRecord>(
    payload: T
  ): T & CoreRestoreTargetPayload {
    const handle = this.getOverlayWindow().getNativeWindowHandle()

    return {
      ...payload,
      restoreTarget: {
        processId: process.pid,
        windowHandle: serializeWindowHandle(handle)
      }
    }
  }
}
