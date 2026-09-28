/**
 * 下载文件名模板渲染纯函数测试。
 *
 * 变量替换、缺字段空串后的分隔符收敛、未知占位保留与默认模板直通渲染；日期段的
 * `YYYY-MM-DD` 形状。非法字符净化归 background `buildDownloadFilename` 管，不在本表。
 */

import { describe, expect, it } from 'vitest'

import {
  FILENAME_PATTERN_DEFAULT,
  FILENAME_VARIABLES,
  formatFilenameDate,
  renderFilenameBase
} from '@/core/utils/filenameTemplate'

const CONTEXT = {
  title: 'Big Buck Bunny',
  quality: '1080p HD',
  type: 'video',
  author: 'Blender Foundation',
  date: '2026-01-31',
  videoId: '1234567'
}

describe('renderFilenameBase', () => {
  it('默认模板 `{title}_{quality}_{type}` 直通渲染，无特殊分支', () => {
    expect(renderFilenameBase(FILENAME_PATTERN_DEFAULT, CONTEXT)).toBe(
      'Big Buck Bunny_1080p HD_video'
    )
  })

  it('全部变量按占位替换，与书写顺序无关', () => {
    expect(renderFilenameBase('{date}/{videoId} {author}: {quality} ({type}) [{title}]', CONTEXT)).toBe(
      '2026-01-31/1234567 Blender Foundation: 1080p HD (video) [Big Buck Bunny]'
    )
  })

  it('缺字段变量渲染为空串，残留的连续同类分隔符合并、首尾分隔符裁掉', () => {
    const missing = { ...CONTEXT, author: '', quality: '', date: '' }
    expect(renderFilenameBase('{author}_{title}_{quality}_{type}', missing)).toBe(
      'Big Buck Bunny_video'
    )
    expect(renderFilenameBase('{title} by {author}', missing)).toBe('Big Buck Bunny by')
    // 装饰性分隔符（空格夹短横）不受合并影响，仅缺字段一侧被裁掉。
    expect(renderFilenameBase('{quality} - {title}', missing)).toBe('Big Buck Bunny')
  })

  it('全部变量皆空时返回空串，由调用方兜底', () => {
    const empty = { title: '', quality: '', type: '', author: '', date: '', videoId: '' }
    expect(renderFilenameBase('{title}_{quality}_{type}', empty)).toBe('')
  })

  it('未知占位与大小写不匹配的占位原样保留，用户能在文件名里看到笔误', () => {
    expect(renderFilenameBase('{title}_{foo}_{Title}', CONTEXT)).toBe('Big Buck Bunny_{foo}_{Title}')
  })

  it('变量全集与占位表一一对应，设置弹层 chips 与渲染共用同一份定义', () => {
    expect(FILENAME_VARIABLES).toEqual([
      'title',
      'quality',
      'type',
      'author',
      'date',
      'videoId'
    ])
    for (const variable of FILENAME_VARIABLES) {
      expect(renderFilenameBase(`{${variable}}`, CONTEXT)).toBe(CONTEXT[variable])
    }
  })
})

describe('formatFilenameDate', () => {
  it('按本地时间渲染 YYYY-MM-DD，月与日补零', () => {
    expect(formatFilenameDate(new Date(2026, 0, 31, 9, 5))).toBe('2026-01-31')
    expect(formatFilenameDate(new Date(2026, 8, 3))).toBe('2026-09-03')
  })
})
