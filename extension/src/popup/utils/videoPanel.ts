/**
 * Popup 单视频面板的纯派生逻辑。
 *
 * Popup 拿到的是一批 `MediaResource`，面板需要把它们收敛到「一个视频、四行档位、一个时间
 * 区间」上。这里只做数据派生，不依赖 i18n 实例与 DOM，便于直接单测。
 */

import { I18N_KEYS } from '@/core/constants/i18n'
import { RESOURCE_TYPES, type MediaResource, type ResourceType } from '@/core/types'
import { formatDownloadBytes } from '@/core/utils/downloadStatus'
import { getVimeoResourceLabel, type VimeoLabelTranslator } from '@/sites/vimeo/media'
import { decodeVimeoSourceDescriptor } from '@/sites/vimeo/shared'

/** 面板四行；数组顺序即展示顺序。 */
export const VIDEO_PANEL_ROW_KINDS = ['video', 'audio', 'subtitle', 'image'] as const

/**
 * 封面行格式标识。
 *
 * 封面固定交付 jpg（见 `buildThumbnailOption` 的扩展名与 MIME），`JPG` 属于跟 `1080p HD`、
 * `128 kbps` 同类的技术标识，不进词条表。
 */
export const COVER_FORMAT_LABEL = 'JPG'

/** 面板行类型。 */
export type VideoPanelRowKind = (typeof VIDEO_PANEL_ROW_KINDS)[number]

/** 一行与资源类型的唯一对应关系。 */
const ROW_RESOURCE_TYPES: Record<VideoPanelRowKind, ResourceType> = {
  video: RESOURCE_TYPES.VIDEO,
  audio: RESOURCE_TYPES.AUDIO,
  subtitle: RESOURCE_TYPES.SUBTITLE,
  image: RESOURCE_TYPES.IMAGE
}

/** 行标签词条；与页面按钮面板共用同一批类型词，两处行名不会分叉。 */
const ROW_LABEL_KEYS: Record<VideoPanelRowKind, string> = {
  video: I18N_KEYS.RESOURCE_ITEM.TYPE_VIDEO,
  audio: I18N_KEYS.RESOURCE_ITEM.TYPE_AUDIO,
  subtitle: I18N_KEYS.RESOURCE_ITEM.TYPE_SUBTITLE,
  image: I18N_KEYS.RESOURCE_ITEM.TYPE_IMAGE
}

/**
 * 一个画质档位的两个音轨变体。
 *
 * 值都是资源缓存里真实存在的资源 ID——`:no-audio` 后缀不在这里拼，有无音轨的语义真值始终
 * 是 descriptor 的 `audioTrackId`（见 `docs/feat/002.下载功能/tech-扩展端Vimeo本地下载.md` §8.4）。
 * 某一侧为 null 表示该档位没有那种交付，音轨开关只能锁在存在的一侧。
 */
export interface VideoPanelAudioVariants {
  /** 有音轨交付的资源 ID。 */
  withAudioId: string | null
  /** 无音轨交付的资源 ID。 */
  withoutAudioId: string | null
}

/** 一行里的单个可选档位。 */
export interface VideoPanelOption {
  /**
   * 档位身份；非 Video 行是资源 ID，可直接下载。
   *
   * Video 行不同：它是「画质档位的代表资源 ID」——同一条 video track 的有音轨与无音轨两条资源
   * 并成一条下拉项后，这里只留代表资源（有音轨变体优先），实际交付还要经音轨开关解析成
   * `audioVariants` 里的哪一个（见 `resolveVideoSelection`）。**不要把它当资源 ID 直接下载。**
   */
  id: string
  /** 已翻译的档位标签。 */
  label: string
  /**
   * 音轨开关切到「无音轨」时的档位标签。
   *
   * 两个变体是两个大小不同的文件，标签里的大小随实际交付走，不显示一个下不到的尺寸；
   * 档位本身没有无音轨变体时缺省，此时开关锁在「有音轨」。
   */
  noAudioLabel?: string
  /** 音轨变体；只有 Video 行携带，其余行的音轨由交付方式本身决定。 */
  audioVariants?: VideoPanelAudioVariants
}

/** Video 行的实际选择：下拉给画质，音轨开关给交付形态，两者一起决定下载哪一个资源。 */
export interface VideoPanelSelection {
  /** 实际下载的资源 ID；该行没有可用档位时为 undefined。 */
  resourceId: string | undefined
  /** 实际交付是否带音轨。 */
  withAudio: boolean
  /** 音轨开关是否可切换：两个变体都存在才有得选。 */
  audioSwitchEnabled: boolean
}

/**
 * 解析 Video 行的实际选择。
 *
 * 身份规则不在这里重写：`dash:{trackId}` 与 `dash:{trackId}:no-audio` 仍是两个独立资源，
 * 这里只是把「画质档位 × 音轨开关」映射回缓存里真实存在的资源 ID。档位缺某一侧时（playlist
 * 本就无音轨、视频合计超限只剩纯视频、progressive/HLS 直链自带音轨）开关锁在存在的一侧，
 * 否则按用户偏好二选一；用户偏好本身不由这里改写，切回有得选的档位时仍然生效。
 */
export function resolveVideoSelection(
  option: VideoPanelOption | undefined,
  withAudio: boolean
): VideoPanelSelection {
  const variants = option?.audioVariants
  if (!variants) {
    return { resourceId: option?.id, withAudio: true, audioSwitchEnabled: false }
  }

  const audioSwitchEnabled = variants.withAudioId !== null && variants.withoutAudioId !== null
  const effectiveWithAudio = audioSwitchEnabled ? withAudio : variants.withAudioId !== null

  return {
    resourceId: (effectiveWithAudio ? variants.withAudioId : variants.withoutAudioId) ?? undefined,
    withAudio: effectiveWithAudio,
    audioSwitchEnabled
  }
}

/** 面板一行。 */
export interface VideoPanelRow {
  /** 行类型。 */
  kind: VideoPanelRowKind
  /** 行标签的 i18n 键。 */
  labelKey: string
  /** 该行档位，顺序沿用 content 的生成顺序（`Best` 在最前）。 */
  options: VideoPanelOption[]
}

/** 缓冲区里检测到的一个视频及其全部资源。 */
export interface DetectedVideo {
  /** Vimeo videoId（资源 messageId）。 */
  videoId: string
  /** 该视频的全部资源。 */
  resources: MediaResource[]
}

/**
 * 把缓存资源按 videoId 分成检测到的视频列表。
 *
 * 缓存按 videoId 分组写入：播放页是单视频快照，聚合页回退按捕获先后逐视频并入。分组键
 * 取 `messageId`（= Vimeo videoId），组序沿用资源顺序，选择器直接按此顺序展示，不在
 * popup 层重排。展示数据（标题/封面/时长/档位）一律从各组资源快照派生。
 */
export function groupDetectedVideos(resources: readonly MediaResource[]): DetectedVideo[] {
  const groups = new Map<string, MediaResource[]>()
  for (const resource of resources) {
    const group = groups.get(resource.messageId)
    if (group) {
      group.push(resource)
      continue
    }
    groups.set(resource.messageId, [resource])
  }

  return Array.from(groups, ([videoId, groupResources]) => ({ videoId, resources: groupResources }))
}

/** 把当前视频资源归成四行；没有档位的行保留空列表，由 UI 展示禁用态。 */
export function buildVideoPanelRows(
  resources: readonly MediaResource[],
  translate: VimeoLabelTranslator
): VideoPanelRow[] {
  return VIDEO_PANEL_ROW_KINDS.map(kind => ({
    kind,
    labelKey: ROW_LABEL_KEYS[kind],
    options:
      kind === 'video'
        ? buildVideoOptions(resources, translate)
        : resources
            .filter(resource => resource.type === ROW_RESOURCE_TYPES[kind])
            .map(resource => ({ id: resource.id, label: buildOptionLabel(resource, translate) }))
  }))
}

/** 归并中的 Video 画质档位：代表资源 + 另一个音轨变体。 */
interface VideoQualityEntry {
  /** 代表资源：有音轨变体优先；只有纯视频交付时就是那条无音轨资源。 */
  resource: MediaResource
  /** 代表资源是否带音轨，即 descriptor 是否带 `audioTrackId`。 */
  withAudio: boolean
  /** 无音轨变体资源；该档位没有纯视频交付时缺省。 */
  noAudioResource?: MediaResource
}

/**
 * 构造 Video 行的下拉档位。
 *
 * 身份规则不在这里重写：`dash:{trackId}` 与 `dash:{trackId}:no-audio` 仍是两个独立资源、两个
 * 独立 ID，这里只把同一条 video track 的两个变体并成一条下拉项，由音轨开关二选一。有无音轨的
 * 语义真值是 descriptor 的 `audioTrackId` 有无，归并键取 descriptor 的 `videoTrackId`，两处都
 * 读结构化字段，不解析 ID 后缀。
 *
 * `Best` 单独成项：它 spread 了被选中的选项，也带 `videoTrackId`，按 track 归并会把它并回它
 * 派生自的那条 track、从下拉里消失（判定口径与 `getVimeoResourceChoice` 一致）。
 */
function buildVideoOptions(
  resources: readonly MediaResource[],
  translate: VimeoLabelTranslator
): VideoPanelOption[] {
  /** 一条 video track 一条档位，顺序沿用 content 的画质降序。 */
  const entries: VideoQualityEntry[] = []
  const entriesByTrack = new Map<string, VideoQualityEntry>()
  let best: VideoQualityEntry | null = null

  for (const resource of resources) {
    if (resource.type !== RESOURCE_TYPES.VIDEO) {
      continue
    }

    const descriptor = decodeVimeoSourceDescriptor(resource.documentId)
    const withAudio = descriptor?.audioTrackId !== undefined

    if (descriptor?.optionId === 'best') {
      best = { resource, withAudio }
      continue
    }

    // progressive / HLS 直链自带音轨、没有第二份纯视频交付，没有 `videoTrackId` 可归并。
    const trackId = descriptor?.delivery === 'dash' ? descriptor.videoTrackId : undefined
    if (!trackId) {
      entries.push({ resource, withAudio: true })
      continue
    }

    const entry = entriesByTrack.get(trackId)
    if (!entry) {
      const created: VideoQualityEntry = { resource, withAudio }
      entriesByTrack.set(trackId, created)
      entries.push(created)
      continue
    }

    // 同一条 track 的第二个变体（`createDashVideoOptions` 每条 track 最多产出两条）。
    if (withAudio) {
      if (!entry.withAudio) {
        entry.noAudioResource = entry.resource
      }
      entry.resource = resource
      entry.withAudio = true
    } else {
      entry.noAudioResource = resource
    }
  }

  const options = entries.map(entry => toVideoOption(entry, translate))
  if (!best) {
    return options
  }

  const bestOption = toVideoOption(best, translate)
  if (best.withAudio) {
    // `Best` 不存在 `best:no-audio` 资源：无音轨侧落到最高画质的纯视频档（`entries` 顺序即画质
    // 降序），标签随之换成那条资源的标签，界面不显示一个下不到的尺寸。全场都没有纯视频交付时
    // （`Best` 来自 progressive/HLS）保持 null，开关锁在「有音轨」而不是产出一个假 ID。
    const fallback = entries.find(entry => entry.noAudioResource)?.noAudioResource
    bestOption.audioVariants = {
      withAudioId: bestOption.id,
      withoutAudioId: fallback?.id ?? null
    }
    if (fallback) {
      bestOption.noAudioLabel = buildOptionLabel(fallback, translate)
    }
  }

  options.unshift(bestOption)
  return options
}

/** 把一条已归并的画质转成下拉项：代表资源定 ID 与标签，无音轨变体定切换后的标签。 */
function toVideoOption(
  entry: VideoQualityEntry,
  translate: VimeoLabelTranslator
): VideoPanelOption {
  const noAudio = entry.noAudioResource
  return {
    id: entry.resource.id,
    label: buildOptionLabel(entry.resource, translate),
    audioVariants: {
      withAudioId: entry.withAudio ? entry.resource.id : null,
      withoutAudioId: entry.withAudio ? (noAudio?.id ?? null) : entry.resource.id
    },
    ...(noAudio ? { noAudioLabel: buildOptionLabel(noAudio, translate) } : {})
  }
}

/**
 * 档位标签：站点标签 + 已知文件大小。
 *
 * 大小是「数字 + 单位」的技术标识，和 `1080p HD`、`128 kbps` 同类，不进词条表；只有拿到
 * 真实字节数（progressive 的 `size`、DASH track 的 init + segment 字节和）才渲染后缀，
 * 拿不到时保持原标签，不用码率估算顶替。
 */
function buildOptionLabel(resource: MediaResource, translate: VimeoLabelTranslator): string {
  const label = getVimeoResourceLabel(resource, translate)
  return resource.size === undefined ? label : `${label} · ${formatDownloadBytes(resource.size)}`
}

/** 信息区标题：优先站点解析出的标题，缺失时退回文件名或资源 ID。 */
export function resolveVideoTitle(resources: readonly MediaResource[]): string {
  const titled = resources.find(resource => resource.title)
  return titled?.title ?? resources[0]?.filename ?? resources[0]?.id ?? ''
}

/** 信息区作者：站点没有给出作者时返回 undefined，由 UI 整行不渲染。 */
export function resolveVideoAuthor(resources: readonly MediaResource[]): string | undefined {
  return resources.find(resource => resource.author)?.author
}

/** 信息区时长（秒）：站点没有给出时长时返回 undefined，由 UI 整行不渲染。 */
export function resolveVideoDuration(resources: readonly MediaResource[]): number | undefined {
  return resources.find(resource => resource.duration !== undefined)?.duration
}

/** 信息区封面：封面行资源的图片地址，没有封面档位时返回 undefined。 */
export function resolvePosterUrl(resources: readonly MediaResource[]): string | undefined {
  const cover = resources.find(resource => resource.type === RESOURCE_TYPES.IMAGE)
  return cover?.thumbnail ?? cover?.url
}
