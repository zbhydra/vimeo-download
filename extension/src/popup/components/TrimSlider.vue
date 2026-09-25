<!--
  时间裁剪双滑杆（自研，无 UI 库）。
  双 handle 各自可聚焦（role="slider"）：方向键 1s 步进、Shift 10s、Home/End 跳到该 handle 的
  边界；拖拽/点按轨道把 pointer 位置换算成秒数上报。起点不越过终点、两端不越出 `[0, max]`，
  交叉与越界都在交互层钳制，父组件状态恒为合法区间端点。刻度与读屏值沿用 `formatMediaDuration`。
  区间数值由父组件持有（与裁剪数字输入双向绑定同一状态），组件只上报交互产生的钳制结果。
-->
<template>
  <div class="trim-slider" :class="{ 'trim-slider-disabled': effectiveDisabled }">
    <div ref="trackRef" class="trim-track" @pointerdown="handleTrackPointerdown">
      <div class="trim-fill" :style="fillStyle" aria-hidden="true"></div>
      <div
        class="trim-handle trim-handle-start"
        role="slider"
        tabindex="0"
        aria-orientation="horizontal"
        :aria-valuemin="0"
        :aria-valuemax="max"
        :aria-valuenow="displayStart"
        :aria-valuetext="valueText(displayStart)"
        :aria-label="startLabel"
        :aria-disabled="effectiveDisabled"
        @keydown="handleKeydown('start', $event)"
        @pointerdown.stop.prevent="handleHandlePointerdown('start', $event)"
      ></div>
      <div
        class="trim-handle trim-handle-end"
        role="slider"
        tabindex="0"
        aria-orientation="horizontal"
        :aria-valuemin="0"
        :aria-valuemax="max"
        :aria-valuenow="displayEnd"
        :aria-valuetext="valueText(displayEnd)"
        :aria-label="endLabel"
        :aria-disabled="effectiveDisabled"
        @keydown="handleKeydown('end', $event)"
        @pointerdown.stop.prevent="handleHandlePointerdown('end', $event)"
      ></div>
    </div>
    <!-- 两端刻度是纯展示（读屏值走 handle 的 aria-valuetext），不进可访问树 -->
    <div class="trim-ticks" aria-hidden="true">
      <span class="trim-tick">{{ formatMediaDuration(0) }}</span>
      <span class="trim-tick">{{ formatMediaDuration(max) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { DESIGN_TOKENS } from '@/core/constants/design'
import { formatMediaDuration } from '@/core/utils/downloadStatus'
import { clipSecondsFromRatio, snapClipSeconds, stepClipSeconds } from '../utils/trimSlider'

/** 滑杆上一个可交互 handle 的身份。 */
type TrimHandle = 'start' | 'end'

const props = defineProps<{
  /** 区间起点（秒）；父组件已按 0.1s 粒度解析，空输入由父组件落到默认端点。 */
  start: number
  /** 区间终点（秒）。 */
  end: number
  /** 时长上限（秒）；≤0 表示媒体时长未知，滑杆禁用。 */
  max: number
  /** 父组件给定的禁用态（当前档位不支持裁剪）。 */
  disabled: boolean
  /** 起点 handle 的可访问名称。 */
  startLabel: string
  /** 终点 handle 的可访问名称。 */
  endLabel: string
}>()

const emit = defineEmits<{
  'update:start': [seconds: number]
  'update:end': [seconds: number]
}>()

const trackRef = ref<HTMLElement | null>(null)

/** 时长未知（max ≤ 0）时没有可表达的区间，与「档位不可裁剪」同视为禁用。 */
const effectiveDisabled = computed(() => props.disabled || props.max <= 0)

/**
 * 拖拽中的 handle 及其最新值。
 *
 * 拖拽期间展示值取这里的值而不是回流的 props，避免父组件更新周期带来的回弹；抬起后 props
 * 已经与上报值一致，交还 props 即是同一数值。
 */
const dragState = ref<{ handle: TrimHandle; value: number } | null>(null)

/** 展示值统一按 0.1s 钳制；空输入的默认端点（0 / max）由父组件在绑定处兜底。 */
const displayStart = computed(() =>
  dragState.value?.handle === 'start'
    ? dragState.value.value
    : snapClipSeconds(props.start, props.max)
)
const displayEnd = computed(() =>
  dragState.value?.handle === 'end' ? dragState.value.value : snapClipSeconds(props.end, props.max)
)

/** 起点钳在终点之内、终点钳在起点之内；拖拽与键盘共用这一交叉语义。 */
const startBounds = computed(() => ({ min: 0, max: displayEnd.value }))
const endBounds = computed(() => ({ min: displayStart.value, max: props.max }))

/** 秒数在轨道上的百分比位置；max 为 0 时恒为 0（整杆禁用，不留 NaN 样式）。 */
function ratioOf(seconds: number): number {
  return props.max > 0 ? (seconds / props.max) * 100 : 0
}

const startRatio = computed(() => ratioOf(displayStart.value))
const endRatio = computed(() => ratioOf(displayEnd.value))

const fillStyle = computed(() => ({
  left: `${startRatio.value}%`,
  width: `${Math.max(endRatio.value - startRatio.value, 0)}%`
}))

/** 读屏值用与刻度一致的人读时长；max 为 0 时整杆禁用，值文本回落 0。 */
function valueText(seconds: number): string {
  return formatMediaDuration(Math.max(seconds, 0))
}

/** 轨道 pointer 事件换算秒数；happy-dom 等无布局环境宽度为 0，按 0 处理即可。 */
function secondsFromPointer(event: PointerEvent): number {
  const rect = trackRef.value?.getBoundingClientRect()
  const width = rect?.width ?? 0
  const left = rect?.left ?? 0
  const ratio = width > 0 ? (event.clientX - left) / width : 0
  return clipSecondsFromRatio(ratio, props.max)
}

/** 点按轨道：把离点击位置最近的 handle 拨过去并接管后续拖拽，这是双滑杆的标准轨道交互。 */
function handleTrackPointerdown(event: PointerEvent): void {
  // 只响应主键：右键按下会先误移 handle 再弹 contextmenu，副键一律忽略
  if (event.button !== 0) {
    return
  }
  if (effectiveDisabled.value) {
    return
  }
  const seconds = secondsFromPointer(event)
  const startDistance = Math.abs(seconds - displayStart.value)
  const endDistance = Math.abs(seconds - displayEnd.value)
  const handle: TrimHandle = startDistance <= endDistance ? 'start' : 'end'
  beginDrag(handle, event)
}

function handleHandlePointerdown(handle: TrimHandle, event: PointerEvent): void {
  // 与轨道同语义：非主键不进入拖拽，避免右键误移 handle
  if (event.button !== 0) {
    return
  }
  if (effectiveDisabled.value) {
    return
  }
  beginDrag(handle, event)
}

/** 接管窗口级 pointermove/pointerup：拖出轨道与 handle 命中区域后拖拽仍持续。 */
function beginDrag(handle: TrimHandle, event: PointerEvent): void {
  event.preventDefault()
  applyDrag(handle, event)
  window.addEventListener('pointermove', handleWindowPointermove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function handleWindowPointermove(event: PointerEvent): void {
  if (!dragState.value) {
    return
  }
  applyDrag(dragState.value.handle, event)
}

function applyDrag(handle: TrimHandle, event: PointerEvent): void {
  const seconds = secondsFromPointer(event)
  const bounds = handle === 'start' ? startBounds.value : endBounds.value
  const clamped = snapClipSeconds(Math.max(Math.min(seconds, bounds.max), bounds.min), props.max)
  dragState.value = { handle, value: clamped }
  if (handle === 'start') {
    emit('update:start', clamped)
  } else {
    emit('update:end', clamped)
  }
}

function endDrag(): void {
  dragState.value = null
  window.removeEventListener('pointermove', handleWindowPointermove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

onBeforeUnmount(endDrag)

/**
 * 键盘步进：方向键 ±1s，Shift ±10s，Home/End 跳到该 handle 各自的边界
 * （起点 [0, 终点]、终点 [起点, max]）。
 */
function handleKeydown(handle: TrimHandle, event: KeyboardEvent): void {
  if (effectiveDisabled.value) {
    return
  }

  const bounds = handle === 'start' ? startBounds.value : endBounds.value
  const current = handle === 'start' ? displayStart.value : displayEnd.value
  let next: number | null = null

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = stepClipSeconds(current, 1, event.shiftKey, bounds.max)
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      next = stepClipSeconds(current, -1, event.shiftKey, bounds.max)
      break
    case 'Home':
      next = snapClipSeconds(bounds.min, props.max)
      break
    case 'End':
      next = snapClipSeconds(bounds.max, props.max)
      break
    default:
      return
  }

  // 下界只影响终点 handle（钳在起点之上）；步进函数本身只钳上界，这里补齐下界。
  const bounded = Math.max(next, bounds.min)
  if (bounded === current) {
    return
  }
  event.preventDefault()
  if (handle === 'start') {
    emit('update:start', bounded)
  } else {
    emit('update:end', bounded)
  }
}
</script>

<style scoped>
.trim-slider {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 轨道：禁用走 design.md 的 gray-100 填充，正常态 gray-200 */
.trim-track {
  position: relative;
  height: 4px;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_FULL');
  background: v-bind('DESIGN_TOKENS.GRAY_200');
  /* 触屏拖拽不让页面滚动接管 */
  touch-action: none;
}

.trim-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_FULL');
  background: v-bind('DESIGN_TOKENS.GRAY_1000');
}

/* handle：白底黑边圆点，::before 扩大命中区域到 24px 而不放大视觉尺寸 */
.trim-handle {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border: 2px solid v-bind('DESIGN_TOKENS.GRAY_1000');
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_FULL');
  background: v-bind('DESIGN_TOKENS.BG_100');
  transform: translate(-50%, -50%);
  cursor: grab;
}

.trim-handle::before {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_FULL');
}

.trim-handle-start {
  left: v-bind('`${startRatio}%`');
}

.trim-handle-end {
  left: v-bind('`${endRatio}%`');
}

.trim-handle:active {
  cursor: grabbing;
}

.trim-handle:focus-visible {
  outline: none;
  box-shadow: v-bind('DESIGN_TOKENS.FOCUS_RING');
}

/* 禁用：填充与描边退灰、光标 not-allowed，可访问性由 aria-disabled 通告 */
.trim-slider-disabled .trim-track {
  background: v-bind('DESIGN_TOKENS.GRAY_100');
}

.trim-slider-disabled .trim-fill {
  background: v-bind('DESIGN_TOKENS.GRAY_300');
}

.trim-slider-disabled .trim-handle {
  border-color: v-bind('DESIGN_TOKENS.GRAY_300');
  cursor: not-allowed;
}

/* 两端刻度：与信息卡副行同级的 12px 次级文本，数字对齐 */
.trim-ticks {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trim-tick {
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  color: v-bind('DESIGN_TOKENS.GRAY_900');
  font-variant-numeric: tabular-nums;
}
</style>
