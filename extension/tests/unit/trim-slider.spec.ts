/**
 * 时间裁剪双滑杆：纯数值逻辑（钳制 / 换算 / 步进 / 文本化）与组件的键盘交互、aria 读数。
 *
 * 双向绑定的端到端路径（滑杆写回数字输入、输入编辑反映到滑杆）在 `video-panel.spec.ts` 覆盖，
 * 这里只测组件自身的交互语义。
 */

import { describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

import TrimSlider from '@/popup/components/TrimSlider.vue'
import {
  clipSecondsFromRatio,
  formatClipSecondsText,
  snapClipSeconds,
  stepClipSeconds
} from '@/popup/utils/trimSlider'

/** 滑杆默认档：全长 120s，起点 0、终点 60。 */
function mountSlider(overrides: Partial<InstanceProps> = {}): VueWrapper {
  return mount(TrimSlider, {
    props: {
      start: 0,
      end: 60,
      max: 120,
      disabled: false,
      startLabel: 'Clip start',
      endLabel: 'Clip end',
      ...overrides
    }
  })
}

/** `TrimSlider` 的 props 形状；只为挂载辅助函数的参数类型服务。 */
interface InstanceProps {
  start: number
  end: number
  max: number
  disabled: boolean
  startLabel: string
  endLabel: string
}

describe('trimSlider 纯数值逻辑', () => {
  it('snapClipSeconds 钳制到 [0, max] 并按 0.1s 取整，消除二进制尾差', () => {
    expect(snapClipSeconds(-3, 60)).toBe(0)
    expect(snapClipSeconds(70, 60)).toBe(60)
    expect(snapClipSeconds(12.44, 60)).toBe(12.4)
    expect(snapClipSeconds(12.5000000002, 60)).toBe(12.5)
  })

  it('snapClipSeconds 上限非法或输入非法时返回 0，不产生 NaN', () => {
    expect(snapClipSeconds(5, 0)).toBe(0)
    expect(snapClipSeconds(5, Number.NaN)).toBe(0)
    expect(snapClipSeconds(Number.NaN, 60)).toBe(0)
  })

  it('clipSecondsFromRatio 把轨道比例换算成秒，比例越界按 0 / 1 处理', () => {
    expect(clipSecondsFromRatio(0.5, 60)).toBe(30)
    expect(clipSecondsFromRatio(-1, 60)).toBe(0)
    expect(clipSecondsFromRatio(2, 60)).toBe(60)
    expect(clipSecondsFromRatio(Number.NaN, 60)).toBe(0)
  })

  it('stepClipSeconds 方向键 ±1s、Shift 粗调 ±10s，结果不越出上界', () => {
    expect(stepClipSeconds(10, 1, false, 60)).toBe(11)
    expect(stepClipSeconds(10, -1, false, 60)).toBe(9)
    expect(stepClipSeconds(10, 1, true, 60)).toBe(20)
    expect(stepClipSeconds(55, 1, true, 60)).toBe(60)
  })

  it('formatClipSecondsText 整数不带小数点、非整数保留一位小数、非法回落 0', () => {
    expect(formatClipSecondsText(30)).toBe('30')
    expect(formatClipSecondsText(12.5)).toBe('12.5')
    expect(formatClipSecondsText(Number.NaN)).toBe('0')
  })
})

describe('TrimSlider', () => {
  it('渲染两个可聚焦 handle 的 aria 读数与两端时长刻度', () => {
    const wrapper = mountSlider()
    const [start, end] = wrapper.findAll('[role="slider"]')

    expect(start.attributes('aria-valuemin')).toBe('0')
    expect(start.attributes('aria-valuemax')).toBe('120')
    expect(start.attributes('aria-valuenow')).toBe('0')
    expect(start.attributes('aria-valuetext')).toBe('0:00')
    expect(start.attributes('aria-label')).toBe('Clip start')
    expect(end.attributes('aria-valuenow')).toBe('60')

    const ticks = wrapper.findAll('.trim-tick')
    expect(ticks.map(tick => tick.text())).toEqual(['0:00', '2:00'])
  })

  it('方向键步进 1s、Shift 10s，Home/End 跳到该 handle 的边界', async () => {
    const wrapper = mountSlider({ start: 10, end: 60 })
    const [start, end] = wrapper.findAll('[role="slider"]')

    await start.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:start')).toEqual([[11]])
    await start.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(wrapper.emitted('update:start')).toEqual([[11], [20]])
    await start.trigger('keydown', { key: 'Home' })
    expect(wrapper.emitted('update:start')).toEqual([[11], [20], [0]])

    await end.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:end')).toEqual([[59]])
    await end.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:end')).toEqual([[59], [120]])
  })

  it('起点钳在终点、终点钳在全长，抵达边界后不再发出新值', async () => {
    const wrapper = mountSlider({ start: 19.5, end: 20 })
    const [start, end] = wrapper.findAll('[role="slider"]')

    await start.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:start')).toEqual([[20]])

    // 父组件写回后再次步进：候选值 21 被钳到终点 20，与当前一致则不发事件。
    await wrapper.setProps({ start: 20 })
    await start.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:start')).toHaveLength(1)

    await wrapper.setProps({ start: 0, end: 119.5 })
    await end.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:end')).toEqual([[120]])

    await wrapper.setProps({ end: 120 })
    await end.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:end')).toHaveLength(1)

    // 起点在 0 时左移同样不产生新值。
    await start.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:start')).toHaveLength(1)
  })

  it('父级禁用或时长未知（max ≤ 0）时 handle 通告禁用且不响应键盘', async () => {
    const disabled = mountSlider({ disabled: true })
    expect(disabled.get('[role="slider"]').attributes('aria-disabled')).toBe('true')
    await disabled.get('[role="slider"]').trigger('keydown', { key: 'ArrowRight' })
    expect(disabled.emitted('update:start')).toBeUndefined()

    const unknownDuration = mountSlider({ max: 0 })
    expect(unknownDuration.get('.trim-slider').classes()).toContain('trim-slider-disabled')
    await unknownDuration.get('[role="slider"]').trigger('keydown', { key: 'ArrowRight' })
    expect(unknownDuration.emitted('update:start')).toBeUndefined()
  })
})
