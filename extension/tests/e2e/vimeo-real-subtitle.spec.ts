/**
 * 真实公开视频的字幕轨 → content 资源 → popup Subtitle 行或页面面板 → 原生下载 → 落盘 WebVTT。
 *
 * 样本来自 Vimeo Staff Picks，播放器 config 的字幕地址在 `captions.vimeo.com`。样本下架时
 * 换一个带 `ai_generated` 字幕轨的公开视频，不改成假页面。项目 API 只访问本地真实后端。
 *
 * 两条用例都用 player 页面：自动化 profile 打开 vimeo.com 时每次都被 Vimeo 的人机验证盖住，
 * 在被拦截的页面上得到的结果不能算产品通过。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect, listDownloadedFiles, waitForDownloadedFile } from '../fixtures'

const AUTO_GENERATED_SAMPLE_URL = 'https://player.vimeo.com/video/1226740492'
const AUTO_GENERATED_LABEL = 'English (auto-generated)'
/** 字幕轨在页面 HTML 的 config 里，不必等播放器的全部资源加载完。 */
const PAGE_LOAD_OPTIONS = { waitUntil: 'domcontentloaded', timeout: 60_000 } as const

test('真实 player 的自动生成字幕可以从 popup 保存为 VTT', async ({
  context,
  extensionId,
  downloadDir
}) => {
  const page = await context.newPage()
  await page.goto(AUTO_GENERATED_SAMPLE_URL, PAGE_LOAD_OPTIONS)
  const popup = await openPopupWithLoadedVideo(context, extensionId)
  const baselineFiles = new Set(listDownloadedFiles(downloadDir))

  const subtitleRow = popup.locator('[data-row="subtitle"]')
  await expect(subtitleRow.locator('select option')).toContainText([AUTO_GENERATED_LABEL])
  await subtitleRow.locator('.row-download').click()
  await expectSavedSubtitle(downloadDir, baselineFiles)

  await popup.close()
  await page.close()
})

test('真实 player 页面的面板可以保存自动生成字幕', async ({ context, downloadDir }) => {
  const page = await context.newPage()
  await page.goto(AUTO_GENERATED_SAMPLE_URL, PAGE_LOAD_OPTIONS)
  const baselineFiles = new Set(listDownloadedFiles(downloadDir))

  const option = page
    .locator('[data-testid="vdl-vimeo-row-subtitle"] [data-testid="vdl-vimeo-option"]')
    .filter({ hasText: AUTO_GENERATED_LABEL })
  await expect(option).toBeVisible({ timeout: 60_000 })
  await option.click()
  await expectSavedSubtitle(downloadDir, baselineFiles)

  await page.close()
})

/** 普通扩展页面读取真实 background 投影；视频资源可能晚于 popup 打开，按真实重试入口等待。 */
async function openPopupWithLoadedVideo(context: BrowserContext, extensionId: string): Promise<Page> {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html`)
  await expect
    .poll(
      async () => {
        if ((await popup.locator('[data-row="video"]').count()) === 1) return true
        const retry = popup.locator('.state-button')
        if ((await retry.count()) === 1) await retry.click()
        return false
      },
      { timeout: 60_000 }
    )
    .toBe(true)
  return popup
}

/** 只认本轮保存的字幕文件，并校验文件名和 WebVTT 内容。 */
async function expectSavedSubtitle(downloadDir: string, baseline: ReadonlySet<string>): Promise<void> {
  const subtitlePath = await waitForDownloadedFile(downloadDir, baseline, '.vtt', 60_000)
  expect(path.basename(subtitlePath)).toContain(AUTO_GENERATED_LABEL)
  const content = fs.readFileSync(subtitlePath, 'utf8')
  expect(content.startsWith('WEBVTT')).toBe(true)
  expect(content).toContain(' --> ')
}
