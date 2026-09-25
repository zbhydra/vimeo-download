/** Popup 顶部下载状态入口和任务浮层交互。 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, nextTick } from 'vue'

import { RESOURCE_TYPES } from '@/core/constants/resource'
import type { DownloadTaskSnapshot } from '@/core/types'
import DownloadStatus from '@/popup/components/DownloadStatus.vue'

const statusStore = {
  activeTasks: [] as DownloadTaskSnapshot[],
  waitingTasks: [] as DownloadTaskSnapshot[],
  failedTasks: [] as DownloadTaskSnapshot[],
  activeCount: 0,
  currentCount: 0,
  waitingCount: 0,
  failedCount: 0,
  totalCount: 0,
  hasTasks: false,
  currentProgress: null as number | null,
  cancelRequestIds: [] as string[],
  cancelTask: vi.fn(),
  retryTask: vi.fn()
}

vi.mock('@/popup/stores/downloadStatusStore', () => ({
  useDownloadStatusStore: () => statusStore
}))

const IconStub = defineComponent({
  template: '<span class="icon-stub" aria-hidden="true"></span>'
})

let wrapper: VueWrapper | null = null

describe('DownloadStatus', () => {
  beforeEach(() => {
    statusStore.activeTasks = [activeTask()]
    statusStore.waitingTasks = [waitingTask()]
    statusStore.activeCount = 1
    statusStore.currentCount = 1
    statusStore.waitingCount = 1
    statusStore.failedTasks = [failedTask()]
    statusStore.failedCount = 1
    statusStore.totalCount = 3
    statusStore.hasTasks = true
    statusStore.currentProgress = 48
    statusStore.cancelTask.mockReset()
    statusStore.retryTask.mockReset()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('显示数量和进度，点击分组展示任务并可用 Escape 关闭', async () => {
    wrapper = mount(DownloadStatus, {
      attachTo: document.body,
      global: {
        plugins: [createTestI18n()],
        stubs: { Icon: IconStub }
      }
    })

    const trigger = wrapper.get('.status-trigger')
    expect(trigger.text()).toContain('2·48%')
    expect(trigger.attributes('aria-label')).toBe(
      '1 downloading, 1 waiting, 1 failed, 48%'
    )
    expect(trigger.attributes('aria-expanded')).toBe('false')

    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[role="region"]').isVisible()).toBe(true)
    expect(wrapper.get('.task-scroll-area').text()).toContain('Downloading (1)')
    expect(wrapper.get('.task-scroll-area').text()).toContain('Waiting (1)')
    expect(wrapper.get('.task-scroll-area').text()).toContain('active-video.mp4')
    expect(wrapper.get('.task-scroll-area').text()).toContain('1.0 KB / 2.0 KB · ≈512 B/s')
    expect(wrapper.get('.task-scroll-area').text()).toContain('Getting filename…')
    expect(wrapper.get('.task-scroll-area').text()).toContain('Failed (1)')
    expect(wrapper.get('.task-scroll-area').text()).toContain('Failed')

    // 已开始的传输没有取消协议，活动行不提供取消入口，只有等待行可以本地移除。
    expect(wrapper.findAll('.cancel-button')).toHaveLength(1)
    await wrapper.findAll('.cancel-button')[0].trigger('click')
    expect(statusStore.cancelTask).toHaveBeenCalledWith('scope:waiting')
    await wrapper.get('.retry-button').trigger('click')
    expect(statusStore.retryTask).toHaveBeenCalledWith('scope:failed')

    await trigger.trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[role="region"]').exists()).toBe(false)
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger.element)

    await trigger.trigger('click')
    document.dispatchEvent(new CustomEvent('pointerdown'))
    await nextTick()
    expect(wrapper.find('[role="region"]').exists()).toBe(false)

  })

  it('只给等待任务显示取消入口，并按快照数据决定指标行', async () => {
    statusStore.activeTasks = [
      {
        ...activeTask(),
        taskId: 'scope:unsupported',
        receivedBytes: null,
        totalBytes: null,
        bytesPerSecond: null
      }
    ]
    statusStore.waitingTasks = [waitingTask()]
    statusStore.failedTasks = []
    statusStore.activeCount = 1
    statusStore.currentCount = 1
    statusStore.waitingCount = 1
    statusStore.failedCount = 0
    statusStore.totalCount = 2
    statusStore.currentProgress = 42

    wrapper = mount(DownloadStatus, {
      global: {
        plugins: [createTestI18n()],
        stubs: { Icon: IconStub }
      }
    })
    await wrapper.get('.status-trigger').trigger('click')

    expect(wrapper.findAll('.cancel-button')).toHaveLength(1)
    expect(wrapper.get('.cancel-button').attributes('aria-label')).toContain('Getting filename')
    expect(wrapper.findAll('.task-metrics')).toHaveLength(1)
    expect(wrapper.get('.task-metrics').text()).toBe('4.0 KB')
  })
})

/** 构造已知进度的下载中任务。 */
function activeTask(): DownloadTaskSnapshot {
  return {
    taskId: 'scope:active',
    resourceId: 'active',
    filename: 'active-video.mp4',
    type: RESOURCE_TYPES.VIDEO,
    resourceIndex: 0,
    status: 'downloading',
    progress: 42.8,
    receivedBytes: 1024,
    totalBytes: 2048,
    bytesPerSecond: 512,
    bytesAreEstimated: true
  }
}

/** 构造没有文件名的等待任务，覆盖本地化回退名称。 */
function waitingTask(): DownloadTaskSnapshot {
  return {
    taskId: 'scope:waiting',
    resourceId: 'waiting',
    type: RESOURCE_TYPES.VIDEO,
    resourceIndex: 1,
    status: 'waiting',
    progress: null,
    receivedBytes: null,
    totalBytes: 4096,
    bytesPerSecond: null,
    bytesAreEstimated: false
  }
}

/** 构造可由 Popup 人工重试的失败任务。 */
function failedTask(): DownloadTaskSnapshot {
  return {
    ...waitingTask(),
    taskId: 'scope:failed',
    resourceId: 'failed',
    filename: 'failed-video.mp4',
    status: 'failed'
  }
}

/** 创建组件测试需要的最小英语翻译表。 */
function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        'downloadStatus.title': 'Downloads',
        'downloadStatus.summary':
          '{downloading} downloading, {waiting} waiting, {failed} failed, {progress}',
        'downloadStatus.downloadingCount': 'Downloading ({count})',
        'downloadStatus.waitingCount': 'Waiting ({count})',
        'downloadStatus.failedCount': 'Failed ({count})',
        'downloadStatus.failed': 'Failed',
        'downloadStatus.unknownProgress': '…',
        'downloadStatus.progress': '{progress}%',
        'downloadStatus.resolvingFilename': 'Getting filename…',
        'downloadStatus.taskProgress': '{filename}: {progress}%',
        'downloadStatus.cancelTask': 'Cancel {filename}',
        'downloadStatus.retryTask': 'Retry {filename}',
        'resourceItem.downloading': 'Downloading…',
        'resourceItem.waiting': 'Waiting…',
        'resourceItem.type.video': 'Video'
      }
    }
  })
}
