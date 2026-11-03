/**
 * 真实页面面板的下载队列：下载中的按钮只禁用自己，其他按钮点击后排队，两个文件都落盘。
 *
 * 用 player 页面的原因见 `vimeo-real-subtitle.spec.ts`。项目 API 只访问本地真实后端。
 */
import fs from 'node:fs'
import { test, expect, listDownloadedFiles, waitForDownloadedFile } from '../fixtures'

const SAMPLE_URL = 'https://player.vimeo.com/video/1226740492'
const SUBTITLE_LABEL = 'English (auto-generated)'
/** 字幕轨在页面 HTML 的 config 里，不必等播放器的全部资源加载完。 */
const PAGE_LOAD_OPTIONS = { waitUntil: 'domcontentloaded', timeout: 60_000 } as const

test('下载视频时面板其他按钮可点，点击后排队并依次落盘', async ({ context, downloadDir }) => {
  const page = await context.newPage()
  await page.goto(SAMPLE_URL, PAGE_LOAD_OPTIONS)
  const baselineFiles = new Set(listDownloadedFiles(downloadDir))

  const optionOf = (row: string) =>
    page.locator(`[data-testid="vdl-vimeo-row-${row}"] [data-testid="vdl-vimeo-option"]`)
  const subtitle = optionOf('subtitle').filter({ hasText: SUBTITLE_LABEL })
  await expect(subtitle).toBeVisible({ timeout: 60_000 })

  // 字幕轨早于视频档出现，视频行此时可能还是占位按钮，要等到带资源 ID 的真实按钮。
  // 选最小的无音轨档，缩短视频下载时间；行内顺序固定，最后一个就是最低画质。
  const video = optionOf('video').and(page.locator('[data-vdl-source-id]:not([data-vdl-source-id=""])')).last()
  await expect(video).toBeVisible({ timeout: 60_000 })
  const videoLabel = (await video.textContent()) ?? ''
  const thumbnail = optionOf('image').first()
  // 界面语言跟随浏览器，状态文案取按钮自带的本地化标签。
  const downloadingText = (await video.getAttribute('data-vdl-busy-label')) ?? ''
  const waitingText = (await video.getAttribute('data-vdl-waiting-label')) ?? ''
  expect(downloadingText).not.toBe('')
  expect(waitingText).not.toBe('')

  await video.click()
  const videoState = page.locator(
    '[data-testid="vdl-vimeo-row-video"] [data-testid="vdl-vimeo-option"][aria-busy="true"]'
  )
  await expect(videoState).toHaveCount(1, { timeout: 30_000 })
  await expect(videoState).toBeDisabled()
  await expect
    .poll(async () => {
      const text = (await videoState.textContent()) ?? ''
      return text === downloadingText || /^\d+%$/.test(text)
    })
    .toBe(true)

  // 其他按钮不被下载中的任务锁住。
  await expect(subtitle).toBeEnabled()
  await expect(thumbnail).toBeEnabled()
  await expect(optionOf('video').first()).toBeEnabled()

  const subtitleSourceId = await subtitle.getAttribute('data-vdl-source-id')
  await subtitle.click()
  const subtitleState = page.locator(`[data-vdl-source-id="${subtitleSourceId}"]`)
  await expect(subtitleState).toHaveText(waitingText, { timeout: 30_000 })
  await expect(subtitleState).toBeDisabled()
  // 排队后图片按钮依然能点。
  await expect(thumbnail).toBeEnabled()

  const videoPath = await waitForDownloadedFile(downloadDir, baselineFiles, '.mp4', 200_000)
  expect(fs.statSync(videoPath).size).toBeGreaterThan(0)
  const subtitlePath = await waitForDownloadedFile(downloadDir, baselineFiles, '.vtt', 60_000)
  expect(fs.readFileSync(subtitlePath, 'utf8').startsWith('WEBVTT')).toBe(true)

  // 队列清空后全部按钮复位。
  await expect(subtitleState).toHaveText(SUBTITLE_LABEL, { timeout: 30_000 })
  await expect(subtitleState).toBeEnabled()
  await expect(optionOf('video').last()).toHaveText(videoLabel, { timeout: 30_000 })
  await expect(page.locator('[data-testid="vdl-vimeo-panel"] [aria-busy="true"]')).toHaveCount(0)

  await page.close()
})
