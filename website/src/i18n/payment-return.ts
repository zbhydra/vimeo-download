/** PayPal / Clink 英文支付回跳页共用文案；回跳页仅英文、noindex，不进语言字典。 */
export const paymentReturnContent = {
  /** 「返回价格页」按钮文案，链接固定为 /ext-pricing/。 */
  backToPricing: 'Back to pricing',
  success: {
    /** 订单已查到且未终态：轮询中。 */
    waiting: {
      title: 'Payment submitted',
      description: 'We are confirming your payment. This page updates automatically.'
    },
    /** 后端确认已支付并履约。 */
    confirmed: {
      title: 'Payment confirmed',
      description:
        'Your subscription is active. You can close this tab and continue where you started.'
    },
    /** 后端明确返回取消、过期或失败。 */
    failed: {
      title: 'Payment not completed',
      description: 'This order was not completed. Return to pricing to try again.'
    },
    /** 本页无法确认订单（无网站登录态、token 失效、订单不属于当前网站账号）时的中性状态。 */
    submitted: {
      title: 'Payment submitted',
      description:
        'We cannot check this order from this page. Go back to where you started the purchase to see your plan. If you purchased in the extension, reopen it.'
    }
  },
  cancel: {
    title: 'Payment canceled',
    description: 'No payment was completed. You can return to pricing and choose again.'
  }
} as const
