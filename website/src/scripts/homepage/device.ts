export {
  type FirstOpenedAtState,
  CLIENT_UUID_COOKIE_NAME,
  buildClientUuidCookieString,
  buildFooterBrandIconUrl,
  DEVICE_STORAGE_KEY,
  FIRST_OPENED_AT_STORAGE_UNAVAILABLE_REASON,
  FIRST_OPENED_AT_STORAGE_KEY,
  ensureFirstOpenedAt,
  ensureFirstOpenedAtState,
  ensureDeviceId,
  getFirstOpenedAt,
  getLegacyDeviceIds,
  getStoredDeviceId,
  initializeFooterBrandIcon,
  mountFooterBrandIcon,
  writeClientUuidCookie,
  resetDeviceId
} from '../../../../website-shared/src/homepage-runtime/device'
