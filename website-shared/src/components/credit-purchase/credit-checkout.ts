/**
 * Credits 购买接口客户端。
 *
 * 只负责读取 Credits 商品配置与格式化展示数据；订单协议由公共 OrderCheckout 维护。
 */

import { getJson, type RequestContext } from '../../homepage-runtime/api'

/** Credits 充值商品类别。 */
export const CREDIT_PRODUCT_CLASS = 2

/** 后端金额使用 6 位小数精度。 */
const DISPLAY_AMOUNT_SCALE = 1_000_000

/** Credits 单价展示保留 4 位，避免小额套餐被四舍五入成 $0.00。 */
const CREDIT_UNIT_PRICE_DECIMALS = 4

/** Credits checkout configs 响应。 */
export interface CreditCheckoutConfigsResponse {
  /** 可购买 Credits 商品列表。 */
  checkout_configs: CreditCheckoutPlan[]
}

/** 单个 Credits 商品的可购买配置。 */
export interface CreditCheckoutPlan {
  /** 商品类别，Credits 充值为 2。 */
  product_class: number
  /** Credits 商品标识。 */
  product_id: string
  /** 后端配置商品名。 */
  product_name: string
  /** 到账 Credits 数量。 */
  credits_amount: number
  /** 前端展示币种，当前为 USD。 */
  display_currency: string
  /** 前端展示金额，6 位精度。 */
  display_amount: number
  /** 当前商品可用支付渠道。 */
  payment_channels: CreditCheckoutPaymentChannel[]
}

/** 单个支付渠道价格快照。 */
export interface CreditCheckoutPaymentChannel {
  /** 支付方式，例如 paypal 或 clink。 */
  payment_method: string
  /** 支付渠道展示名，前端本期不展示。 */
  payment_method_name: string
  /** 渠道币种，例如 XTR，前端本期不展示。 */
  currency: string
  /** 渠道金额，6 位精度。 */
  amount: number
  /** 渠道侧 SKU。 */
  provider_sku: string | null
}

/** 请求 Credits checkout configs。 */
export async function listCreditCheckoutConfigs(
  context: RequestContext
): Promise<CreditCheckoutPlan[]> {
  const response = await getJson<CreditCheckoutConfigsResponse>(
    '/api/client/credit/checkout-configs',
    context
  )
  return response.checkout_configs.filter(isCreditCheckoutPlan)
}

/** 格式化美元展示价；后端当前只返回 USD，但这里仍校验币种，避免显示错误币种。 */
export function formatCreditDisplayPrice(
  plan: Pick<CreditCheckoutPlan, 'display_amount' | 'display_currency'>
): string {
  const amount = plan.display_amount / DISPLAY_AMOUNT_SCALE
  if (plan.display_currency === 'USD') {
    return `$${amount.toFixed(2)}`
  }
  return `${plan.display_currency} ${formatSixDecimalAmount(amount)}`
}

/** 从本地化的 Credits 数量模板中提取单位名，例如 `{credits} Credits` -> `Credits`。 */
export function formatCreditUnitLabel(creditsAmountTemplate: string): string {
  const unitLabel = creditsAmountTemplate.replace(/\{credits\}/g, '').replace(/\s+/g, ' ').trim()
  return unitLabel || 'Credits'
}

/** 格式化单个 Credits 的展示价。 */
export function formatCreditDisplayUnitPrice(
  plan: Pick<CreditCheckoutPlan, 'display_amount' | 'display_currency' | 'credits_amount'>,
  creditUnitLabel: string
): string {
  const unitAmount = plan.display_amount / DISPLAY_AMOUNT_SCALE / plan.credits_amount
  const unitSuffix = creditUnitLabel.trim() ? `/${creditUnitLabel.trim()}` : ''
  if (plan.display_currency === 'USD') {
    return `$${unitAmount.toFixed(CREDIT_UNIT_PRICE_DECIMALS)}${unitSuffix}`
  }
  return `${plan.display_currency} ${unitAmount.toFixed(CREDIT_UNIT_PRICE_DECIMALS)}${unitSuffix}`
}

/** 格式化最多 6 位小数的金额，去掉尾部 0。 */
function formatSixDecimalAmount(amount: number): string {
  return amount.toFixed(6).replace(/\.?0+$/, '')
}

/** 运行时校验 checkout plan，过滤半升级或历史坏数据。 */
function isCreditCheckoutPlan(value: CreditCheckoutPlan): boolean {
  return (
    value.product_class === CREDIT_PRODUCT_CLASS &&
    typeof value.product_id === 'string' &&
    value.product_id.length > 0 &&
    typeof value.product_name === 'string' &&
    typeof value.credits_amount === 'number' &&
    Number.isFinite(value.credits_amount) &&
    value.credits_amount > 0 &&
    typeof value.display_currency === 'string' &&
    typeof value.display_amount === 'number' &&
    Number.isFinite(value.display_amount) &&
    Array.isArray(value.payment_channels)
  )
}
