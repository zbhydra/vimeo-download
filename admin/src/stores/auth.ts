/**
 * Auth Store — 管理员 Token 管理
 *
 * Access Token 和 Refresh Token 存储在 localStorage，页面刷新后自动恢复登录态。
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";

const TOKEN_KEY = "admin_token";
const REFRESH_TOKEN_KEY = "admin_refresh_token";

export const useAuthStore = defineStore("auth", () => {
  /** 管理员 Access Token */
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) ?? "");

  /** 管理员 Refresh Token */
  const refreshToken = ref<string>(localStorage.getItem(REFRESH_TOKEN_KEY) ?? "");

  /** 是否已登录 */
  const isLoggedIn = computed(() => token.value.length > 0);

  /** 保存管理员 token pair */
  function setTokens(newToken: string, newRefreshToken: string) {
    token.value = newToken;
    refreshToken.value = newRefreshToken;
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
  }

  /** 清除管理员 token pair */
  function clearToken() {
    token.value = "";
    refreshToken.value = "";
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  return { token, refreshToken, isLoggedIn, setTokens, clearToken };
});
