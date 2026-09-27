/**
 * muxArtifactStore 生命周期测试。
 *
 * open→真实 Output 写入→finalize 的完整链路由 vimeo-mux.spec 以字节级对照覆盖；这里聚焦
 * 临时文件生命周期本身：dispose 删除产物、删除/清扫对缺失条目容错、启动清扫递归清空残留。
 * 依赖 tests/mocks/opfs 的内存 OPFS（happy-dom 无实现）。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { installOpfsMock, MockOpfsDirectoryHandle, restoreOpfsMock } from '../mocks/opfs'
import {
  openMuxArtifactWriter,
  removeMuxArtifact,
  sweepMuxArtifacts
} from '@/offscreen/muxArtifactStore'

const MUX_TEMP_DIR = 'vdl-mux'

describe('muxArtifactStore 生命周期', () => {
  let root: MockOpfsDirectoryHandle

  beforeEach(() => {
    root = installOpfsMock()
  })

  afterEach(() => {
    restoreOpfsMock()
  })

  /** 取（不存在则建）临时目录句柄，供条目断言。 */
  async function muxDir(): Promise<MockOpfsDirectoryHandle> {
    return root.getDirectoryHandle(MUX_TEMP_DIR, { create: true })
  }

  it('dispose 中止写入并删除临时文件', async () => {
    const writer = await openMuxArtifactWriter('bg-task-dispose', 'mp4')
    expect((await muxDir()).hasEntry('bg-task-dispose.mp4')).toBe(true)

    await writer.dispose()

    expect((await muxDir()).hasEntry('bg-task-dispose.mp4')).toBe(false)
  })

  it('删除缺失条目不抛出，由下次启动清扫兜底', async () => {
    await expect(removeMuxArtifact('not-exist.mp4')).resolves.toBeUndefined()
  })

  it('启动清扫递归清空残留目录，之后可按需重建', async () => {
    await openMuxArtifactWriter('bg-task-leftover', 'mp4')
    expect(root.hasEntry(MUX_TEMP_DIR)).toBe(true)

    await sweepMuxArtifacts()
    expect(root.hasEntry(MUX_TEMP_DIR)).toBe(false)

    const reopened = await openMuxArtifactWriter('bg-task-after-sweep', 'm4a')
    expect(reopened.fileName).toBe('bg-task-after-sweep.m4a')
    await reopened.dispose()
  })

  it('清扫时目录不存在（首次使用）不报错', async () => {
    await expect(sweepMuxArtifacts()).resolves.toBeUndefined()
  })
})
