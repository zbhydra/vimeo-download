/** Popup 底部下载管理区：任务分组平铺、单任务取消/重试与「全部停止」。 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent } from 'vue'

import { RESOURCE_TYPES } from '@/core/constants/resource'
import type { DownloadTaskSnapshot } from '@/core/types'
import DownloadQueue from '@/popup/components/DownloadQueue.vue'

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

describe('DownloadQueue', () => {
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

  it('有任务时常驻平铺队列标题、分组与任务卡片', () => {
    wrapper = mountDownloadQueue()

    const region = wrapper.get('[role="region"]')
    expect(region.attributes('aria-label')).toBe('Queue (3)')
    expect(wrapper.get('.queue-title').text()).toBe('Queue (3)')
    expect(region.text()).toContain('Downloading (1)')
    expect(region.text()).toContain('Waiting (1)')
    expect(region.text()).toContain('Failed (1)')
    expect(region.text()).toContain('active-video.mp4')
    expect(region.text()).toContain('42%')
    expect(region.text()).toContain('1.0 KB / 2.0 KB · ≈512 B/s')
    expect(region.text()).toContain('Getting filename…')
    expect(region.text()).toContain('Failed')
  })

  it('存在等待或下载中任务时显示全部停止，并逐个取消全部可停任务', async () => {
    wrapper = mountDownloadQueue()

    const stopAll = wrapper.get('.stop-all-button')
    expect(stopAll.text()).toBe('Stop All')
    await stopAll.trigger('click')
    // background 编排语义：下载中 + 等待全部可停，失败行不在「停止」范围。
    expect(statusStore.cancelTask).toHaveBeenCalledTimes(2)
    expect(statusStore.cancelTask).toHaveBeenCalledWith('scope:waiting')
    expect(statusStore.cancelTask).toHaveBeenCalledWith('scope:active')
    expect(statusStore.cancelTask).not.toHaveBeenCalledWith('scope:failed')
  })

  it('只剩失败任务时不显示全部停止', () => {
    statusStore.activeTasks = []
    statusStore.activeCount = 0
    statusStore.currentCount = 0
    statusStore.waitingTasks = []
    statusStore.waitingCount = 0
    statusStore.totalCount = 1

    wrapper = mountDownloadQueue()

    expect(wrapper.find('.stop-all-button').exists()).toBe(false)
  })

  it('下载中行有取消入口，等待行可取消、失败行可重试', async () => {
    wrapper = mountDownloadQueue()

    expect(wrapper.findAll('.task-action')).toHaveLength(3)
    const actions = wrapper.findAll('.task-action')
    await actions[0].trigger('click')
    expect(statusStore.cancelTask).toHaveBeenCalledWith('scope:active')
    await actions[1].trigger('click')
    expect(statusStore.cancelTask).toHaveBeenCalledWith('scope:waiting')
    await actions[2].trigger('click')
    expect(statusStore.retryTask).toHaveBeenCalledWith('scope:failed')
  })

  it('按快照数据决定下载行指标行与取消禁用态', () => {
    statusStore.activeTasks = [
      {
        ...activeTask(),
        taskId: 'scope:active',
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
    statusStore.cancelRequestIds = ['scope:waiting']

    wrapper = mountDownloadQueue()

    expect(wrapper.findAll('.task-metrics')).toHaveLength(1)
    expect(wrapper.get('.task-metrics').text()).toBe('4.0 KB')
    // 下载中行可点，等待行的取消在 RPC 返回前禁用。
    const actions = wrapper.findAll('.task-action')
    expect(actions).toHaveLength(2)
    expect(actions[0].attributes('disabled')).toBeUndefined()
    expect(actions[1].attributes('disabled')).toBeDefined()
  })

  it('无任务时不渲染任何节点', () => {
    statusStore.activeTasks = []
    statusStore.waitingTasks = []
    statusStore.failedTasks = []
    statusStore.activeCount = 0
    statusStore.currentCount = 0
    statusStore.waitingCount = 0
    statusStore.failedCount = 0
    statusStore.totalCount = 0
    statusStore.hasTasks = false
    statusStore.currentProgress = null

    wrapper = mountDownloadQueue()

    // 根节点 v-if 为假时 Vue 只留一个注释占位节点，不渲染底部区
    expect(wrapper.find('[role="region"]').exists()).toBe(false)
    expect(wrapper.find('.download-queue').exists()).toBe(false)
    expect(wrapper.element.nodeType).toBe(Node.COMMENT_NODE)
  })
})

/** 以统一 stub 挂载底部下载管理区。 */
function mountDownloadQueue(): VueWrapper {
  return mount(DownloadQueue, {
    global: {
      plugins: [createTestI18n()],
      stubs: { Icon: IconStub }
    }
  })
}

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
        'downloadStatus.title': 'Queue ({count})',
        'downloadStatus.stopAll': 'Stop All',
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
