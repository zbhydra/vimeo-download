/** ClinkBill 英文支付回跳页文案。 */
export const clinkReturnContent = {
  success: {
    waiting: {
      title: 'Payment submitted',
      description:
        'We are confirming your payment. The original tab will update automatically.'
    },
    confirmed: {
      title: 'Payment confirmed',
      description: 'Your purchase is ready. You can return to the original tab.'
    },
    failed: {
      title: 'Payment needs attention',
      description: 'We could not confirm this order. Return to the original tab and try again.'
    }
  },
  cancel: {
    title: 'Payment canceled',
    description: 'No payment was completed. You can return and choose another payment method.'
  }
} as const
