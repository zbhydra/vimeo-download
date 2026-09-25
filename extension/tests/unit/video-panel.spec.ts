/**
 * Popup 视频面板：视频列表合并、当前视频判定、五行档位、时间裁剪与行内下载。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, nextTick } from 'vue'

import { I18N_KEYS } from '@/core/constants/i18n'
import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES, type ResourceType } from '@/core/constants/resource'
import type { MediaResource, VideoGroupSummary } from '@/core/types'
import enUS from '@/locales/en-US.json'
import zhCN from '@/locales/zh-CN.json'
import { useResourceStore } from '@/popup/stores/resourceStore'
import {
  buildDetectedVideos,
  buildVideoPanelRows,
  resolveVideoSelection,
  type VideoPanelOption
} from '@/popup/utils/videoPanel'
import {
  encodeVimeoSourceDescriptor,
  stripVimeoClipSuffix,
  type VimeoOptionKind,
  type VimeoSourceDescriptor
} from '@/sites/vimeo/shared'
import VideoPanel from '@/popup/components/VideoPanel.vue'

vi.mock('@/sites/vimeo/media', async importOriginal => {
  const actual = await importOriginal<typeof import('@/sites/vimeo/media')>()
  return { ...actual, applyVimeoTimeRange: vi.fn(actual.applyVimeoTimeRange) }
})

vi.mock('@/popup/rpc/content.rpc', () => ({
  ContentChannel: vi.fn(() => ({
    getResources: vi.fn(() => Promise.resolve({ resources: [], count: 0 })),
    downloadBatch: vi.fn(() => Promise.resolve({ accepted: true, count: 1 }))
  }))
}))

const media = await import('@/sites/vimeo/media')

const VIDEO_ID = '1196869805'
const CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config?h=controlled`
const DASH_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/master.json'
const HLS_URL = 'https://vod-adaptive-ak.vimeocdn.com/hls/1080/prog.m3u8'

const IconStub = defineComponent({
  template: '<span class="icon-stub" aria-hidden="true"></span>'
})

let wrapper: VueWrapper | null = null

/** 面板默认处在「Popup 已固定在站点标签页」的状态。 */
const SITE_TAB = { id: 7, url: 'https://vimeo.com/1196869805', active: true } as chrome.tabs.Tab

/**
 * 挂载面板并写入 store 资源。
 *
 * `locale` 用于验证文案真的来自词条表；`targetTab` 传 null 表示 Popup 打开时不在站点页面
 * 且没有其它站点标签页，用于覆盖引导态。资源与组元数据必须在 `initialize` 落定之后再写入，
 * 否则会被它内部的整体替换清掉。
 */
async function mountPanel(
  resources: MediaResource[],
  locale: 'en-US' | 'zh-CN' = 'en-US',
  targetTab: chrome.tabs.Tab | null = SITE_TAB,
  videoGroups: VideoGroupSummary[] = []
): Promise<VueWrapper> {
  const store = useResourceStore()
  await store.initialize(targetTab)
  store.resources = resources
  store.videoGroups = videoGroups

  return mount(VideoPanel, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale,
          fallbackLocale: 'en-US',
          messages: { 'en-US': enUS, 'zh-CN': zhCN }
        })
      ],
      stubs: { Icon: IconStub }
    }
  })
}

/** 取最后一次 download 事件携带的资源。 */
function lastDownloadedResource(target: VueWrapper): MediaResource {
  const events = target.emitted('download')
  const last = events?.[events.length - 1]?.[0]
  if (!last) {
    throw new Error('[VideoPanelTest] 没有捕获到 download 事件')
  }
  return last as MediaResource
}

describe('videoPanel 派生逻辑', () => {
  it('按 videoGroups 组序合并资源：零资源组跳过，组元数据优取 config 值', () => {
    const videos = buildDetectedVideos(
      [
        { videoId: VIDEO_ID, title: 'Config Title', author: 'Config Author', durationSeconds: 61 },
        // 只有元数据、没有任何资源的「幽灵组」：不进列表、不计入检测数。
        { videoId: 'ghost', title: 'Ghost' },
        { videoId: '111', title: '' }
      ],
      [
        vimeoResource({ optionId: 'best', label: 'Best', index: 0 }),
        vimeoResource({ optionId: 'best', label: 'Best', index: 0, videoId: '111' }),
        vimeoResource({ optionId: 'dash:video-track', label: '1080p HD', index: 1 })
      ]
    )

    expect(videos.map(video => video.videoId)).toEqual([VIDEO_ID, '111'])
    expect(videos[0].title).toBe('Config Title')
    expect(videos[0].author).toBe('Config Author')
    expect(videos[0].durationSeconds).toBe(61)
    expect(videos[0].resources).toHaveLength(2)
    // 组标题缺失（空串）时回退资源标题，而不是直接跳到 videoId。
    expect(videos[1].title).toBe('Demo Video')
    expect(videos[1].resources).toHaveLength(1)
  })

  it('组元数据缺封面时回退封面档位资源；标题全缺时按「文件名 → videoId」兜底', () => {
    const videos = buildDetectedVideos(
      [
        { videoId: VIDEO_ID, title: '' },
        { videoId: '222', title: '', thumbnailUrl: 'https://i.vimeocdn.com/video/222.jpg' },
        { videoId: '333', title: '' }
      ],
      [
        rawResource(VIDEO_ID, { filename: 'clip.mp4' }),
        rawResource('222', { title: 'Resource Title' }),
        rawResource('333', {})
      ]
    )

    expect(videos.map(video => video.videoId)).toEqual([VIDEO_ID, '222', '333'])
    expect(videos[0].title).toBe('clip.mp4')
    expect(videos[1].title).toBe('Resource Title')
    // 契约规定的最终兜底：连文件名都没有时直接展示 videoId，不会出现空标题。
    expect(videos[2].title).toBe('333')
  })

  it('封面优取组元数据 thumbnailUrl；资源 messageId 不在组里时按资源顺序追加（版本差兜底）', () => {
    const videos = buildDetectedVideos(
      [{ videoId: VIDEO_ID, title: 'Demo Video', thumbnailUrl: 'https://i.vimeocdn.com/video/group.jpg' }],
      [
        vimeoResource({ optionId: 'best', label: 'Best', index: 0 }),
        vimeoResource({ optionId: 'best-thumbnail', label: 'Thumbnail', index: 1, kind: 'image' }),
        // 旧 content script 只回资源不带组元数据时，该视频按资源字段派生后追加在列表尾。
        rawResource('999', { title: 'Skew Video', author: 'Skew Author', duration: 125 })
      ]
    )

    // 组元数据出现即权威：封面取 thumbnailUrl，不用封面档位资源的缩略图顶替。
    expect(videos[0].thumbnailUrl).toBe('https://i.vimeocdn.com/video/group.jpg')
    expect(videos[0].thumbnailUrl).not.toBe(`https://i.vimeocdn.com/video/${VIDEO_ID}.jpg`)
    expect(videos[1].videoId).toBe('999')
    expect(videos[1].title).toBe('Skew Video')
    expect(videos[1].author).toBe('Skew Author')
    expect(videos[1].durationSeconds).toBe(125)
  })

  it('没有资源时不产生分组', () => {
    expect(buildDetectedVideos([{ videoId: VIDEO_ID, title: 'Ghost' }], [])).toEqual([])
    expect(buildDetectedVideos([], [])).toEqual([])
  })

  it('五行按类型归位：DASH/HLS 归 Video 行，progressive 归直接下载行，无档位的行保持空列表', () => {
    const rows = buildVideoPanelRows(
      [
        vimeoResource({ optionId: 'best', label: 'Best', index: 0 }),
        vimeoResource({
          optionId: 'progressive:1080p:30',
          label: '1080p MP4',
          delivery: 'progressive',
          index: 1,
          size: 30 * 1024 ** 2
        }),
        vimeoResource({ optionId: 'dash:audio', label: '195 kbps', index: 2, kind: 'audio' }),
        vimeoResource({ optionId: 'best-thumbnail', label: 'Thumbnail', index: 3, kind: 'image' })
      ],
      key => key
    )

    expect(rows.map(row => row.kind)).toEqual(['video', 'direct', 'audio', 'subtitle', 'image'])
    expect(rows.map(row => row.options.length)).toEqual([1, 1, 1, 0, 1])
    expect(rows[4].labelKey).toBe(I18N_KEYS.RESOURCE_ITEM.TYPE_IMAGE)
    // 直接下载行有自己的行名词条，下拉值就是资源 ID（progressive 无音轨变体可归并）。
    expect(rows[1].labelKey).toBe(I18N_KEYS.VIDEO_PANEL.DIRECT_ROW_LABEL)
    expect(rows[1].options[0].id).toBe(`vimeo:${VIDEO_ID}:video:progressive:1080p:30`)
    expect(rows[1].options[0].label).toBe('1080p MP4 · 30.0 MB')
    expect(rows[1].options[0].audioVariants).toBeUndefined()
  })

  it('页面只有 progressive 直链时 Video 行为空，直链（含 Best）全部落「直接下载」行', () => {
    const rows = buildVideoPanelRows(
      [
        vimeoResource({
          optionId: 'best',
          label: 'Best',
          delivery: 'progressive',
          index: 0,
          size: 40 * 1024 ** 2
        }),
        vimeoResource({
          optionId: 'progressive:720p:30',
          label: '720p MP4',
          delivery: 'progressive',
          index: 1
        })
      ],
      key => key
    )

    expect(rows.find(row => row.kind === 'video')?.options).toEqual([])
    const direct = rows.find(row => row.kind === 'direct')?.options ?? []
    expect(direct.map(option => option.id)).toEqual([
      `vimeo:${VIDEO_ID}:video:best`,
      `vimeo:${VIDEO_ID}:video:progressive:720p:30`
    ])
    expect(direct[0].label).toBe('Best · 40.0 MB')
  })

  it('Video 行按 videoTrackId 归并同画质的两个音轨变体，Best 单独成项', () => {
    const rows = buildVideoPanelRows(defaultResources(), key => key)
    const [best, quality] = rows[0].options

    expect(rows[0].options.map(option => option.id)).toEqual([
      `vimeo:${VIDEO_ID}:video:best`,
      `vimeo:${VIDEO_ID}:video:dash:video-track`
    ])
    // 有音轨变体是代表资源，它的标签（含大小）是开关处于「有音轨」时的展示值。
    expect(best.audioVariants).toEqual({
      withAudioId: `vimeo:${VIDEO_ID}:video:best`,
      withoutAudioId: `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`
    })
    expect(best.noAudioLabel).toBe('1080p HD (no audio) · 34.0 MB')
    expect(quality.audioVariants).toEqual({
      withAudioId: `vimeo:${VIDEO_ID}:video:dash:video-track`,
      withoutAudioId: `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`
    })
  })

  it('多条纯视频档位并存时，`Best` 的无音轨 fallback 取列表里第一条（最高画质）', () => {
    const options = buildVideoPanelRows(twoTrackResources(), key => key)[0].options

    expect(options.map(option => option.id)).toEqual([
      `vimeo:${VIDEO_ID}:video:best`,
      `vimeo:${VIDEO_ID}:video:dash:video-2160`,
      `vimeo:${VIDEO_ID}:video:dash:video-1080`
    ])
    // 前提是「列表顺序即画质降序」：fallback 只能落在 2160p，不能是 1080p 或最后一条。
    expect(options[0].audioVariants).toEqual({
      withAudioId: `vimeo:${VIDEO_ID}:video:best`,
      withoutAudioId: `vimeo:${VIDEO_ID}:video:dash:video-2160:no-audio`
    })
    expect(options[1].audioVariants).toEqual({
      withAudioId: `vimeo:${VIDEO_ID}:video:dash:video-2160`,
      withoutAudioId: `vimeo:${VIDEO_ID}:video:dash:video-2160:no-audio`
    })
    expect(options[2].audioVariants).toEqual({
      withAudioId: `vimeo:${VIDEO_ID}:video:dash:video-1080`,
      withoutAudioId: `vimeo:${VIDEO_ID}:video:dash:video-1080:no-audio`
    })
  })
})

describe('videoPanel 音轨选择解析', () => {
  /** 构造一个 Video 行档位。 */
  function option(input: Partial<VideoPanelOption> = {}): VideoPanelOption {
    return { id: 'video:1', label: '1080p HD', ...input }
  }

  const BOTH: VideoPanelOption = {
    id: 'video:1',
    label: '1080p HD',
    audioVariants: { withAudioId: 'video:1', withoutAudioId: 'video:1:no-audio' }
  }

  it('两个变体都在时按开关二选一', () => {
    expect(resolveVideoSelection(BOTH, true)).toEqual({
      resourceId: 'video:1',
      withAudio: true,
      audioSwitchEnabled: true
    })
    expect(resolveVideoSelection(BOTH, false)).toEqual({
      resourceId: 'video:1:no-audio',
      withAudio: false,
      audioSwitchEnabled: true
    })
  })

  it('只有纯视频变体时锁在「无音轨」并禁用开关（playlist 没有音轨 / 合计超限只剩纯视频）', () => {
    const noAudioOnly = option({
      id: 'video:1:no-audio',
      audioVariants: { withAudioId: null, withoutAudioId: 'video:1:no-audio' }
    })

    expect(resolveVideoSelection(noAudioOnly, true)).toEqual({
      resourceId: 'video:1:no-audio',
      withAudio: false,
      audioSwitchEnabled: false
    })
  })

  it('只有带音轨变体时锁在「有音轨」并禁用开关（progressive/HLS 直链自带音轨）', () => {
    const withAudioOnly = option({
      audioVariants: { withAudioId: 'video:1', withoutAudioId: null }
    })

    expect(resolveVideoSelection(withAudioOnly, false)).toEqual({
      resourceId: 'video:1',
      withAudio: true,
      audioSwitchEnabled: false
    })
  })

  it('档位缺失时不给资源 ID，不编造身份', () => {
    expect(resolveVideoSelection(undefined, true)).toEqual({
      resourceId: undefined,
      withAudio: true,
      audioSwitchEnabled: false
    })
  })
})

describe('VideoPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(media.applyVimeoTimeRange).mockClear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('渲染视频信息区的标题、封面与画质', async () => {
    wrapper = await mountPanel([
      vimeoResource({ optionId: 'best', label: 'Best', index: 0, size: 5 * 1024 ** 3 }),
      vimeoResource({ optionId: 'best-thumbnail', label: 'Thumbnail', index: 1, kind: 'image' })
    ])

    expect(wrapper.get('.video-title').text()).toBe('Demo Video')
    expect(wrapper.get('.poster img').attributes('src')).toBe(
      `https://i.vimeocdn.com/video/${VIDEO_ID}.jpg`
    )
    expect(wrapper.get('.video-meta').text()).toBe('Best · 5.0 GB')
  })

  it('信息卡封面优取组元数据 thumbnailUrl', async () => {
    wrapper = await mountPanel(defaultResources(), 'en-US', SITE_TAB, [
      { videoId: VIDEO_ID, title: 'Demo Video', thumbnailUrl: 'https://i.vimeocdn.com/video/group.jpg' }
    ])

    expect(wrapper.get('.poster img').attributes('src')).toBe(
      'https://i.vimeocdn.com/video/group.jpg'
    )
  })

  it('信息区渲染作者与时长，时长用既有格式化器呈现', async () => {
    wrapper = await mountPanel([
      vimeoResource({
        optionId: 'best',
        label: 'Best',
        index: 0,
        author: 'Demo Author',
        duration: 3725
      }),
      vimeoResource({ optionId: 'best-thumbnail', label: 'Thumbnail', index: 1, kind: 'image' })
    ])

    expect(wrapper.get('.video-author').text()).toBe('Demo Author')
    expect(wrapper.get('.video-duration').text()).toBe('1:02:05')
  })

  it('作者与时长缺失时两行都不渲染，没有封面时渲染占位块', async () => {
    wrapper = await mountPanel([vimeoResource({ optionId: 'best', label: 'Best', index: 0 })])

    expect(wrapper.find('.video-author').exists()).toBe(false)
    expect(wrapper.find('.video-duration').exists()).toBe(false)
    expect(wrapper.find('.poster img').exists()).toBe(false)
    expect(wrapper.find('.thumb-placeholder').exists()).toBe(true)
  })

  it('档位标签带上真实大小，拿不到大小的档位保持原标签', async () => {
    wrapper = await mountPanel([
      vimeoResource({
        optionId: 'best',
        label: 'Best',
        index: 0,
        withAudio: true,
        size: 5 * 1024 ** 3
      }),
      vimeoResource({ optionId: 'dash:video-track', label: '1080p HD', index: 1, withAudio: true }),
      vimeoResource({
        optionId: 'dash:audio-track',
        label: '195 kbps',
        index: 2,
        kind: 'audio',
        size: 3 * 1024 ** 2
      })
    ])

    expect(videoOptions(wrapper)).toEqual(['Best · 5.0 GB', '1080p HD'])
    expect(wrapper.get('.option-row[data-row="audio"] option').text()).toBe('195 kbps · 3.0 MB')
    // 信息区副标题与下拉里的档位标签同源，不把大小重复拼一次。
    expect(wrapper.get('.video-meta').text()).toBe('Best · 5.0 GB')
  })

  it('保存位置预填设置里的子目录，改动后写回设置', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
      settings: { language: 'en-US', downloadPath: 'my-videos' }
    } as never)

    wrapper = await mountPanel(defaultResources())
    await flushPromises()

    const input = wrapper.get<HTMLInputElement>('.save-path-input')
    expect(input.element.value).toBe('my-videos')
    expect(wrapper.get('.save-path-section .row-label').text()).toBe(
      enUS['videoPanel.savePath.label']
    )
    expect(input.attributes('placeholder')).toBe(enUS['videoPanel.savePath.placeholder'])

    await input.setValue('  videos/2026  ')
    await input.trigger('change')
    await flushPromises()

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      settings: expect.objectContaining({ downloadPath: 'videos/2026' })
    })

    // 清空后回填默认子目录：输入框显示的始终是实际生效的目录
    await input.setValue('   ')
    await input.trigger('change')
    await flushPromises()

    expect(input.element.value).toBe('vimeo-video-downloader')
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      settings: expect.objectContaining({ downloadPath: 'vimeo-video-downloader' })
    })
  })

  it('视频行下拉只列画质档位，音轨改由独立开关切换，封面行没有下拉', async () => {
    wrapper = await mountPanel(defaultResources())

    // 同画质的有音轨 / 无音轨两条资源并成一条下拉项，标签取有音轨变体（含它自己的大小）。
    expect(videoOptions(wrapper)).toEqual(['Best · 40.0 MB', '1080p HD · 38.0 MB'])
    expect(audioSwitch(wrapper).attributes('role')).toBe('switch')
    expect(audioSwitch(wrapper).attributes('aria-checked')).toBe('true')
    expect(audioSwitch(wrapper).attributes('aria-label')).toBe(enUS['videoPanel.audioSwitch.label'])
    expect(audioSwitch(wrapper).text()).toBe(enUS['videoPanel.audioSwitch.withAudio'])
    expect(audioSwitch(wrapper).attributes('disabled')).toBeUndefined()

    expect(wrapper.find('.option-row[data-row="image"] select').exists()).toBe(false)
    // 封面行没有档位可选，只展示封面格式标识。
    expect(wrapper.get('.option-row[data-row="image"] .row-select-static').text()).toBe('JPG')
  })

  it('档位与音轨开关的词条在 zh-CN 下渲染中文，不回落 media 层的英文 label', async () => {
    wrapper = await mountPanel(
      [
        vimeoResource({
          optionId: 'best',
          label: 'Best',
          index: 0,
          withAudio: true,
          labelKey: I18N_KEYS.RESOURCE_ITEM.LABEL_BEST
        }),
        vimeoResource({
          optionId: 'dash:video-track',
          label: '1080p HD',
          index: 1,
          withAudio: true
        }),
        vimeoResource({
          optionId: 'dash:video-track:no-audio',
          label: '1080p HD (no audio)',
          index: 2,
          labelKey: I18N_KEYS.RESOURCE_ITEM.LABEL_VIDEO_NO_AUDIO,
          labelParams: { quality: '1080p' }
        }),
        vimeoResource({
          optionId: 'best-thumbnail',
          label: 'Thumbnail',
          index: 3,
          kind: 'image',
          labelKey: I18N_KEYS.RESOURCE_ITEM.LABEL_THUMBNAIL
        })
      ],
      'zh-CN'
    )

    // en-US 的键值与 label 逐字相同，只有换成 zh-CN 才能证明词条键真的生效。
    expect(videoOptions(wrapper)).toEqual([zhCN['resourceItem.label.best'], '1080p HD'])
    expect(audioSwitch(wrapper).attributes('aria-label')).toBe(zhCN['videoPanel.audioSwitch.label'])
    expect(audioSwitch(wrapper).text()).toBe(zhCN['videoPanel.audioSwitch.withAudio'])

    await audioSwitch(wrapper).trigger('click')

    // 切到无音轨：两条下拉项都换成无音轨变体的词条——`Best` 的无音轨交付就是这条纯视频档位。
    const noAudioLabel = zhCN['resourceItem.label.videoNoAudio'].replace('{quality}', '1080p')
    expect(audioSwitch(wrapper).text()).toBe(zhCN['videoPanel.audioSwitch.withoutAudio'])
    expect(videoOptions(wrapper)).toEqual([noAudioLabel, noAudioLabel])
    // 封面行固定显示格式标识；封面档位自己的词条仍出现在下载按钮的可访问名里。
    expect(wrapper.get('.option-row[data-row="image"] .row-select-static').text()).toBe('JPG')
    expect(
      wrapper.get('.option-row[data-row="image"] .row-download').attributes('aria-label')
    ).toBe(`${zhCN['resourceItem.download']} ${zhCN['resourceItem.label.thumbnail']}`)
    expect(wrapper.get('.option-row[data-row="video"] .row-label').text()).toBe(
      zhCN['resourceItem.type.video']
    )
  })

  it('没有字幕档位时字幕行禁用，且没有封面档位时封面行按钮禁用', async () => {
    wrapper = await mountPanel([
      vimeoResource({ optionId: 'best', label: 'Best', index: 0 })
    ])

    expect(
      wrapper.get<HTMLSelectElement>('.option-row[data-row="subtitle"] select').element.disabled
    ).toBe(true)
    expect(
      wrapper.get<HTMLButtonElement>('.option-row[data-row="subtitle"] .row-download').element
        .disabled
    ).toBe(true)
    expect(
      wrapper.get<HTMLButtonElement>('.option-row[data-row="image"] .row-download').element.disabled
    ).toBe(true)
  })

  it('progressive 直链归「直接下载」行：Video 行不列直链，直链行无音轨开关且下载恒为整片', async () => {
    wrapper = await mountPanel([
      vimeoResource({
        optionId: 'progressive:1080p:30',
        label: '1080p MP4',
        delivery: 'progressive',
        index: 0
      }),
      vimeoResource({ optionId: 'dash:video-track', label: '1080p HD', index: 1, withAudio: true }),
      vimeoResource({
        optionId: 'dash:video-track:no-audio',
        label: '1080p HD (no audio)',
        index: 2
      })
    ])

    // Video 行只列 DASH/HLS 合流档位；progressive 单独成行，且没有音轨开关（直链自带音轨）。
    expect(videoOptions(wrapper)).toEqual(['1080p HD'])
    const directRow = wrapper.get('.option-row[data-row="direct"]')
    expect(directRow.get('option').text()).toBe('1080p MP4')
    expect(directRow.find('.audio-switch').exists()).toBe(false)

    // 直链不支持裁剪：填好区间后从直链行下载，资源身份不带 `:clip:` 后缀（恒为整片）。
    const inputs = wrapper.findAll<HTMLInputElement>('.clip-input')
    await inputs[0].setValue('12.5')
    await inputs[1].setValue('30')
    await directRow.get('.row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(`vimeo:${VIDEO_ID}:video:progressive:1080p:30`)
  })

  it('当前视频没有 progressive 档位时不渲染直接下载行，其余行保留禁用态', async () => {
    wrapper = await mountPanel(defaultResources())

    expect(wrapper.find('.option-row[data-row="direct"]').exists()).toBe(false)
    expect(wrapper.find('.option-row[data-row="audio"]').exists()).toBe(true)
  })

  it('页面只有 progressive 直链时渲染直接下载行，Video 行与裁剪一并禁用', async () => {
    wrapper = await mountPanel([
      vimeoResource({
        optionId: 'progressive:1080p:30',
        label: '1080p MP4',
        delivery: 'progressive',
        index: 0
      })
    ])

    const videoSelect = wrapper.get<HTMLSelectElement>('.option-row[data-row="video"] select')
    expect(videoSelect.element.disabled).toBe(true)
    expect(videoSelect.get('option').text()).toBe(enUS['videoPanel.unavailable'])
    // 没有 DASH/HLS 档位可裁剪：裁剪禁用；直链自带音轨，开关锁在「有音轨」并禁用。
    expect(wrapper.get<HTMLInputElement>('.clip-input').element.disabled).toBe(true)
    expect(wrapper.get('.clip-hint').text()).toBe(enUS['videoPanel.clip.unsupported'])
    expect(wrapper.find('.trim-slider-disabled').exists()).toBe(true)
    expect(wrapper.get('[role="slider"]').attributes('aria-disabled')).toBe('true')
    expect(audioSwitch(wrapper).attributes('aria-checked')).toBe('true')
    expect(audioSwitch(wrapper).attributes('disabled')).toBeDefined()

    // 直接下载行仍然可用：下载那条直链。
    await wrapper.get('.option-row[data-row="direct"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(`vimeo:${VIDEO_ID}:video:progressive:1080p:30`)
  })

  it('填好区间后下载走 applyVimeoTimeRange，身份与文件名都带上区间', async () => {
    wrapper = await mountPanel(defaultResources())

    await wrapper
      .get('.option-row[data-row="video"] select')
      .setValue(`vimeo:${VIDEO_ID}:video:dash:video-track`)
    const inputs = wrapper.findAll<HTMLInputElement>('.clip-input')
    await inputs[0].setValue('12.5')
    await inputs[1].setValue('30')
    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')

    expect(vi.mocked(media.applyVimeoTimeRange)).toHaveBeenCalledTimes(1)
    const clipped = lastDownloadedResource(wrapper)
    expect(clipped.id).toBe(`vimeo:${VIDEO_ID}:video:dash:video-track:clip:12.5-30`)
    expect(clipped.filename).toBe('Demo-Video-dash-video-track-clip-12.5-30s.mp4')
  })

  it('裁剪双滑杆与数字输入双向同步：滑杆步进写回输入，输入编辑反映到滑杆读数', async () => {
    wrapper = await mountPanel(defaultResources(), 'en-US', SITE_TAB, [
      { videoId: VIDEO_ID, title: 'Demo Video', durationSeconds: 60 }
    ])

    const handles = wrapper.findAll('[role="slider"]')
    const inputs = wrapper.findAll<HTMLInputElement>('.clip-input')
    expect(inputs[0].element.value).toBe('')

    // 起点滑杆步进写回输入；终点输入为空时补全长，一次拖动即生成完整区间。
    await handles[0].trigger('keydown', { key: 'ArrowRight' })
    expect(inputs[0].element.value).toBe('1')
    expect(inputs[1].element.value).toBe('60')

    // Shift 组合键粗步 +10s。
    await handles[0].trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(inputs[0].element.value).toBe('11')

    // 数字输入是同一状态的另一入口：编辑后滑杆读数随之更新。
    await inputs[1].setValue('30')
    expect(handles[1].attributes('aria-valuenow')).toBe('30')

    // 起点步进钳在终点，不产生交叉区间。
    await inputs[0].setValue('29.5')
    await handles[0].trigger('keydown', { key: 'ArrowRight' })
    expect(inputs[0].element.value).toBe('30')
    expect(handles[0].attributes('aria-valuenow')).toBe('30')
  })

  it('区间只作用于可裁剪档位，字幕与封面仍下载整片', async () => {
    wrapper = await mountPanel([
      ...defaultResources(),
      vimeoResource({
        optionId: 'subtitle:en',
        label: 'English',
        delivery: 'subtitle',
        kind: 'subtitle',
        index: 3
      })
    ])

    const inputs = wrapper.findAll<HTMLInputElement>('.clip-input')
    await inputs[0].setValue('1')
    await inputs[1].setValue('2')
    await wrapper.get('.option-row[data-row="subtitle"] .row-download').trigger('click')

    expect(lastDownloadedResource(wrapper).id).toBe(`vimeo:${VIDEO_ID}:subtitle:subtitle:en`)
  })

  it('行内按钮下载「下拉画质 × 音轨开关」共同决定的档位', async () => {
    wrapper = await mountPanel(defaultResources())

    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(`vimeo:${VIDEO_ID}:video:best`)

    // 下拉只给画质：选中的 1080p 在开关处于「有音轨」时下载带音轨资源。
    await wrapper
      .get('.option-row[data-row="video"] select')
      .setValue(`vimeo:${VIDEO_ID}:video:dash:video-track`)
    expect(audioSwitch(wrapper).attributes('aria-checked')).toBe('true')
    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(`vimeo:${VIDEO_ID}:video:dash:video-track`)

    // 同一画质切到「无音轨」：下载身份换成缓存里那条纯视频资源。
    await audioSwitch(wrapper).trigger('click')
    expect(audioSwitch(wrapper).attributes('aria-checked')).toBe('false')
    expect(wrapper.get('.video-meta').text()).toBe('1080p HD (no audio) · 34.0 MB')
    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(
      `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`
    )

    // 切回「有音轨」，同一个下拉值回到带音轨资源。
    await audioSwitch(wrapper).trigger('click')
    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(`vimeo:${VIDEO_ID}:video:dash:video-track`)

    await wrapper.get('.option-row[data-row="image"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(`vimeo:${VIDEO_ID}:image:best-thumbnail`)
  })

  it('Best 切到无音轨落到最高画质的纯视频档，下拉、副标题与按钮名换成同一条资源的标签', async () => {
    wrapper = await mountPanel(defaultResources())

    await audioSwitch(wrapper).trigger('click')

    // `Best` 不存在 `best:no-audio` 资源，无音轨交付就是缓存里的 1080p 纯视频档位；三处展示取同一个值。
    const noAudioLabel = '1080p HD (no audio) · 34.0 MB'
    expect(videoOptions(wrapper)).toEqual([noAudioLabel, noAudioLabel])
    expect(wrapper.get('.video-meta').text()).toBe(noAudioLabel)
    expect(
      wrapper.get('.option-row[data-row="video"] .row-download').attributes('aria-label')
    ).toBe(`${enUS['resourceItem.download']} ${noAudioLabel}`)

    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(
      `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`
    )
  })

  it('多条纯视频档位并存时，Best 的无音轨交付取最高画质那条而不是最后一条', async () => {
    wrapper = await mountPanel(twoTrackResources())

    await audioSwitch(wrapper).trigger('click')

    expect(wrapper.get('.video-meta').text()).toBe('2160p HD (no audio) · 72.0 MB')
    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(
      `vimeo:${VIDEO_ID}:video:dash:video-2160:no-audio`
    )
  })

  it('音轨偏好跨档位保持：锁在「有音轨」的档位不改写偏好，切回有得选的档位仍是无音轨', async () => {
    wrapper = await mountPanel([
      ...defaultResources(),
      vimeoResource({ optionId: 'hls:track', label: 'HLS 1080p', delivery: 'hls', index: 4 })
    ])

    await audioSwitch(wrapper).trigger('click')
    expect(audioSwitch(wrapper).attributes('aria-checked')).toBe('false')

    // HLS 直链自带音轨：开关锁「有音轨」并禁用，但只影响呈现，不改写用户偏好。
    await wrapper
      .get('.option-row[data-row="video"] select')
      .setValue(`vimeo:${VIDEO_ID}:video:hls:track`)
    expect(audioSwitch(wrapper).attributes('aria-checked')).toBe('true')
    expect(audioSwitch(wrapper).attributes('disabled')).toBeDefined()

    // 切回有得选的 DASH 档位：偏好仍是「无音轨」，下载的也是纯视频资源。
    await wrapper
      .get('.option-row[data-row="video"] select')
      .setValue(`vimeo:${VIDEO_ID}:video:dash:video-track`)
    expect(audioSwitch(wrapper).attributes('aria-checked')).toBe('false')
    expect(audioSwitch(wrapper).attributes('disabled')).toBeUndefined()

    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(
      `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`
    )
  })

  it('playlist 没有音轨时开关锁在「无音轨」并禁用，下载那条纯视频档位', async () => {
    wrapper = await mountPanel([
      vimeoResource({ optionId: 'dash:video-track:no-audio', label: '1080p HD (no audio)', index: 0 })
    ])

    expect(videoOptions(wrapper)).toEqual(['1080p HD (no audio)'])
    expect(audioSwitch(wrapper).attributes('aria-checked')).toBe('false')
    expect(audioSwitch(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(
      `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`
    )
  })

  it('Best 本身无音轨时（视频 + 音频合计超限只剩纯视频）开关锁在「无音轨」并禁用', async () => {
    wrapper = await mountPanel([
      vimeoResource({ optionId: 'best', label: 'Best', index: 0 }),
      vimeoResource({
        optionId: 'dash:video-track:no-audio',
        label: '1080p HD (no audio)',
        index: 1
      })
    ])

    expect(audioSwitch(wrapper).attributes('aria-checked')).toBe('false')
    expect(audioSwitch(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')
    expect(lastDownloadedResource(wrapper).id).toBe(`vimeo:${VIDEO_ID}:video:best`)
  })

  it('关掉音轨后填区间：身份是 `:no-audio` 在内、`:clip:` 在后的真实资源 ID', async () => {
    wrapper = await mountPanel(defaultResources())

    await wrapper
      .get('.option-row[data-row="video"] select')
      .setValue(`vimeo:${VIDEO_ID}:video:dash:video-track`)
    await audioSwitch(wrapper).trigger('click')

    const inputs = wrapper.findAll<HTMLInputElement>('.clip-input')
    await inputs[0].setValue('12.5')
    await inputs[1].setValue('30')
    await wrapper.get('.option-row[data-row="video"] .row-download').trigger('click')

    // 裁剪只加后缀、不改内部段序，content 侧据此按去后缀的基础 ID 找回纯视频档位。
    const clipped = lastDownloadedResource(wrapper)
    expect(clipped.id).toBe(
      `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio:clip:12.5-30`
    )
    expect(stripVimeoClipSuffix(clipped.id)).toBe(
      `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`
    )
  })

  it('页面没有视频时展示空状态并可重新扫描', async () => {
    wrapper = await mountPanel([])

    expect(wrapper.get('.state-text').text()).toBe(enUS['videoPanel.empty'])
    await wrapper.get('.state-button').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

  it('单视频时不渲染视频选择器，布局与既有行为一致', async () => {
    wrapper = await mountPanel(defaultResources())

    expect(wrapper.find('.video-switcher').exists()).toBe(false)
  })

  it('多视频时渲染选择器：检测数量与封面列表项，切换联动五行档位并重置裁剪输入', async () => {
    wrapper = await mountPanel(
      [
        vimeoResource({ optionId: 'best', label: 'Best', index: 0 }),
        vimeoResource({
          optionId: 'best',
          label: 'Best',
          index: 0,
          videoId: '222',
          title: 'Other Video'
        })
      ],
      'en-US',
      SITE_TAB,
      [
        { videoId: VIDEO_ID, title: 'Demo Video', thumbnailUrl: 'https://i.vimeocdn.com/video/a.jpg' },
        { videoId: '222', title: 'Other Video' }
      ]
    )

    expect(wrapper.get('.video-switcher-count').text()).toBe(
      enUS['videoPanel.detectedCount'].replace('{count}', '2')
    )
    // 浮层默认收起；触发按钮展示当前选中视频。
    expect(wrapper.find('.selector-listbox').exists()).toBe(false)
    expect(wrapper.get('.trigger-title').text()).toBe('Demo Video')
    expect(wrapper.get('.trigger-thumb img').attributes('src')).toBe(
      'https://i.vimeocdn.com/video/a.jpg'
    )

    // 打开浮层：列表项是「小封面 + 标题」，当前选中项带 aria-selected。
    await wrapper.get('.selector-trigger').trigger('click')
    const options = wrapper.findAll('[role="option"]')
    expect(options.map(option => option.text())).toEqual(['Demo Video', 'Other Video'])
    expect(options[0].attributes('aria-selected')).toBe('true')
    expect(options[1].attributes('aria-selected')).toBe('false')

    // 默认展示第一个视频；五行档位来自它的资源。
    expect(wrapper.get('.video-title').text()).toBe('Demo Video')
    expect(videoOptionIds(wrapper)).toEqual([`vimeo:${VIDEO_ID}:video:best`])

    // 第一个视频上填过裁剪区间，切换后不携带到下一个视频。
    await wrapper.findAll<HTMLInputElement>('.clip-input')[0].setValue('12.5')
    await options[1].trigger('click')

    expect(wrapper.find('.selector-listbox').exists()).toBe(false)
    expect(wrapper.get('.trigger-title').text()).toBe('Other Video')
    expect(wrapper.get('.video-title').text()).toBe('Other Video')
    expect(wrapper.findAll<HTMLInputElement>('.clip-input')[0].element.value).toBe('')
    expect(videoOptionIds(wrapper)).toEqual(['vimeo:222:video:best'])
  })

  it('选择器键盘路径：方向键移动高亮，Enter 选中，Esc 关闭；点击浮层外也关闭', async () => {
    wrapper = await mountPanel(
      [
        vimeoResource({ optionId: 'best', label: 'Best', index: 0 }),
        vimeoResource({
          optionId: 'best',
          label: 'Best',
          index: 0,
          videoId: '222',
          title: 'Other Video'
        })
      ],
      'en-US',
      SITE_TAB,
      [{ videoId: VIDEO_ID, title: 'Demo Video' }, { videoId: '222', title: 'Other Video' }]
    )
    const trigger = wrapper.get('.selector-trigger')

    // ↑/↓ 在收起时打开浮层，↓ 移动高亮，Enter 选中高亮项。
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.find('.selector-listbox').exists()).toBe(true)
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(wrapper.get('.video-title').text()).toBe('Other Video')

    // 再次打开后 Esc 关闭，选择保持不变。
    await trigger.trigger('click')
    expect(wrapper.find('.selector-listbox').exists()).toBe(true)
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.selector-listbox').exists()).toBe(false)
    expect(wrapper.get('.video-title').text()).toBe('Other Video')

    // 浮层外按下（pointerdown）关闭。happy-dom 不触发 document 级监听器，这里经 spy 取到
    // 组件注册的监听器，按「浮层内 / 浮层外」两种 target 直接调用验证判定分支。
    const addListenerSpy = vi.spyOn(document, 'addEventListener')
    try {
      await trigger.trigger('click')
      const pointerListener = addListenerSpy.mock.calls
        .filter(([type]) => type === 'pointerdown')
        .map(([, listener]) => listener)
        .at(-1) as (event: Event) => void
      expect(pointerListener).toBeDefined()

      pointerListener(pointerEventAt(trigger.element))
      await nextTick()
      expect(wrapper.find('.selector-listbox').exists()).toBe(true)

      pointerListener(pointerEventAt(document.body))
      await nextTick()
      expect(wrapper.find('.selector-listbox').exists()).toBe(false)
    } finally {
      addListenerSpy.mockRestore()
    }
  })

  it('全部视频组都零资源时按空状态呈现，可重新扫描', async () => {
    wrapper = await mountPanel([], 'en-US', SITE_TAB, [{ videoId: 'ghost', title: 'Ghost' }])

    expect(wrapper.get('.state-text').text()).toBe(enUS['videoPanel.empty'])
    await wrapper.get('.state-button').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

  it('当前页不是 Vimeo 时给出引导提示与跳转按钮，且不叠加错误条', async () => {
    wrapper = await mountPanel([], 'zh-CN', null)

    expect(wrapper.get('.state-text').text()).toBe(zhCN['videoPanel.notOnVimeo'])
    expect(wrapper.find('.error-message').exists()).toBe(false)

    await wrapper.get('.state-button').trigger('click')
    expect(wrapper.emitted('openSite')).toHaveLength(1)
    expect(wrapper.emitted('refresh')).toBeUndefined()
  })
})

/** 面板测试默认资源：Best（带音轨）/ 1080p 带音轨 / 1080p 无音轨 / 封面。 */
function defaultResources(): MediaResource[] {
  return [
    vimeoResource({
      optionId: 'best',
      label: 'Best',
      index: 0,
      withAudio: true,
      size: 40 * 1024 ** 2
    }),
    vimeoResource({
      optionId: 'dash:video-track',
      label: '1080p HD',
      index: 1,
      withAudio: true,
      size: 38 * 1024 ** 2
    }),
    vimeoResource({
      optionId: 'dash:video-track:no-audio',
      label: '1080p HD (no audio)',
      index: 2,
      size: 34 * 1024 ** 2
    }),
    vimeoResource({ optionId: 'best-thumbnail', label: 'Thumbnail', index: 3, kind: 'image' })
  ]
}

/**
 * 两条 video track、各自都有纯视频交付。
 *
 * 用于锁定 `Best` 无音轨 fallback 的「取列表里第一条」前提：列表顺序即 content 给出的画质
 * 降序，所以 fallback 必须落在 2160p 那条，而不是 1080p 或最后一条。
 */
function twoTrackResources(): MediaResource[] {
  return [
    vimeoResource({
      optionId: 'best',
      label: 'Best',
      index: 0,
      withAudio: true,
      size: 90 * 1024 ** 2
    }),
    vimeoResource({
      optionId: 'dash:video-2160',
      label: '2160p HD',
      index: 1,
      withAudio: true,
      videoTrackId: 'video-2160',
      size: 80 * 1024 ** 2
    }),
    vimeoResource({
      optionId: 'dash:video-2160:no-audio',
      label: '2160p HD (no audio)',
      index: 2,
      videoTrackId: 'video-2160',
      size: 72 * 1024 ** 2
    }),
    vimeoResource({
      optionId: 'dash:video-1080',
      label: '1080p HD',
      index: 3,
      withAudio: true,
      videoTrackId: 'video-1080',
      size: 38 * 1024 ** 2
    }),
    vimeoResource({
      optionId: 'dash:video-1080:no-audio',
      label: '1080p HD (no audio)',
      index: 4,
      videoTrackId: 'video-1080',
      size: 34 * 1024 ** 2
    })
  ]
}

/** 视频行下拉里的档位文案。 */
function videoOptions(target: VueWrapper): string[] {
  return target
    .get('.option-row[data-row="video"]')
    .findAll('option')
    .map(option => option.text())
}

/** 视频行的音轨开关。 */
function audioSwitch(target: VueWrapper) {
  return target.get('.option-row[data-row="video"] .audio-switch')
}

/** 视频行下拉里各档位的身份（option value）。 */
function videoOptionIds(target: VueWrapper): (string | undefined)[] {
  return target
    .get('.option-row[data-row="video"]')
    .findAll('option')
    .map(option => option.attributes('value'))
}

/** 行类型到资源类型的映射，与面板派生逻辑保持一致。 */
const KIND_RESOURCE_TYPES: Record<VimeoOptionKind, ResourceType> = {
  video: RESOURCE_TYPES.VIDEO,
  audio: RESOURCE_TYPES.AUDIO,
  subtitle: RESOURCE_TYPES.SUBTITLE,
  image: RESOURCE_TYPES.IMAGE
}

/**
 * 构造带指定 target 的 pointerdown 事件。
 *
 * happy-dom 不触发 document 级监听器，取到监听器直接调用时用它在实例上覆写只读的 `target`。
 */
function pointerEventAt(target: EventTarget | null): Event {
  const event = new Event('pointerdown')
  Object.defineProperty(event, 'target', { value: target })
  return event
}

/**
 * 构造最小化的裸资源：不走 vimeoResource 的 descriptor 工厂，只覆盖合并逻辑关心的字段，
 * 用于验证「组元数据缺失 / 标题全缺 / 版本差游离资源」这类边界。
 */
function rawResource(
  videoId: string,
  fields: { title?: string; filename?: string; author?: string; duration?: number }
): MediaResource {
  return {
    id: `vimeo:${videoId}:video:best`,
    messageId: videoId,
    index: 0,
    url: DASH_URL,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    mimeType: 'video/mp4',
    metadata: { messageId: videoId },
    ...fields
  }
}

/** 构造带合法 descriptor 的 Vimeo 资源。 */
function vimeoResource(input: {
  optionId: string
  label: string
  index: number
  kind?: VimeoOptionKind
  delivery?: 'progressive' | 'dash' | 'hls' | 'thumbnail' | 'subtitle'
  size?: number
  author?: string
  duration?: number
  videoId?: string
  title?: string
  labelKey?: string
  labelParams?: Record<string, string>
  /** DASH video 的 track id；同一画质的有音轨 / 无音轨两条资源必须传同一个值。 */
  videoTrackId?: string
  /**
   * DASH video 档位是否带音轨，落地为 descriptor 的 `audioTrackId`。
   *
   * 它是「有音轨 / 无音轨」的唯一真值（见 `tech-扩展端Vimeo本地下载.md` §8.4），不传即纯视频
   * 档位；面板的音轨开关靠这个字段分流，所以 fixture 必须显式建模，不能靠 ID 后缀推断。
   */
  withAudio?: boolean
}): MediaResource {
  const kind = input.kind ?? 'video'
  const delivery =
    input.delivery ?? (kind === 'image' ? 'thumbnail' : kind === 'subtitle' ? 'subtitle' : 'dash')
  const videoId = input.videoId ?? VIDEO_ID
  const title = input.title ?? 'Demo Video'
  const sourceId = `vimeo:${videoId}:${kind}:${input.optionId}`
  const descriptor: VimeoSourceDescriptor = {
    version: 2,
    videoId,
    sourceId,
    optionId: input.optionId,
    kind,
    delivery,
    label: input.label,
    configUrl: CONFIG_URL,
    ...(input.labelKey ? { labelKey: input.labelKey } : {}),
    ...(input.labelParams ? { labelParams: input.labelParams } : {}),
    ...(delivery === 'dash'
      ? {
          dashPlaylistUrl: DASH_URL,
          ...(kind === 'video'
            ? {
                videoTrackId: input.videoTrackId ?? 'video-track',
                ...(input.withAudio ? { audioTrackId: 'audio-track' } : {})
              }
            : { audioTrackId: 'audio-track' })
        }
      : {}),
    ...(delivery === 'hls' ? { hlsPlaylistUrl: HLS_URL } : {})
  }

  return {
    id: sourceId,
    messageId: videoId,
    index: input.index,
    url: DASH_URL,
    type: KIND_RESOURCE_TYPES[kind],
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    filename: `${title.replace(/\s+/g, '-')}-${input.optionId.replace(/[:.]/g, '-')}.mp4`,
    ...(kind === 'image'
      ? { thumbnail: `https://i.vimeocdn.com/video/${videoId}.jpg` }
      : { title }),
    ...(input.author === undefined ? {} : { author: input.author }),
    ...(input.duration === undefined ? {} : { duration: input.duration }),
    ...(input.size === undefined ? {} : { size: input.size }),
    mimeType: kind === 'image' ? 'image/jpeg' : 'video/mp4',
    documentId: encodeVimeoSourceDescriptor(descriptor),
    metadata: { messageId: videoId }
  }
}
