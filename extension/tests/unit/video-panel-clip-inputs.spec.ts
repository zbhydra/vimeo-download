/** Popup 裁剪输入的纯合同检查，不请求项目 API。 */

import { describe, expect, it } from 'vitest'
import { parseVideoPanelClipInputs } from '@/popup/utils/videoPanel'
import { getVimeoPageKey } from '@/sites/vimeo/shared'

describe('页面输入合同', () => {
  it('仅两空表示整片，其余不完整或非法输入阻止裁剪下载', () => {
    expect(parseVideoPanelClipInputs('', '')).toEqual({ range: null, invalid: false })
    for (const [start, end] of [
      ['1', ''],
      ['', '2'],
      ['-1', '2'],
      ['2', '1'],
      ['1', '1'],
      ['oops', '2']
    ] as const) {
      expect(parseVideoPanelClipInputs(start, end)).toEqual({ range: null, invalid: true })
    }
    expect(parseVideoPanelClipInputs(0, 2.5)).toEqual({
      range: { startSeconds: 0, endSeconds: 2.5 },
      invalid: false
    })
  })

  it('同路径的 query/hash 变化也改变 canonical 页面键', () => {
    expect(getVimeoPageKey({ href: 'https://vimeo.com/watch?q=a' })).not.toBe(
      getVimeoPageKey({ href: 'https://vimeo.com/watch?q=b' })
    )
    expect(getVimeoPageKey({ href: 'https://vimeo.com/1#first' })).not.toBe(
      getVimeoPageKey({ href: 'https://vimeo.com/1#second' })
    )
  })
})
