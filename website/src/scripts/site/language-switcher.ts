/**
 * Website 页头语言切换器。
 *
 * 负责下拉菜单交互、语言偏好 Cookie，以及在语言路由之间导航时保留当前查询参数。
 */

/** 当前语言按钮选择器。 */
const LANGUAGE_BUTTON_SELECTOR = '.lang-btn'
/** 语言下拉菜单选择器。 */
const LANGUAGE_DROPDOWN_SELECTOR = '.lang-dropdown'
/** 语言选项选择器。 */
const LANGUAGE_OPTION_SELECTOR = '.lang-option'
/** 用户语言偏好 Cookie 的有效期，单位为秒。 */
const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60

/**
 * 构造语言切换后的站内地址。
 *
 * 语言只由 pathname 表达；当前 query 承载来源、活动等页面上下文，切换语言后必须原样保留。
 */
export function buildLanguageSwitchUrl(targetPath: string, currentHref: string): string {
  const currentUrl = new URL(currentHref)
  const targetUrl = new URL(targetPath, currentUrl.origin)
  targetUrl.search = currentUrl.search
  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
}

/** 初始化页头语言切换器。 */
export function initializeLanguageSwitcher(): void {
  const languageButton = document.querySelector<HTMLButtonElement>(LANGUAGE_BUTTON_SELECTOR)
  const languageDropdown = document.querySelector<HTMLElement>(LANGUAGE_DROPDOWN_SELECTOR)

  languageButton?.addEventListener('click', event => {
    event.stopPropagation()
    languageDropdown?.classList.toggle('show')
  })

  document.addEventListener('click', () => {
    languageDropdown?.classList.remove('show')
  })

  const languageOptions = document.querySelectorAll<HTMLButtonElement>(LANGUAGE_OPTION_SELECTOR)
  languageOptions.forEach(option => {
    option.addEventListener('click', () => {
      const locale = option.dataset.locale
      const path = option.dataset.path
      if (!locale || !path) {
        return
      }

      document.cookie = `user-language=${locale}; path=/; max-age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
      window.location.href = buildLanguageSwitchUrl(path, window.location.href)
    })
  })
}
