/**
 * 首帧后任务调度。
 *
 * 埋点、统计脚本等非关键工作若在 load 时立即启动，会与首帧绘制争抢主线程和带宽，
 * 把 FCP / LCP 一起推后。这里等 load 之后再跨过下一帧，确保首屏已经画出再执行。
 */

/** 在页面完成加载且下一帧绘制后执行非关键任务。 */
export function runAfterFirstPaint(task: () => void): void {
  const schedule = (): void => {
    requestAnimationFrame(() => {
      setTimeout(task, 0)
    })
  }

  if (document.readyState === 'complete') {
    schedule()
    return
  }
  window.addEventListener('load', schedule, { once: true })
}
