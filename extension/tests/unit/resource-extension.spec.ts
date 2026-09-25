/** 资源扩展名解析：MIME 优先，资源类型默认值兜底。 */

import { describe, expect, it } from 'vitest'

import {
  RESOURCE_TYPES,
  getDefaultResourceExtension,
  getExtensionFromMimeType
} from '@/core/constants/resource'

describe('getDefaultResourceExtension', () => {
  it('优先使用 mimeType 推断扩展名', () => {
    expect(getDefaultResourceExtension(RESOURCE_TYPES.IMAGE, 'image/png')).toBe('.png')
    expect(getDefaultResourceExtension(RESOURCE_TYPES.AUDIO, 'audio/ogg')).toBe('.ogg')
    expect(getDefaultResourceExtension(RESOURCE_TYPES.VIDEO, 'video/webm')).toBe('.webm')
  })

  it('mimeType 缺失或未知时回落到资源类型默认扩展名', () => {
    expect(getDefaultResourceExtension(RESOURCE_TYPES.VIDEO)).toBe('.mp4')
    expect(getDefaultResourceExtension(RESOURCE_TYPES.AUDIO)).toBe('.mp3')
    expect(getDefaultResourceExtension(RESOURCE_TYPES.IMAGE)).toBe('.jpg')
    expect(getDefaultResourceExtension(RESOURCE_TYPES.IMAGE, 'application/octet-stream')).toBe('.jpg')
  })

  it('忽略 mimeType 参数并统一大小写', () => {
    expect(getExtensionFromMimeType('IMAGE/PNG; charset=utf-8')).toBe('.png')
    expect(getExtensionFromMimeType(undefined)).toBeUndefined()
  })
})
