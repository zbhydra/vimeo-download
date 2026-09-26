/**
 * chrome.downloads 相对下载路径拼接测试。
 *
 * 原经由 BrowserDownloadService.start 的路径归一化表改为直接测纯函数：保存位置是用户可控
 * 输入，目录逐段丢弃非法段，文件名清洗后仍带路径语义时换兜底名。
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DOWNLOAD_PATH
} from '@/core/storage/settings'
import {
  buildDownloadFilename,
  normalizeDownloadDirectory
} from '@/background/services/downloadFilename'

const FILENAME = 'controlled-1080p.mp4'

describe('buildDownloadFilename', () => {
  it('保存位置拼成相对子目录，绝对路径、盘符、回退段与空段逐段丢弃', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['my/videos', 'my/videos/controlled-1080p.mp4'],
      // 绝对路径的开头 `/` 与连续 `/` 都是空段，丢弃后仍落在下载目录内
      ['/etc/passwd', 'etc/passwd/controlled-1080p.mp4'],
      ['a//b/', 'a/b/controlled-1080p.mp4'],
      // 回退段（含反斜杠写法）整段丢弃，逃不出下载目录
      ['../..', 'vimeo-video-downloader/controlled-1080p.mp4'],
      ['..\\..\\windows', 'windows/controlled-1080p.mp4'],
      // 盘符段含 `:`，整段丢弃
      ['C:\\Windows\\System32', 'Windows/System32/controlled-1080p.mp4'],
      // `~` 开头的段按家目录语义处理，直接丢弃
      ['~/Documents', 'Documents/controlled-1080p.mp4'],
      // 空值回退默认子目录，Chrome 才不会收到空路径
      ['', 'vimeo-video-downloader/controlled-1080p.mp4'],
      ['   ', 'vimeo-video-downloader/controlled-1080p.mp4']
    ]

    for (const [downloadPath, expected] of cases) {
      const filename = buildDownloadFilename(downloadPath, FILENAME)
      expect({ downloadPath, filename }).toEqual({ downloadPath, filename: expected })
      // 无论用户填什么，交给 Chrome 的都必须是非空相对路径且不含回退段
      expect(filename.startsWith('/')).toBe(false)
      expect(filename.includes('..')).toBe(false)
    }
  })

  it('文件名清洗后正好是回退段时换兜底名，避免 Chrome 因 `..` 直接报错', () => {
    expect(buildDownloadFilename(undefined, '..')).toBe(
      `${DEFAULT_DOWNLOAD_PATH}/vimeo-download`
    )
  })

  it('目录长度超出预算时丢弃后续段，保证路径长度可控', () => {
    const longSegments = Array.from({ length: 40 }, (_, index) => `segment-${index}`)
    const segments = normalizeDownloadDirectory(longSegments.join('/'))
    expect(segments.join('/').length).toBeLessThanOrEqual(120)
    expect(segments[0]).toBe('segment-0')
  })
})
