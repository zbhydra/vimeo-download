/**
 * 设备ID管理模块
 *
 * 用于生成和持久化唯一设备标识符，用于服务端识别和追踪用户设备。
 * 设备 ID 使用 UUID 生成，并缓存在 localStorage 中；页面启动后同步 `client_uuid`
 * Cookie，并在 footer 挂载品牌图标资源。图标是 32×32 透明 SVG：以普通可见
 * img 渲染，不做任何隐藏处理，请求打到后端写 device_trust。
 * 上线切到 v2 key 时会清理旧 key，
 * 避免继续沿用历史指纹或旧 UUID。
 */

/** localStorage 中存储设备ID的键名 */
export const DEVICE_STORAGE_KEY = 'homepage_device_id_v2'
/** localStorage 中存储首次打开网站时间的键名。 */
export const FIRST_OPENED_AT_STORAGE_KEY = 'homepage_first_opened_at'
/** 首次打开时间无法持久化时写入 mark_msg 的统一原因。 */
export const FIRST_OPENED_AT_STORAGE_UNAVAILABLE_REASON = 'localStorage_unavailable'
/** 当前页面写给服务端资源请求读取的 Cookie 名称。 */
export const CLIENT_UUID_COOKIE_NAME = 'client_uuid'

/** v2 前使用的设备 ID key；只用于上线后清理，不再读取。 */
const PREVIOUS_DEVICE_STORAGE_KEY = 'homepage_device_id'
/** v2 前临时保存过的历史设备 ID 列表；只用于上线后清理，不再读取。 */
const LEGACY_DEVICE_STORAGE_KEY = 'homepage_legacy_device_ids'

/** `client_uuid` Cookie 的有效期，与服务端 Redis TTL 保持 7 天。 */
const CLIENT_UUID_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
/** footer 中承载品牌图标资源的挂载点；图标为透明资源，请求用于后端写 device_trust。 */
const FOOTER_BRAND_ICON_SELECTOR = '[data-footer-brand-icon]'
/** 后端提供的品牌图标 SVG 路径（透明内容）；旧 `/assets/icons/credits.svg` 仅后端兼容。 */
// 固定版本号只用于绕开 CDN 旧 404 缓存；Nginx 用不含 query 的 URI 匹配，仍会反代到后端写 device_trust。
const FOOTER_BRAND_ICON_PATH = '/assets/icons/logo.svg?v=20260706'
/** 透明装饰资源的替代文本：留空，避免读屏器对不可见图片做无意义播报。 */
const FOOTER_BRAND_ICON_ALT = ''

interface ClientUuidCookieLocation {
  /** 当前页面协议，用于 HTTPS 下追加 Secure。 */
  protocol: string
}

export interface FirstOpenedAtState {
  /** 本次确认出的首次打开网站时间。 */
  firstOpenedAt: number
  /** 是否由当前调用新建首次打开时间。 */
  created: boolean
  /** 是否已成功写入 localStorage。 */
  persisted: boolean
  /** 持久化失败原因；用于首次访问 mark_msg。 */
  reason?: typeof FIRST_OPENED_AT_STORAGE_UNAVAILABLE_REASON
}

/** 当前页面生命周期内已确认的 UUID，localStorage 不可用时也保持请求一致。 */
let runtimeDeviceId: string | null = null
/** 当前页面生命周期内已确认的首次打开时间，localStorage 不可用时用于请求一致。 */
let runtimeFirstOpenedAt: number | null = null
/** 当前页面生命周期内首次打开时间是否已持久化。 */
let runtimeFirstOpenedAtPersisted = false

/** UUID device ID。 */
function isUuidDeviceId(deviceId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)
}

/**
 * 获取可用的 localStorage
 *
 * 某些隐私模式或浏览器配置下，访问 localStorage 可能抛出异常。
 */
function getLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * 生成 UUID 设备 ID
 *
 * 保证业务始终拿到非空 device_id；运行期调用方复用同一个 UUID。
 */
function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().toLowerCase()
  }

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * 持久化设备ID
 */
function storeDeviceId(deviceId: string): void {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(DEVICE_STORAGE_KEY, deviceId)
  } catch {
    // 忽略持久化失败，调用方仍可使用当前返回值继续业务流程
  }
}

/** 清理历史指纹 / v1 UUID 时代留下的设备 ID key。 */
function removeObsoleteDeviceStorageKeys(): void {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }

  try {
    storage.removeItem(PREVIOUS_DEVICE_STORAGE_KEY)
    storage.removeItem(LEGACY_DEVICE_STORAGE_KEY)
  } catch {
    // 清理失败不阻断新 UUID 合同；下次打开仍会重试。
  }
}

/**
 * 从 localStorage 获取已存储的设备ID
 *
 * @returns 已存储的设备ID，如果不存在则返回 null
 */
export function getStoredDeviceId(): string | null {
  const storage = getLocalStorage()
  if (!storage) {
    return null
  }

  try {
    return storage.getItem(DEVICE_STORAGE_KEY)
  } catch {
    return null
  }
}

/** 判断 localStorage 中的首次打开时间是否可用于上报。 */
function isValidFirstOpenedAt(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/** 读取已保存的首次打开网站时间。 */
export function getFirstOpenedAt(): number {
  if (runtimeFirstOpenedAt !== null) {
    return runtimeFirstOpenedAt
  }

  const storage = getLocalStorage()
  if (!storage) {
    return 0
  }

  try {
    const stored = Number(storage.getItem(FIRST_OPENED_AT_STORAGE_KEY))
    return isValidFirstOpenedAt(stored) ? stored : 0
  } catch {
    return 0
  }
}

/**
 * 确认首次打开网站时间，并返回本次调用是否新建。
 *
 * 普通调用方继续使用 `ensureFirstOpenedAt()` 只取时间值。
 */
export function ensureFirstOpenedAtState(): FirstOpenedAtState {
  if (runtimeFirstOpenedAt !== null) {
    return {
      firstOpenedAt: runtimeFirstOpenedAt,
      created: false,
      persisted: runtimeFirstOpenedAtPersisted,
      reason: runtimeFirstOpenedAtPersisted
        ? undefined
        : FIRST_OPENED_AT_STORAGE_UNAVAILABLE_REASON
    }
  }

  const storage = getLocalStorage()
  if (storage) {
    try {
      const stored = Number(storage.getItem(FIRST_OPENED_AT_STORAGE_KEY))
      if (isValidFirstOpenedAt(stored)) {
        runtimeFirstOpenedAt = stored
        runtimeFirstOpenedAtPersisted = true
        return {
          firstOpenedAt: stored,
          created: false,
          persisted: true
        }
      }
    } catch {
      // 读取失败时按首次访问继续走上报；写入是否成功由下面的 setItem 决定。
    }
  }

  const next = Date.now()
  runtimeFirstOpenedAt = next
  runtimeFirstOpenedAtPersisted = false
  if (!storage) {
    return {
      firstOpenedAt: next,
      created: true,
      persisted: false,
      reason: FIRST_OPENED_AT_STORAGE_UNAVAILABLE_REASON
    }
  }

  try {
    storage.setItem(FIRST_OPENED_AT_STORAGE_KEY, String(next))
    runtimeFirstOpenedAtPersisted = true
  } catch {
    return {
      firstOpenedAt: next,
      created: true,
      persisted: false,
      reason: FIRST_OPENED_AT_STORAGE_UNAVAILABLE_REASON
    }
  }

  return {
    firstOpenedAt: next,
    created: true,
    persisted: true
  }
}

/** 确保首次打开网站时间已写入；老用户升级后以首次运行新版脚本的时间补齐。 */
export function ensureFirstOpenedAt(): number {
  return ensureFirstOpenedAtState().firstOpenedAt
}

/** 兼容旧 snapshot 调用方；v2 起不再迁移旧 device ID。 */
export function getLegacyDeviceIds(): string[] {
  return []
}

/**
 * 确保设备ID存在
 *
 * 如果已有存储的 UUID 则直接返回，否则生成 UUID 并存储。
 * localStorage 不可用时复用运行期内存值，避免同一页面的 Logo 和 API 使用不同 ID。
 * 这是获取设备ID的主要入口函数。
 *
 * @returns 当前设备的唯一标识符
 */
export async function ensureDeviceId(): Promise<string> {
  ensureFirstOpenedAt()
  removeObsoleteDeviceStorageKeys()

  if (runtimeDeviceId) {
    return runtimeDeviceId
  }

  const stored = getStoredDeviceId()?.trim() || null
  if (stored && isUuidDeviceId(stored)) {
    runtimeDeviceId = stored
    return stored
  }

  const next = createDeviceId()
  runtimeDeviceId = next
  storeDeviceId(next)
  return next
}

/** 重建游客设备 ID，用于服务端明确拒绝当前 X-Device-Id 的授权场景。 */
export function resetDeviceId(): string {
  const next = createDeviceId().toLowerCase()
  ensureFirstOpenedAt()
  removeObsoleteDeviceStorageKeys()
  runtimeDeviceId = next
  storeDeviceId(next)
  return next
}

/**
 * 构造 `client_uuid` Cookie 字符串（host-only，不设 Domain，仅当前 host 可读）。
 *
 * @param clientUuid 当前页面已生成的客户端 UUID。
 * @param locationLike 当前页面 location，测试可传入只含 protocol 的对象。
 */
export function buildClientUuidCookieString(
  clientUuid: string,
  locationLike: ClientUuidCookieLocation = window.location
): string {
  const cookieParts = [
    `${CLIENT_UUID_COOKIE_NAME}=${encodeURIComponent(clientUuid)}`,
    `Max-Age=${CLIENT_UUID_COOKIE_MAX_AGE_SECONDS}`,
    'Path=/',
    'SameSite=Lax'
  ]

  if (locationLike.protocol === 'https:') {
    cookieParts.push('Secure')
  }

  return cookieParts.join('; ')
}

/** 写入 `client_uuid` Cookie，并返回实际写入的 Cookie 字符串。 */
export function writeClientUuidCookie(clientUuid: string): string {
  const cookieString = buildClientUuidCookieString(clientUuid)
  document.cookie = cookieString
  return cookieString
}

/** 构造 footer 品牌 Logo 图标资源 URL。 */
export function buildFooterBrandIconUrl(): string {
  return FOOTER_BRAND_ICON_PATH
}

/**
 * 在 footer 挂载品牌图标。
 *
 * 调用方必须先写入 Cookie，再调用本方法；本方法只在设置 `img.src` 时触发资源请求。
 * 图标为 32×32 透明 SVG，img 保持普通可见渲染，不做隐藏处理；
 * 不要给图片加 `loading="lazy"`，懒加载可能推迟或跳过请求，导致 device_trust 写入丢失。
 */
export function mountFooterBrandIcon(): HTMLImageElement | null {
  const mountPoint = document.querySelector<HTMLElement>(FOOTER_BRAND_ICON_SELECTOR)
  if (!mountPoint) {
    return null
  }

  const existingImage = mountPoint.querySelector<HTMLImageElement>('img')
  if (existingImage) {
    return existingImage
  }

  const image = document.createElement('img')
  image.width = 32
  image.height = 32
  image.alt = FOOTER_BRAND_ICON_ALT
  image.decoding = 'async'
  image.src = buildFooterBrandIconUrl()
  mountPoint.append(image)
  return image
}

/**
 * 页面启动入口：确保 client_uuid Cookie 已写入后，再挂载 footer 品牌图标。
 */
export async function initializeFooterBrandIcon(): Promise<void> {
  try {
    const clientUuid = await ensureDeviceId()
    writeClientUuidCookie(clientUuid)
    mountFooterBrandIcon()
  } catch (error) {
    console.error('[device] Failed to initialize footer brand icon.', error)
  }
}
