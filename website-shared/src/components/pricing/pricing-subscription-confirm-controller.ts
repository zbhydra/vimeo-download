/**
 * Pricing 订阅确认与好评赠送弹窗控制器。
 *
 * 倒计时以目标时间计算，关闭弹窗即清空当前周期的全部内存状态。
 */

import { HomepageApiError, type RequestContext } from '../../homepage-runtime/api'
import { HOMEPAGE_MARK_TYPE, recordHomepageMark } from '../../homepage-runtime/mark'
import {
  claimSubscriptionReviewReward,
  type ReviewRewardClaimResponse
} from './pricing-checkout'

/** 用户返回评价页所需的检测时间。 */
const REVIEW_COUNTDOWN_MS = 30_000
/** 后端服务器繁忙业务码。 */
const REVIEW_REWARD_BUSY_CODE = 26001

/** 弹窗可见状态。 */
type ReviewRewardView = 'confirm' | 'countdown' | 'claiming' | 'success' | 'already_claimed' | 'failed'

/** 打开弹窗所需数据。 */
export interface PricingSubscriptionConfirmOptions {
  /** 后端是否开放好评赠送活动。 */
  reviewRewardEnabled: boolean
  /** 好评赠送资格状态位：0 可领，1 不可领（已领过，或资格推导失败按不可领降级）。 */
  reviewRewardClaimedCount: number
  /** 领取 API 请求上下文。 */
  requestContext: RequestContext
  /** 关闭后恢复焦点的触发按钮。 */
  returnFocus: HTMLButtonElement
}

/** 弹窗结束原因。 */
export type PricingSubscriptionConfirmResult = 'continue' | 'closed' | 'auth_invalid'

/** 领取成功后通知页面刷新账号订阅与好评赠送资格。 */
export const PRICING_REVIEW_REWARD_CLAIMED_EVENT = 'pricing:review-reward-claimed'

/** 领取成功事件数据。 */
export type PricingReviewRewardClaimedPayload = ReviewRewardClaimResponse

/** 全局弹窗 controller。 */
export interface PricingSubscriptionConfirmController {
  /** 打开一个全新的购买确认周期。 */
  open(options: PricingSubscriptionConfirmOptions): Promise<PricingSubscriptionConfirmResult>
  /** 从页面活动入口直接打开评价页并进入检测周期。 */
  openReviewReward(options: PricingSubscriptionConfirmOptions): Promise<PricingSubscriptionConfirmResult>
}

/** 弹窗 DOM 集合。 */
interface ConfirmElements {
  /** 原生 dialog。 */
  dialog: HTMLDialogElement
  /** 各状态视图。 */
  views: HTMLElement[]
  /** 好评入口区域。 */
  rewardOffer: HTMLElement
  /** 去好评按钮。 */
  reviewButton: HTMLButtonElement
  /** 继续购买按钮。 */
  continueButton: HTMLButtonElement
  /** 所有关闭按钮。 */
  closeButtons: HTMLButtonElement[]
  /** 倒计时文本。 */
  countdown: HTMLElement
  /** 失败原因。 */
  error: HTMLElement
  /** 重试按钮。 */
  retry: HTMLButtonElement
  /** 读屏状态播报。 */
  live: HTMLElement
  /** Chrome Web Store 好评页地址，由站点页面的插件地址派生。 */
  reviewUrl: string
}

/** 当前打开周期状态。 */
interface ConfirmCycle {
  /** 领取请求上下文。 */
  requestContext: RequestContext
  /** 关闭后恢复焦点元素。 */
  returnFocus: HTMLButtonElement
  /** Promise 结束函数。 */
  resolve: (result: PricingSubscriptionConfirmResult) => void
  /** 倒计时目标时间。 */
  countdownDeadline: number
  /** 倒计时 timer。 */
  countdownTimer: number | null
  /** 当前周期是否已发出领取请求。 */
  claimStarted: boolean
}

/** 创建单实例弹窗控制器。 */
export function createController(elements: ConfirmElements): PricingSubscriptionConfirmController {
  let cycle: ConfirmCycle | null = null

  const close = (result: PricingSubscriptionConfirmResult): void => {
    if (!cycle) {
      return
    }
    const closingCycle = cycle
    cycle = null
    if (closingCycle.countdownTimer !== null) {
      window.clearTimeout(closingCycle.countdownTimer)
    }
    if (elements.dialog.open) {
      elements.dialog.close()
    }
    closingCycle.resolve(result)
    closingCycle.returnFocus.focus()
  }

  const showView = (view: ReviewRewardView, announcement = ''): void => {
    for (const element of elements.views) {
      element.hidden = element.dataset.pricingSubscriptionConfirmView !== view
    }
    elements.live.textContent = announcement
    const activeView = elements.views.find(element => !element.hidden)
    const title = activeView?.querySelector<HTMLElement>('h2') ?? null
    const description = activeView?.querySelector<HTMLElement>('.pricing-subscription-confirm-description') ?? null
    if (title?.id) {
      elements.dialog.setAttribute('aria-labelledby', title.id)
    }
    if (description?.id) {
      elements.dialog.setAttribute('aria-describedby', description.id)
    }
    title?.focus()
  }

  const claimReward = async (): Promise<void> => {
    if (!cycle || cycle.claimStarted) {
      return
    }
    const claimingCycle = cycle
    claimingCycle.claimStarted = true
    showView('claiming', getTitleText(elements, 'claiming'))
    try {
      const response = await claimSubscriptionReviewReward(claimingCycle.requestContext)
      if (cycle !== claimingCycle) {
        return
      }
      window.dispatchEvent(new CustomEvent<PricingReviewRewardClaimedPayload>(
        PRICING_REVIEW_REWARD_CLAIMED_EVENT,
        { detail: response }
      ))
      const resultView: ReviewRewardView = response.result === 'granted' ? 'success' : 'already_claimed'
      showView(resultView, getTitleText(elements, resultView))
    } catch (error) {
      console.error(error)
      if (cycle !== claimingCycle) {
        return
      }
      if (error instanceof HomepageApiError && error.status === 401) {
        close('auth_invalid')
        return
      }
      cycle.claimStarted = false
      elements.error.textContent = error instanceof Error
        ? getClaimErrorMessage(elements, error)
        : elements.error.dataset.failedMessage || ''
      showView('failed', elements.error.textContent)
    }
  }

  const updateCountdown = (): void => {
    if (!cycle) {
      return
    }
    const remainingMs = cycle.countdownDeadline - Date.now()
    if (remainingMs <= 0) {
      cycle.countdownTimer = null
      void claimReward()
      return
    }
    const seconds = Math.ceil(remainingMs / 1000)
    elements.countdown.textContent = (elements.countdown.dataset.template || '{seconds}').replace(
      '{seconds}',
      String(seconds)
    )
    cycle.countdownTimer = window.setTimeout(updateCountdown, Math.min(1000, remainingMs))
  }

  /** 在当前用户手势中打开商店，保证页面活动入口不会被浏览器拦截。 */
  const startReview = (): void => {
    if (!cycle) {
      return
    }
    if (!elements.reviewUrl) {
      console.error(
        new Error(
          '[pricing-subscription-confirm-controller] Missing extension review URL: expected data-extension-review-url on the confirm dialog.'
        )
      )
      return
    }
    void recordHomepageMark(
      HOMEPAGE_MARK_TYPE.WEB_EXTENSION_STORE_REVIEW_CLICK,
      cycle.requestContext
    ).catch(error => {
      console.error(
        '[pricing-subscription-confirm-controller] Failed to record extension store review click mark-log.',
        error
      )
    })
    window.open(elements.reviewUrl, '_blank', 'noopener,noreferrer')
    cycle.countdownDeadline = Date.now() + REVIEW_COUNTDOWN_MS
    showView('countdown')
    updateCountdown()
  }

  /** 初始化一次独立弹窗周期，所有入口共用关闭、焦点恢复和 timer 清理。 */
  const openCycle = (
    options: PricingSubscriptionConfirmOptions,
    initialView: ReviewRewardView
  ): Promise<PricingSubscriptionConfirmResult> => {
    if (cycle) {
      close('closed')
    }
    return new Promise(resolve => {
      cycle = {
        requestContext: options.requestContext,
        returnFocus: options.returnFocus,
        resolve,
        countdownDeadline: 0,
        countdownTimer: null,
        claimStarted: false
      }
      elements.rewardOffer.hidden =
        !options.reviewRewardEnabled || options.reviewRewardClaimedCount !== 0
      elements.error.textContent = ''
      elements.live.textContent = ''
      showView(initialView)
      elements.dialog.showModal()
      elements.views
        .find(element => !element.hidden)
        ?.querySelector<HTMLElement>('h2')
        ?.focus()
    })
  }

  for (const button of elements.closeButtons) {
    button.addEventListener('click', () => close('closed'))
  }
  elements.dialog.addEventListener('cancel', event => {
    event.preventDefault()
    close('closed')
  })
  elements.continueButton.addEventListener('click', () => close('continue'))
  elements.reviewButton.addEventListener('click', () => {
    startReview()
  })
  elements.retry.addEventListener('click', () => {
    void claimReward()
  })
  window.addEventListener('pagehide', () => close('closed'))

  return {
    open(options) {
      return openCycle(options, 'confirm')
    },
    openReviewReward(options) {
      const result = openCycle(options, 'countdown')
      startReview()
      return result
    }
  }
}

/** 只允许明确的后端业务消息透传，网络、超时、解析和合同错误使用本地文案。 */
function getClaimErrorMessage(elements: ConfirmElements, error: Error): string {
  if (error instanceof HomepageApiError && error.code === REVIEW_REWARD_BUSY_CODE) {
    return elements.error.dataset.busyMessage || ''
  }
  if (
    error instanceof HomepageApiError &&
    error.status > 0 &&
    error.code !== undefined &&
    error.message
  ) {
    return error.message
  }
  return elements.error.dataset.failedMessage || ''
}

/** 读取指定状态标题，作为读屏状态播报。 */
function getTitleText(elements: ConfirmElements, view: ReviewRewardView): string {
  return elements.views.find(element => element.dataset.pricingSubscriptionConfirmView === view)
    ?.querySelector('h2')?.textContent?.trim() || ''
}

/** 必需 DOM 查询。 */
function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) {
    throw new Error(`[pricing-subscription-confirm-controller] Missing required element: ${selector}`)
  }
  return element
}

declare global {
  interface Window {
    /** Pricing 订阅专用确认弹窗。 */
    pricingSubscriptionConfirmController?: PricingSubscriptionConfirmController
  }
}

const dialog = document.querySelector<HTMLDialogElement>('[data-pricing-subscription-confirm]')
if (dialog) {
  const error = query<HTMLElement>(dialog, '[data-pricing-review-error]')
  error.dataset.failedMessage = dialog.dataset.failedMessage || ''
  error.dataset.busyMessage = dialog.dataset.busyMessage || ''
  window.pricingSubscriptionConfirmController = createController({
    dialog,
    views: Array.from(dialog.querySelectorAll<HTMLElement>('[data-pricing-subscription-confirm-view]')),
    rewardOffer: query(dialog, '[data-pricing-review-reward-offer]'),
    reviewButton: query(dialog, '[data-pricing-review-button]'),
    continueButton: query(dialog, '[data-pricing-subscription-confirm-continue]'),
    closeButtons: Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-pricing-subscription-confirm-close]')),
    countdown: query(dialog, '[data-pricing-review-countdown]'),
    error,
    retry: query(dialog, '[data-pricing-review-retry]'),
    live: query(dialog, '[data-pricing-review-live]'),
    reviewUrl: dialog.dataset.extensionReviewUrl ?? ''
  })
}
