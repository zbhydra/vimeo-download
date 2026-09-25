<!--
  多视频选择器（自定义下拉）。
  原生 `<select>` 无法在选项里渲染封面，这里用「触发按钮 + listbox 浮层」实现，列表项带小
  封面与标题。可达性：焦点始终留在触发按钮上，高亮项经 `aria-activedescendant` 通告；按钮上
  ↑/↓ 打开并移动高亮、Home/End 跳两端、Enter/Space 选中高亮项、Esc/Tab 关闭；点击浮层外
  任意处关闭。
-->
<template>
  <div ref="rootRef" class="video-selector">
    <button
      type="button"
      class="selector-trigger"
      role="combobox"
      :aria-label="label"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listboxId : undefined"
      :aria-activedescendant="open ? optionId(activeIndex) : undefined"
      @click="toggle"
      @keydown="handleTriggerKeydown"
    >
      <VideoThumb
        class="trigger-thumb"
        :src="selected?.thumbnailUrl"
        :placeholder-size="IconSize.XS"
      />
      <span class="trigger-title">{{ selected?.title }}</span>
      <Icon
        class="trigger-chevron"
        :class="{ 'trigger-chevron-open': open }"
        :name="IconName.CHEVRON_DOWN"
        :size="IconSize.XS"
      />
    </button>

    <ul v-if="open" :id="listboxId" class="selector-listbox" role="listbox" :aria-label="label">
      <li
        v-for="(video, index) in videos"
        :id="optionId(index)"
        :key="video.videoId"
        class="selector-option"
        :class="{ 'selector-option-active': index === activeIndex }"
        role="option"
        :aria-selected="video.videoId === modelValue"
        @pointerenter="activeIndex = index"
        @click="select(index)"
      >
        <VideoThumb
          class="option-thumb"
          :src="video.thumbnailUrl"
          :placeholder-size="IconSize.XS"
        />
        <span class="option-title">{{ video.title }}</span>
        <Icon
          v-if="video.videoId === modelValue"
          class="option-check"
          :name="IconName.CHECK"
          :size="IconSize.XS"
        />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { DESIGN_TOKENS } from '@/core/constants/design'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import VideoThumb from './VideoThumb.vue'

/** 列表项与触发按钮共用的选择器条目；由面板从 `DetectedVideo` 投影，顺序即展示顺序。 */
interface VideoSelectorItem {
  videoId: string
  title: string
  thumbnailUrl?: string
}

const props = defineProps<{
  /** 可选视频列表。 */
  videos: VideoSelectorItem[]
  /** 当前选中的 videoId（v-model）。 */
  modelValue: string | null
  /** 触发按钮与列表的可访问名称。 */
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [videoId: string]
}>()

/** 实例级 id（Vue 3.5 `useId`），供 `aria-controls` / `aria-activedescendant` 关联浮层。 */
const listboxId = `vdl-video-listbox-${useId()}`
const optionId = (index: number): string => `${listboxId}-option-${index}`

const rootRef = ref<HTMLElement | null>(null)
const open = ref(false)

/** 键盘高亮项；打开时落在当前选中项，浮层内随指针/方向键移动。 */
const activeIndex = ref(0)

const selectedIndex = computed(() =>
  props.videos.findIndex(video => video.videoId === props.modelValue)
)
const selected = computed(() => props.videos[selectedIndex.value])

watch(open, async isOpen => {
  if (!isOpen) {
    removeOutsideListener()
    return
  }
  activeIndex.value = Math.max(selectedIndex.value, 0)
  addOutsideListener()
  await nextTick()
  scrollActiveIntoView()
})

onBeforeUnmount(removeOutsideListener)

/** 浮层打开期间监听浮层外的按下，点击外部即关闭（与 Esc 等价的鼠标路径）。 */
function handleDocumentPointerdown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && !rootRef.value?.contains(target)) {
    close()
  }
}

function addOutsideListener(): void {
  document.addEventListener('pointerdown', handleDocumentPointerdown)
}

function removeOutsideListener(): void {
  document.removeEventListener('pointerdown', handleDocumentPointerdown)
}

function toggle(): void {
  if (open.value) {
    close()
  } else {
    open.value = true
  }
}

function close(): void {
  open.value = false
}

/** 选中高亮项并关闭；重复选中当前视频只关闭，不重复上报。 */
function select(index: number): void {
  const video = props.videos[index]
  if (!video) {
    return
  }
  if (video.videoId !== props.modelValue) {
    emit('update:modelValue', video.videoId)
  }
  close()
}

/** 方向键移动高亮并跟随滚动。 */
function moveActive(step: 1 | -1): void {
  const total = props.videos.length
  if (total === 0) {
    return
  }
  activeIndex.value = (activeIndex.value + step + total) % total
  scrollActiveIntoView()
}

function scrollActiveIntoView(): void {
  document.getElementById(optionId(activeIndex.value))?.scrollIntoView?.({ block: 'nearest' })
}

/**
 * 键盘交互全部挂在触发按钮上（焦点不移入浮层）。
 *
 * Enter/Space 在浮层打开时被 `preventDefault`：按钮的原生激活行为（keydown Enter 即触发
 * click）会让「选中高亮项」与「开关浮层」叠在一起，这里手动接管。
 */
function handleTriggerKeydown(event: KeyboardEvent): void {
  if (!open.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      open.value = true
    }
    return
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveActive(-1)
      break
    case 'Home':
      event.preventDefault()
      activeIndex.value = 0
      scrollActiveIntoView()
      break
    case 'End':
      event.preventDefault()
      activeIndex.value = Math.max(props.videos.length - 1, 0)
      scrollActiveIntoView()
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      select(activeIndex.value)
      break
    case 'Escape':
      event.preventDefault()
      close()
      break
    case 'Tab':
      close()
      break
  }
}
</script>

<style scoped>
.video-selector {
  position: relative;
}

.selector-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  padding: 0 10px 0 4px;
  border: 1px solid v-bind('DESIGN_TOKENS.GRAY_ALPHA_400');
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
  background: v-bind('DESIGN_TOKENS.BG_100');
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.selector-trigger:hover {
  border-color: v-bind('DESIGN_TOKENS.GRAY_ALPHA_500');
}

.trigger-thumb {
  width: 50px;
  height: 28px;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
}

.trigger-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: v-bind('DESIGN_TOKENS.FS_13');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  font-weight: v-bind('DESIGN_TOKENS.FW_500');
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
}

.trigger-chevron {
  flex-shrink: 0;
  color: v-bind('DESIGN_TOKENS.GRAY_900');
  transition: transform 0.15s ease;
}

.trigger-chevron-open {
  transform: rotate(180deg);
}

.selector-listbox {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px;
  list-style: none;
  max-height: 288px;
  overflow-y: auto;
  background: v-bind('DESIGN_TOKENS.BG_100');
  border: 1px solid v-bind('DESIGN_TOKENS.GRAY_ALPHA_400');
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_MD');
  box-shadow: v-bind('DESIGN_TOKENS.SHADOW_POPOVER');
}

.selector-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
  cursor: pointer;
}

.selector-option-active {
  background: v-bind('DESIGN_TOKENS.GRAY_100');
}

.option-thumb {
  width: 64px;
  height: 36px;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
}

.option-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: v-bind('DESIGN_TOKENS.FS_13');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
}

.option-check {
  flex-shrink: 0;
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
}

.selector-trigger:focus-visible {
  outline: none;
  box-shadow: v-bind('DESIGN_TOKENS.FOCUS_RING');
}

@media (prefers-reduced-motion: reduce) {
  .trigger-chevron {
    transition: none;
  }
}
</style>
