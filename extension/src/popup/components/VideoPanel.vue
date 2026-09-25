<!--
  Popup 视频面板。
  主区四态互斥：扫描中 → 未连接引导（当前页不是 Vimeo 且无已打开的站点标签页）→ 空状态
  （页面没有可下载视频）→ [多视频选择器（仅聚合页检测到多个视频时）] + 视频信息卡 + 四行档位
  （Video / Audio / Subtitle / Image）+ 时间裁剪 + 保存位置。
  视觉走 design.md（Geist 亮色）token（见 `core/constants/design.ts`）：卡片化布局 + 浮层
  选择器，交互逻辑与重构前一致。
-->
<template>
  <main class="video-panel" :aria-busy="store.loading">
    <!-- 未连接态由下面的引导态承担，这里不再重复渲染它的未连接文案 -->
    <div
      v-if="store.error && !store.loading && store.hasTargetTab"
      class="error-message"
      role="alert"
    >
      {{ store.error }}
    </div>

    <!-- 扫描中 -->
    <div v-if="store.loading" class="panel-state" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <span class="state-text">{{ t(I18N_KEYS.VIDEO_PANEL.SCANNING) }}</span>
    </div>

    <!-- 引导态：打开 Popup 时当前页不是 Vimeo，也没有已打开的 Vimeo 标签页 -->
    <div v-else-if="!store.hasTargetTab" class="panel-state">
      <div class="empty-icon" aria-hidden="true">
        <Icon :name="IconName.ARROW_RIGHT_ON_RECTANGLE" :size="IconSize.XL" />
      </div>
      <div class="state-text">{{ t(I18N_KEYS.VIDEO_PANEL.NOT_ON_VIMEO) }}</div>
      <button type="button" class="state-button" @click="$emit('openSite')">
        {{ t(I18N_KEYS.VIDEO_PANEL.OPEN_VIMEO) }}
      </button>
    </div>

    <!-- 空状态：当前页面没有可下载视频（零资源组不算检测到，见 buildDetectedVideos） -->
    <div v-else-if="videos.length === 0" class="panel-state">
      <div class="empty-icon" aria-hidden="true">
        <Icon :name="IconName.INBOX" :size="IconSize.XL" />
      </div>
      <div class="state-text">{{ t(I18N_KEYS.VIDEO_PANEL.EMPTY) }}</div>
      <button type="button" class="state-button" @click="$emit('refresh')">
        {{ t(I18N_KEYS.VIDEO_PANEL.RETRY) }}
      </button>
    </div>

    <div v-else class="panel-body">
      <!--
        多视频选择器：聚合页回退检测到多个视频时先选视频，信息卡与四行档位随选择联动；
        播放页只有一个视频，选择器不渲染，布局与单视频页面完全一致。
      -->
      <section v-if="videos.length > 1" class="panel-card video-switcher">
        <p class="video-switcher-count">
          {{ t(I18N_KEYS.VIDEO_PANEL.DETECTED_COUNT, { count: videos.length }) }}
        </p>
        <VideoSelector
          v-model="selectedVideoId"
          :videos="videos"
          :label="t(I18N_KEYS.VIDEO_PANEL.VIDEO_SWITCHER_LABEL)"
        />
      </section>

      <!-- 视频信息卡：封面 + 标题 + 作者/时长 + 当前档位 -->
      <section class="panel-card video-info">
        <VideoThumb class="poster" :src="selectedVideo?.thumbnailUrl" />
        <div class="video-info-text">
          <h3 class="video-title" :title="videoTitle">{{ videoTitle }}</h3>
          <!-- 作者与时长是站点元数据，缺失时对应片段不渲染，整行只有内容才出现 -->
          <p v-if="videoAuthor || videoDurationText" class="video-byline">
            <span v-if="videoAuthor" class="video-author">{{ videoAuthor }}</span>
            <span
              v-if="videoAuthor && videoDurationText"
              class="byline-separator"
              aria-hidden="true"
              >·</span
            >
            <span v-if="videoDurationText" class="video-duration">{{ videoDurationText }}</span>
          </p>
          <p class="video-meta">{{ videoMeta }}</p>
        </div>
      </section>

      <!-- 四行下载选项 -->
      <section class="panel-card option-rows">
        <div v-for="row in rows" :key="row.kind" class="option-row" :data-row="row.kind">
          <span class="row-label">{{ t(row.labelKey) }}</span>

          <select
            v-if="row.kind !== 'image'"
            class="row-select"
            :value="selectedIds[row.kind] ?? ''"
            :disabled="row.options.length === 0"
            :aria-label="t(row.labelKey)"
            @change="handleSelect(row.kind, $event)"
          >
            <option v-if="row.options.length === 0" value="">
              {{ t(I18N_KEYS.VIDEO_PANEL.UNAVAILABLE) }}
            </option>
            <option v-for="option in row.options" :key="option.id" :value="option.id">
              {{ optionDisplayLabel(option) }}
            </option>
          </select>
          <span v-else class="row-select row-select-static">{{ COVER_FORMAT_LABEL }}</span>

          <!--
            音轨开关：与画质下拉正交，只有 Video 行有。实际下载的资源由「下拉画质 × 开关」共同
            决定（见 `resolveVideoSelection`）；当前画质缺少某一侧的变体时锁在存在的一侧并禁用。
          -->
          <button
            v-if="row.kind === 'video'"
            type="button"
            class="audio-switch"
            role="switch"
            :aria-checked="videoSelection.withAudio"
            :aria-label="t(I18N_KEYS.VIDEO_PANEL.AUDIO_SWITCH_LABEL)"
            :disabled="!videoSelection.audioSwitchEnabled"
            @click="handleAudioToggle"
          >
            <span class="audio-switch-track" aria-hidden="true"></span>
            <!-- 状态文字是 `aria-checked` 的可见副本，不重复进可访问名 -->
            <span class="audio-switch-state" aria-hidden="true">
              {{
                t(
                  videoSelection.withAudio
                    ? I18N_KEYS.VIDEO_PANEL.AUDIO_SWITCH_WITH_AUDIO
                    : I18N_KEYS.VIDEO_PANEL.AUDIO_SWITCH_WITHOUT_AUDIO
                )
              }}
            </span>
          </button>

          <button
            type="button"
            class="row-download"
            :disabled="!selectedIds[row.kind]"
            :title="downloadTitle(row)"
            :aria-label="downloadTitle(row)"
            @click="handleDownload(row)"
          >
            <Icon :name="IconName.ARROW_DOWN" :size="IconSize.SM" :color="DESIGN_TOKENS.BG_100" />
          </button>
        </div>
      </section>

      <!-- 时间裁剪 -->
      <section class="panel-card clip-section">
        <span class="row-label">{{ t(I18N_KEYS.VIDEO_PANEL.CLIP_TITLE) }}</span>
        <div class="clip-inputs">
          <label class="clip-field">
            <span class="clip-field-label">{{ t(I18N_KEYS.VIDEO_PANEL.CLIP_START) }}</span>
            <input
              v-model="clipStart"
              class="clip-input"
              type="number"
              min="0"
              step="0.1"
              inputmode="decimal"
              :disabled="!clipAvailable"
            />
          </label>
          <label class="clip-field">
            <span class="clip-field-label">{{ t(I18N_KEYS.VIDEO_PANEL.CLIP_END) }}</span>
            <input
              v-model="clipEnd"
              class="clip-input"
              type="number"
              min="0"
              step="0.1"
              inputmode="decimal"
              :disabled="!clipAvailable"
            />
          </label>
        </div>
        <p class="clip-hint">
          {{
            clipAvailable
              ? t(I18N_KEYS.VIDEO_PANEL.CLIP_HINT)
              : t(I18N_KEYS.VIDEO_PANEL.CLIP_UNSUPPORTED)
          }}
        </p>
      </section>

      <!-- 保存位置：只存用户填写的相对子目录，归一化与路径拼接由 background 在下载边界完成 -->
      <section class="panel-card save-path-section">
        <label class="save-path-field">
          <span class="row-label">{{ t(I18N_KEYS.VIDEO_PANEL.SAVE_PATH_LABEL) }}</span>
          <input
            v-model="savePath"
            class="save-path-input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :placeholder="t(I18N_KEYS.VIDEO_PANEL.SAVE_PATH_PLACEHOLDER)"
            @change="persistSavePath"
          />
        </label>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { I18N_KEYS } from '@/core/constants/i18n'
import { DESIGN_TOKENS } from '@/core/constants/design'
import { DEFAULT_DOWNLOAD_PATH, SettingsManager } from '@/core/storage/settings'
import type { MediaResource } from '@/core/types'
import { formatMediaDuration } from '@/core/utils/downloadStatus'
import { logger } from '@/core/utils/logger'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { applyVimeoTimeRange, supportsVimeoTimeRange } from '@/sites/vimeo/media'
import { parseVimeoTimeRange, type VimeoTimeRange } from '@/sites/vimeo/shared'
import { useResourceStore } from '../stores/resourceStore'
import VideoSelector from './VideoSelector.vue'
import VideoThumb from './VideoThumb.vue'
import {
  buildVideoPanelRows,
  COVER_FORMAT_LABEL,
  buildDetectedVideos,
  resolveVideoSelection,
  type VideoPanelOption,
  type VideoPanelRow,
  type VideoPanelRowKind
} from '../utils/videoPanel'

const { t } = useI18n()
const store = useResourceStore()

const emit = defineEmits<{
  download: [resource: MediaResource]
  refresh: []
  /** 引导态里点击「打开 Vimeo」，由外层决定切到已有站点标签页还是新建 */
  openSite: []
}>()

/** 时间裁剪输入；空串表示不裁剪。 */
const clipStart = ref('')
const clipEnd = ref('')

/**
 * 检测到的视频列表。
 *
 * 组序与展示元数据来自 content 的 `videoGroups`，资源按 messageId 对号入座；零资源组不在
 * 列表里（既不可选也不计入检测数），组元数据缺失时逐字段从资源兜底，选择器直接按此顺序
 * 展示，不在 popup 层重排。
 */
const videos = computed(() => buildDetectedVideos(store.videoGroups, store.resources))

/**
 * 多视频选择器的当前值。
 *
 * 列表变化时保留仍存在的选择（刷新不丢用户的切换），丢失或首个视频到达时回到第一项；
 * 空列表可能是刷新的中间态，保留原值待新列表到达后再校验。
 */
const selectedVideoId = ref<string | null>(null)

watch(
  videos,
  next => {
    if (next.some(video => video.videoId === selectedVideoId.value)) {
      return
    }
    if (next.length > 0) {
      selectedVideoId.value = next[0].videoId
    }
  },
  { immediate: true }
)

/** 当前展示的视频；没有可下载视频时为 null，面板呈现空状态。 */
const selectedVideo = computed(
  () =>
    videos.value.find(video => video.videoId === selectedVideoId.value) ?? videos.value[0] ?? null
)

/** 切换视频后不携带上一个视频的瞬态：裁剪输入重新开始。 */
watch(selectedVideoId, () => {
  clipStart.value = ''
  clipEnd.value = ''
})

const rows = computed(() =>
  buildVideoPanelRows(selectedVideo.value?.resources ?? [], (key, params) =>
    params ? t(key, params) : t(key)
  )
)
const resourcesById = computed(
  () => new Map((selectedVideo.value?.resources ?? []).map(resource => [resource.id, resource]))
)
const videoTitle = computed(() => selectedVideo.value?.title ?? '')
const videoAuthor = computed(() => selectedVideo.value?.author)
const videoDurationText = computed(() => {
  const duration = selectedVideo.value?.durationSeconds
  return duration === undefined ? '' : formatMediaDuration(duration)
})

/**
 * 保存位置输入框的当前值。
 *
 * 存的是下载目录下的相对子目录；设置里没有值时用默认子目录预填，让输入框显示的与实际生效
 * 的一致。合法性判定不在这里做——用户输入进入 `chrome.downloads` 的唯一入口是 background。
 */
const savePath = ref(DEFAULT_DOWNLOAD_PATH)

onMounted(async () => {
  try {
    const settings = await SettingsManager.getSettings()
    savePath.value = settings.downloadPath ?? DEFAULT_DOWNLOAD_PATH
  } catch (error) {
    logger.error('[VideoPanel] 读取保存位置失败，沿用默认子目录:', error)
  }
})

/**
 * 输入变化后写入设置；`change` 只在值真的变了时触发，不会每次按键都写存储。
 *
 * 这里只把空值回填成默认子目录（与 background 兜底同源、共用常量），非法段（`..`、`C:\x`、
 * `~/x`）的判定与丢弃全在 background 侧，输入框会原样保留用户填的这类值。
 */
async function persistSavePath(): Promise<void> {
  const downloadPath = savePath.value.trim() || DEFAULT_DOWNLOAD_PATH
  savePath.value = downloadPath
  try {
    await SettingsManager.updateSettings({ downloadPath })
  } catch (error) {
    logger.error(`[VideoPanel] 保存位置写入失败: downloadPath=${downloadPath}`, error)
  }
}

/**
 * 每行的下拉选中值；资源刷新后保留仍存在的选择，否则回到该行第一项。
 *
 * 注意 Video 行的值是「画质档位的代表 ID」而不是要下载的资源 ID：实际交付还要叠上音轨开关，
 * 取下载资源一律走 `selectedResourceId`，不要直接拿这里的值去查资源。
 */
const selectedIds = ref<Partial<Record<VideoPanelRowKind, string>>>({})

/**
 * 音轨开关的用户偏好，与下拉正交。
 *
 * 它只表达「想不想要音轨」，当前画质缺某一侧变体时由 `resolveVideoSelection` 锁到存在的一侧，
 * 偏好本身不被改写——切回有得选的画质时仍然生效。只活在组件内，不写存储。
 */
const videoWithAudio = ref(true)

/** Video 行当前选中的画质档位。 */
const selectedVideoOption = computed(() =>
  rows.value
    .find(row => row.kind === 'video')
    ?.options.find(option => option.id === selectedIds.value.video)
)

/** Video 行的实际选择：画质档位 × 音轨开关。 */
const videoSelection = computed(() =>
  resolveVideoSelection(selectedVideoOption.value, videoWithAudio.value)
)

watch(
  rows,
  nextRows => {
    const next: Partial<Record<VideoPanelRowKind, string>> = {}
    for (const row of nextRows) {
      const kept = row.options.find(option => option.id === selectedIds.value[row.kind])
      const first = row.options[0]
      if (kept) {
        next[row.kind] = kept.id
      } else if (first) {
        next[row.kind] = first.id
      }
    }
    selectedIds.value = next
  },
  { immediate: true }
)

/** 信息卡副标题：当前档位标签，文件大小已并入档位标签（见 `buildVideoPanelRows`）。 */
const videoMeta = computed(() => {
  const option = selectedOptionOf('video')
  return option ? optionDisplayLabel(option) : ''
})

/** 时间裁剪可用性由视频行决定：它是面板的主下载项。 */
const clipAvailable = computed(() => {
  const resource = resourcesById.value.get(selectedResourceId('video') ?? '')
  return resource !== undefined && supportsVimeoTimeRange(resource)
})

/** 生效的裁剪区间；未填、非法或当前档位不支持裁剪时为 null（整片下载）。 */
const activeClipRange = computed<VimeoTimeRange | null>(() => {
  if (!clipAvailable.value) {
    return null
  }

  return parseVimeoTimeRange({
    startSeconds: Number.parseFloat(clipStart.value),
    endSeconds: Number.parseFloat(clipEnd.value)
  })
})

/** 同步下拉选择；`<select>` 只上报字符串值，非法值直接忽略。 */
function handleSelect(kind: VideoPanelRowKind, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (rows.value.some(row => row.kind === kind && row.options.some(item => item.id === value))) {
    selectedIds.value = { ...selectedIds.value, [kind]: value }
  }
}

/** 切换音轨开关；两个变体都在时开关才可用，所以这里翻转的一定是当前生效态。 */
function handleAudioToggle(): void {
  videoWithAudio.value = !videoSelection.value.withAudio
}

/** 行内下载：下载该行当前选中的档位，区间在可裁剪档位上生效。 */
function handleDownload(row: VideoPanelRow): void {
  const resource = resourcesById.value.get(selectedResourceId(row.kind) ?? '')
  if (!resource) {
    return
  }

  emit('download', applyActiveClip(resource))
}

/**
 * 某行实际要下载的资源 ID。
 *
 * Video 行的下拉值只是画质，交付形态由音轨开关决定（同一画质的有音轨与无音轨是两个资源）；
 * 其余行的下拉值就是资源 ID。
 */
function selectedResourceId(kind: VideoPanelRowKind): string | undefined {
  return kind === 'video' ? videoSelection.value.resourceId : selectedIds.value[kind]
}

/**
 * 档位的展示标签。
 *
 * Video 行切到「无音轨」时换用无音轨变体的标签：两个变体是大小不同的文件，标签里的大小随
 * 实际交付走。下拉、信息卡副标题与行内下载按钮的可访问名都取这一个值，三处不会分叉。
 */
function optionDisplayLabel(option: VideoPanelOption): string {
  return option.audioVariants && !videoSelection.value.withAudio
    ? (option.noAudioLabel ?? option.label)
    : option.label
}

/**
 * 套用时间裁剪。
 *
 * 区间只对 DASH/HLS 生效：progressive 直链交给 Chrome 下载管理器、无法只取区间，字幕与
 * 封面也不是分片交付，这三类保持整片下载。
 */
function applyActiveClip(resource: MediaResource): MediaResource {
  const range = activeClipRange.value
  return range && supportsVimeoTimeRange(resource) ? applyVimeoTimeRange(resource, range) : resource
}

/** 取某行当前选中的档位。 */
function selectedOptionOf(kind: VideoPanelRowKind): VideoPanelOption | undefined {
  return rows.value
    .find(row => row.kind === kind)
    ?.options.find(option => option.id === selectedIds.value[kind])
}

/** 行内按钮的无障碍名称：下载 + 档位标签（Video 行按当前音轨态取标签）。 */
function downloadTitle(row: VideoPanelRow): string {
  const option = selectedOptionOf(row.kind)
  const label = option ? optionDisplayLabel(option) : t(I18N_KEYS.VIDEO_PANEL.UNAVAILABLE)
  return `${t(I18N_KEYS.RESOURCE_ITEM.DOWNLOAD)} ${label}`
}
</script>

<style scoped>
.video-panel {
  width: 100%;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: v-bind('DESIGN_TOKENS.BG_200');
}

.video-panel::-webkit-scrollbar {
  width: 6px;
}

.video-panel::-webkit-scrollbar-track {
  background: transparent;
}

.video-panel::-webkit-scrollbar-thumb {
  background: v-bind('DESIGN_TOKENS.GRAY_500');
  border-radius: 3px;
}

.video-panel::-webkit-scrollbar-thumb:hover {
  background: v-bind('DESIGN_TOKENS.GRAY_600');
}

.error-message {
  flex-shrink: 0;
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  color: v-bind('DESIGN_TOKENS.RED_900');
  background: v-bind('DESIGN_TOKENS.RED_100');
  padding: 8px 16px;
}

.panel-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 16px;
}

.state-text {
  font-size: v-bind('DESIGN_TOKENS.FS_14');
  line-height: v-bind('DESIGN_TOKENS.LH_20');
  color: v-bind('DESIGN_TOKENS.GRAY_900');
  text-align: center;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  opacity: 0.4;
  color: v-bind('DESIGN_TOKENS.GRAY_700');
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid v-bind('DESIGN_TOKENS.GRAY_200');
  border-top-color: v-bind('DESIGN_TOKENS.BLUE_700');
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.state-button {
  padding: 8px 16px;
  border: none;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
  background: v-bind('DESIGN_TOKENS.GRAY_1000');
  color: v-bind('DESIGN_TOKENS.BG_100');
  font-size: v-bind('DESIGN_TOKENS.FS_13');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  font-weight: v-bind('DESIGN_TOKENS.FW_500');
  cursor: pointer;
}

.state-button:hover {
  background: v-bind('DESIGN_TOKENS.GRAY_1000_HOVER');
}

/* 卡片化主区：底色 background-200 衬托白卡，卡间 12px 呼吸 */
.panel-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
}

.panel-card {
  background: v-bind('DESIGN_TOKENS.BG_100');
  border: 1px solid v-bind('DESIGN_TOKENS.GRAY_ALPHA_400');
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_MD');
  box-shadow: v-bind('DESIGN_TOKENS.SHADOW_CARD');
}

/* 多视频选择器：仅聚合页检测到多个视频时渲染 */
.video-switcher {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.video-switcher-count {
  margin: 0;
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  color: v-bind('DESIGN_TOKENS.GRAY_900');
}

/* 视频信息卡 */
.video-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.poster {
  width: 168px;
  height: 94px;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
}

.video-info-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.video-title {
  margin: 0;
  font-size: v-bind('DESIGN_TOKENS.FS_14');
  font-weight: v-bind('DESIGN_TOKENS.FW_600');
  line-height: v-bind('DESIGN_TOKENS.LH_20');
  letter-spacing: v-bind('DESIGN_TOKENS.TRACKING_HEADING');
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* 作者与时长合并为一条副行，超长省略而不把信息卡撑宽 */
.video-byline {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.video-author,
.video-duration,
.byline-separator {
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  color: v-bind('DESIGN_TOKENS.GRAY_900');
}

.video-author {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-duration {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.video-meta {
  margin: 0;
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  color: v-bind('DESIGN_TOKENS.GRAY_700');
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 四行下载选项 */
.option-rows {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}

/* 标签列按最长行名定宽：headless Chromium 实测 13px/500 下 ru `Изображение` 89.5px，旧的 68px 会把它省略。 */
.option-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
}

.row-label {
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  font-weight: v-bind('DESIGN_TOKENS.FW_500');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-select {
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 1px solid v-bind('DESIGN_TOKENS.GRAY_ALPHA_400');
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
  background: v-bind('DESIGN_TOKENS.BG_100');
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
  font-size: v-bind('DESIGN_TOKENS.FS_13');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  cursor: pointer;
}

.row-select:hover:not(:disabled) {
  border-color: v-bind('DESIGN_TOKENS.GRAY_ALPHA_500');
}

.row-select-static {
  display: flex;
  align-items: center;
  border-color: transparent;
  cursor: default;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-select:disabled {
  background: v-bind('DESIGN_TOKENS.GRAY_100');
  color: v-bind('DESIGN_TOKENS.GRAY_700');
  cursor: not-allowed;
}

/* Video 行多一个音轨开关列；其余行保持三列，开关不存在 */
.option-row[data-row='video'] {
  grid-template-columns: 96px minmax(0, 1fr) auto 32px;
}

.audio-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  color: v-bind('DESIGN_TOKENS.GRAY_900');
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  white-space: nowrap;
  cursor: pointer;
}

.audio-switch-track {
  position: relative;
  width: 32px;
  height: 18px;
  flex-shrink: 0;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_FULL');
  background: v-bind('DESIGN_TOKENS.GRAY_300');
  transition: background-color 0.15s ease;
}

.audio-switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_FULL');
  background: v-bind('DESIGN_TOKENS.BG_100');
  transition: transform 0.15s ease;
}

.audio-switch[aria-checked='true'] .audio-switch-track {
  background: v-bind('DESIGN_TOKENS.GRAY_1000');
}

.audio-switch[aria-checked='true'] .audio-switch-track::after {
  transform: translateX(14px);
}

/* 禁用即「没有对应交付可切」，状态由旁边的文字说明，轨道退成中性灰 */
.audio-switch:disabled {
  color: v-bind('DESIGN_TOKENS.GRAY_700');
  cursor: not-allowed;
}

/* 轨道退成中性灰，滑块仍停在生效的一侧，与旁边的状态文字一致 */
.audio-switch:disabled .audio-switch-track {
  background: v-bind('DESIGN_TOKENS.GRAY_200');
}

.row-download {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
  background: v-bind('DESIGN_TOKENS.GRAY_1000');
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.row-download:hover:not(:disabled) {
  background: v-bind('DESIGN_TOKENS.GRAY_1000_HOVER');
}

.row-download:disabled {
  background: v-bind('DESIGN_TOKENS.GRAY_200');
  cursor: not-allowed;
}

/* 时间裁剪 */
.clip-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.clip-inputs {
  display: flex;
  gap: 8px;
}

.clip-field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.clip-field-label {
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  color: v-bind('DESIGN_TOKENS.GRAY_900');
}

.clip-input {
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid v-bind('DESIGN_TOKENS.GRAY_ALPHA_400');
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
  background: v-bind('DESIGN_TOKENS.BG_100');
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
  font-size: v-bind('DESIGN_TOKENS.FS_13');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  font-variant-numeric: tabular-nums;
}

.clip-input:hover:not(:disabled) {
  border-color: v-bind('DESIGN_TOKENS.GRAY_ALPHA_500');
}

.clip-input:disabled {
  background: v-bind('DESIGN_TOKENS.GRAY_100');
  color: v-bind('DESIGN_TOKENS.GRAY_700');
  cursor: not-allowed;
}

.clip-hint {
  margin: 0;
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  color: v-bind('DESIGN_TOKENS.GRAY_900');
}

/* 保存位置 */
.save-path-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.save-path-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.save-path-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 1px solid v-bind('DESIGN_TOKENS.GRAY_ALPHA_400');
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
  background: v-bind('DESIGN_TOKENS.BG_100');
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
  font-size: v-bind('DESIGN_TOKENS.FS_13');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
}

.save-path-input:hover {
  border-color: v-bind('DESIGN_TOKENS.GRAY_ALPHA_500');
}

.state-button:focus-visible,
.row-download:focus-visible,
.row-select:focus-visible,
.audio-switch:focus-visible,
.clip-input:focus-visible,
.save-path-input:focus-visible {
  outline: none;
  box-shadow: v-bind('DESIGN_TOKENS.FOCUS_RING');
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }

  .audio-switch-track,
  .audio-switch-track::after {
    transition: none;
  }
}
</style>
