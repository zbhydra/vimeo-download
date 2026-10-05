/**
 * 固定真实 player 样本 → content 资源 → popup → background/offscreen → 原生下载。
 * 项目 API 只访问真实 localhost:7900；普通扩展页面只证明 UI/产物，action 生命周期另验。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import type { QuotaCheckResponse } from '../../src/core/api/quota/types'
import type { BackgroundGetDownloadQueueResponse } from '../../src/background/types'
import type { DownloadHistoryEntry } from '../../src/core/storage/downloadHistory'

const SAMPLE_URL = 'https://player.vimeo.com/video/1196869805'
const DOWNLOAD_SUBDIR = 'vimeo-video-downloader'

test('真实 player 的 FIFO、MP4、MP3 裁剪、额度与原生输入边界', async ({
  context,
  extensionId,
  downloadDir
}) => {
  test.setTimeout(300_000)
  const baselineFiles = new Set(listMediaFiles(downloadDir))
  const quotaResults: { httpStatus: number; code: number; data: QuotaCheckResponse }[] = []
  const quotaReads: Promise<void>[] = []
  context.on('response', response => {
    if (
      response.request().serviceWorker() &&
      response.url() === 'http://localhost:7900/api/client/quota/check'
    ) {
      quotaReads.push(
        response.json().then(body => {
          quotaResults.push({ httpStatus: response.status(), ...body })
        })
      )
    }
  })

  const page = await context.newPage()
  await page.goto(SAMPLE_URL, { waitUntil: 'load', timeout: 30_000 })
  for (const frame of page.frames()) {
    await frame.evaluate(() => document.querySelectorAll('video').forEach(video => video.pause()))
  }
  let popup = await openPopupPage(context, extensionId)
  await expect
    .poll(
      async () => {
        if ((await popup.locator('.clip-input').count()) === 2) return true
        const retry = popup.locator('.state-button')
        if ((await retry.count()) === 1) await retry.click()
        return false
      },
      { timeout: 60_000 }
    )
    .toBe(true)
  await checkPopupDialogs(popup)
  await checkNativeClipInputs(popup)
  expect(quotaReads).toHaveLength(0)
  expect((await readQueue(popup)).tasks).toHaveLength(0)

  const videoRow = popup.locator('[data-row="video"]')
  const videoOptions = await videoRow
    .locator('select option')
    .evaluateAll(nodes =>
      nodes.map(node => ({
        value: (node as HTMLOptionElement).value,
        label: node.textContent ?? ''
      }))
    )
  const selected = videoOptions.reduce((lowest, option) =>
    readLabelHeight(option.label) < readLabelHeight(lowest.label) ? option : lowest
  )
  await videoRow.locator('select').selectOption(selected.value)
  await popup.locator('select.audio-format').selectOption('mp3')
  await videoRow.locator('.row-download').click()
  await expect
    .poll(async () => (await readQueue(popup)).tasks.map(task => task.status))
    .toEqual(['downloading'])
  await popup.locator('.clip-input').nth(0).fill('0')
  await popup.locator('.clip-input').nth(1).fill('2')
  await popup.locator('[data-row="audio"] .row-download').click()
  await expect
    .poll(async () => (await readQueue(popup)).tasks.map(task => task.status))
    .toEqual(['downloading', 'waiting'])
  await popup.close()

  const videoPath = await waitForMedia(downloadDir, baselineFiles, '.mp4')
  const audioPath = await waitForMedia(downloadDir, baselineFiles, '.mp3')
  for (const filePath of [videoPath, audioPath]) {
    expect(filePath).toContain(`${path.resolve(downloadDir)}${path.sep}${DOWNLOAD_SUBDIR}`)
    execFileSync('/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-i', filePath, '-f', 'null', '-'])
  }
  const video = probeMedia(videoPath)
  expect(video.streams.map(stream => stream.codec_type)).toEqual(['video', 'audio'])
  expect(video.format.format_name).toContain('mp4')
  expect(Number(video.format.duration)).toBeGreaterThan(2)
  const audio = probeMedia(audioPath)
  expect(audio.format.format_name).toBe('mp3')
  expect(audio.streams.map(stream => stream.codec_type)).toEqual(['audio'])
  expect(Number(audio.format.duration)).toBeGreaterThan(1.8)
  expect(Number(audio.format.duration)).toBeLessThan(2.3)
  await Promise.all(quotaReads)
  expect(quotaResults).toHaveLength(2)
  for (const result of quotaResults) {
    expect(result).toMatchObject({
      httpStatus: 200,
      code: 10000,
      data: { allowed: true, count: 1, status: 1 }
    })
    expect(result.data.used).toBeGreaterThanOrEqual(0)
  }

  const worker = context
    .serviceWorkers()
    .find(candidate => candidate.url().startsWith(`chrome-extension://${extensionId}/`))
  if (!worker) throw new Error('[VIMEO_REAL_WORKER_MISSING] 活跃扩展 SW 未找到')
  await expect
    .poll(async () =>
      worker.evaluate(async () => {
        const stored = await chrome.storage.local.get('download_success_count')
        return stored.download_success_count as number
      })
    )
    .toBe(2)
  const history = await worker.evaluate(async () => {
    const stored = await chrome.storage.local.get('download_history')
    return stored.download_history as DownloadHistoryEntry[]
  })
  expect(history).toHaveLength(2)
  expect(history.every(entry => entry.status === 'success')).toBe(true)
  popup = await openPopupPage(context, extensionId)
  expect((await readQueue(popup)).tasks).toHaveLength(0)
  await expect(popup.locator('.download-queue')).toHaveCount(0)
  await expect(popup.locator('.rating-prompt')).toHaveCount(0)
  await popup.close()
  await page.close()
})

/** 普通扩展页面只验证格式与 UI；action popup 失焦生命周期另由原生 UI 验收。 */
async function openPopupPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html`)
  await expect(popup.locator('.video-panel')).not.toHaveAttribute('aria-busy', 'true')
  return popup
}

/** 只读取真实 background 当前任务投影。 */
async function readQueue(popup: Page): Promise<BackgroundGetDownloadQueueResponse> {
  return popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({
      protocolVersion: 2,
      id: crypto.randomUUID(),
      channel: 'background',
      method: 'getDownloadQueue',
      params: {}
    })
    return response.data as BackgroundGetDownloadQueueResponse
  })
}

/** 检查常驻 closed dialog、原生 Tab/Escape 与焦点恢复。 */
async function checkPopupDialogs(popup: Page): Promise<void> {
  for (const dialog of await popup.locator('dialog').all()) await expect(dialog).toBeHidden()
  const opener = popup.locator('.header-actions > .icon-button').first()
  await opener.click()
  const settings = popup.locator('dialog[aria-labelledby="vdl-settings-modal-title"]')
  await expect(settings).toBeVisible()
  for (let index = 0; index < 12; index++) {
    await popup.keyboard.press('Tab')
    expect(
      await settings.evaluate(node => node.contains(document.activeElement) || !document.hasFocus())
    ).toBe(true)
  }
  await popup.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  await expect(opener).toBeFocused()
  await opener.click()
  await settings.locator('.settings-history-row').click()
  const history = popup.locator('dialog.history-overlay')
  await expect(history).toBeVisible()
  await popup.keyboard.press('Escape')
  await expect(history).toBeHidden()
  await popup.locator('.login-btn').click()
  const login = popup.locator('dialog[aria-labelledby="vdl-login-modal-title"]')
  await expect(login).toBeVisible()
  await popup.keyboard.press('Escape')
  await expect(login).toBeHidden()
  await expect(popup.locator('.login-btn')).toBeFocused()
}

/** 原生不完整 number 输入须拒绝；直接派发 click 也不能越过共同提交校验。 */
async function checkNativeClipInputs(popup: Page): Promise<void> {
  const inputs = popup.locator('.clip-input')
  const button = popup.locator('[data-row="audio"] .row-download')
  for (const index of [0, 1]) {
    await inputs.nth(1 - index).fill('')
    for (const incomplete of ['e', '-']) {
      await inputs.nth(index).fill('')
      await inputs.nth(index).pressSequentially(incomplete)
      expect(
        await inputs.nth(index).evaluate(node => (node as HTMLInputElement).validity.badInput)
      ).toBe(true)
      await expect(button).toBeDisabled()
      await button.evaluate(node => node.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      expect((await readQueue(popup)).tasks).toHaveLength(0)
    }
    await inputs.nth(index).fill('')
  }
  await inputs.nth(0).fill('-1')
  await expect(button).toBeDisabled()
  await inputs.nth(0).fill('2')
  await inputs.nth(1).fill('1')
  await expect(button).toBeDisabled()
  await inputs.nth(0).fill('')
  await inputs.nth(1).fill('')
  await expect(button).toBeEnabled()
}

/** 已有工具检查真实轨道与时长，不引入媒体测试依赖。 */
function probeMedia(filePath: string): {
  streams: { codec_type: string }[]
  format: { format_name: string; duration: string }
} {
  return JSON.parse(
    execFileSync(
      '/opt/homebrew/bin/ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type:format=format_name,duration',
        '-of',
        'json',
        filePath
      ],
      { encoding: 'utf8' }
    )
  )
}

/** 只认本轮新出现的最终媒体文件，Chrome 中间态仍为 .crdownload。 */
async function waitForMedia(
  downloadDir: string,
  baseline: ReadonlySet<string>,
  extension: string
): Promise<string> {
  let result = ''
  await expect
    .poll(
      () => {
        result =
          listMediaFiles(downloadDir).find(
            file => !baseline.has(file) && file.endsWith(extension) && fs.statSync(file).size > 0
          ) ?? ''
        return result
      },
      { timeout: 180_000, intervals: [1000] }
    )
    .not.toBe('')
  return result
}

function listMediaFiles(root: string): string[] {
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(mp4|mp3)$/i.test(entry.name))
    .map(entry => path.join(entry.parentPath, entry.name))
}

function readLabelHeight(label: string): number {
  const height = /(\d+)p/.exec(label)?.[1]
  return height ? Number(height) : Number.MAX_SAFE_INTEGER
}
