/**
 * Website 侧认证运行时兼容入口。
 *
 * 实现统一维护在 website-shared，website 内部保留该路径给历史 import 使用。
 */

export {
  ACCESS_TOKEN_STORAGE_KEY,
  DEFAULT_PUBLIC_GOOGLE_CLIENT_ID,
  cancelGoogleRedirectPrompt,
  clearGoogleRedirectResult,
  clearStoredAccessToken,
  exchangeGoogleLoginCode,
  getCurrentUser,
  getRegistrationContext,
  getStoredAccessToken,
  isEmailVerificationRequiredResponse,
  logGoogleAuthStage,
  loginWithEmailCode,
  loginWithGoogleCredential,
  logoutCurrentUser,
  readGoogleRedirectResult,
  renderGoogleRedirectButton,
  requestGoogleRedirectPrompt,
  sendEmailCode,
  setStoredAccessToken
} from '../../../../website-shared/src/homepage-runtime/auth'

export type {
  EmailVerificationRequiredResponse,
  GoogleAuthDebugDetails,
  GoogleAuthDebugLevel,
  GoogleAuthDebugValue,
  GoogleButtonRenderOptions,
  GoogleLoginResponse,
  GoogleRedirectPromptOptions,
  GoogleRedirectResult,
  HomepageUserInfo,
  HomepageSubscriptionPeriod,
  HomepageUserSubscription,
  LoginResponse
} from '../../../../website-shared/src/homepage-runtime/auth'
