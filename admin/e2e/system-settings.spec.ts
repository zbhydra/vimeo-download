/**
 * 系统设置 e2e。
 *
 * 覆盖：
 * - 已有 API Key 只显示前缀和生成时间。
 * - 已有 API Key 重新生成前必须确认。
 * - 生成成功后完整 API Key 只在一次性弹窗展示，关闭即消失。
 * - 完整 API Key 不写入 localStorage。
 * - 刷新配置缓存命中正确 POST，并展示刷新结果。
 * - 远端配置懒加载一次、宽松对象保存和非法 JSON 拦截。
 * - 远端配置读取失败可重试，保存失败保留输入。
 */
import { expect, test, type Page } from "@playwright/test";
import { registerE2eBrowserIdentity } from "../../scripts/playwright-browser-identity.mjs";

registerE2eBrowserIdentity(test);

/** Dashboard 页面最小 mock。 */
interface DashboardMockData {
  /** dashboard 汇总统计。 */
  summary: Record<string, number>;
  /** 诊断标记类型列表。 */
  mark_types: string[];
  /** 诊断行列表，本测试不关心具体结构。 */
  rows: string[];
}

/** API Key 元信息 mock。 */
interface ApiKeyMetaMockData {
  /** 是否已经生成 API Key。 */
  has_api_key: boolean;
  /** 可展示前缀。 */
  api_key_prefix: string;
  /** 生成时间，毫秒时间戳。 */
  api_key_created_at: number | null;
}

/** API Key 生成响应 mock。 */
interface GeneratedApiKeyMockData {
  /** 完整 API Key，只返回一次。 */
  api_key: string;
  /** 可展示前缀。 */
  api_key_prefix: string;
  /** 生成时间，毫秒时间戳。 */
  api_key_created_at: number;
}

/** 配置缓存刷新响应 mock。 */
interface ConfigCacheRefreshMockData {
  /** 已刷新服务名。 */
  refreshed_services: string[];
  /** 刷新完成时间，毫秒时间戳。 */
  refreshed_at: number;
}

/** 远端配置中的任意 JSON value。 */
type RemoteConfigJsonValue =
  | string
  | number
  | boolean
  | null
  | RemoteConfigJsonValue[]
  | { [key: string]: RemoteConfigJsonValue };

/** 远端稀疏配置 mock。 */
interface RemoteConfigMockData {
  /** 顶层分组由后端与客户端约定，mock 不维护字段清单。 */
  [key: string]: RemoteConfigJsonValue;
}

/** 本文件 route.fulfill 可返回的数据联合。 */
type MockResponseData =
  | DashboardMockData
  | ApiKeyMetaMockData
  | GeneratedApiKeyMockData
  | ConfigCacheRefreshMockData
  | RemoteConfigMockData;

/** 后端统一成功响应。 */
function successResponse(data: MockResponseData) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 10000, data, msg: "success" }),
  };
}

/** 后端失败响应。 */
function failedResponse(message: string) {
  return {
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ code: 50000, msg: message }),
  };
}

/** 后端业务失败响应。 */
function businessFailedResponse(code: number, message: string) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code, data: {}, msg: message }),
  };
}

/** 注入登录 Token 并 mock 布局依赖。 */
async function loginAsAdmin(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("admin_token", "mock-admin-jwt-token");
    const testWindow = window as Window & { copiedTextForTest?: string };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          testWindow.copiedTextForTest = text;
        },
      },
    });
  });

  await page.route("**/api/admin/dashboard", async (route) => {
    await route.fulfill(
      successResponse({
        summary: {
          total_users: 0,
          new_users: 0,
          active_users_24h: 0,
          active_users_7d: 0,
        },
        mark_types: [],
        rows: [],
      }),
    );
  });
}

/** 切换系统设置顶部 tab。 */
async function openSettingsTab(page: Page, tab: "api-key" | "remote-config") {
  const tabText = {
    "api-key": "API Key",
    "remote-config": "远端配置",
  }[tab];
  await page.locator(".n-tabs-nav").getByText(tabText, { exact: true }).click();
}

/** mock 系统设置接口。 */
async function mockSystemSettingsApi(page: Page) {
  const fullApiKey = "tdm_test_full_api_key_only_once";
  let apiKeyMeta: ApiKeyMetaMockData = {
    has_api_key: true,
    api_key_prefix: "tdm_existing",
    api_key_created_at: 1780977600000,
  };
  let generateCallCount = 0;
  let refreshCacheCallCount = 0;
  let remoteConfig: RemoteConfigMockData = {};
  let remoteConfigGetCallCount = 0;
  let remoteConfigSaveCallCount = 0;
  let lastRemoteConfigSaveBody: RemoteConfigMockData | null = null;
  let failRemoteConfigGet = false;
  let failRemoteConfigSave = false;

  await page.route("**/api/admin/system-settings/api-key", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill(successResponse(apiKeyMeta));
      return;
    }

    expect(route.request().method()).toBe("POST");
    generateCallCount += 1;
    apiKeyMeta = {
      has_api_key: true,
      api_key_prefix: "tdm_test_ful",
      api_key_created_at: 1780977700000,
    };
    await route.fulfill(
      successResponse({
        api_key: fullApiKey,
        api_key_prefix: apiKeyMeta.api_key_prefix,
        api_key_created_at: apiKeyMeta.api_key_created_at,
      }),
    );
  });

  await page.route(
    "**/api/admin/system-settings/config-cache/refresh",
    async (route) => {
      expect(route.request().method()).toBe("POST");
      refreshCacheCallCount += 1;
      await route.fulfill(
        successResponse({
          refreshed_services: [
            "config_public_service",
            "payment_config_service",
          ],
          refreshed_at: 1780977800000,
        }),
      );
    },
  );

  await page.route(
    "**/api/admin/system-settings/remote-config",
    async (route) => {
      if (route.request().method() === "GET") {
        remoteConfigGetCallCount += 1;
        if (failRemoteConfigGet) {
          await route.fulfill(failedResponse("remote config load failed"));
          return;
        }
        await route.fulfill(successResponse(remoteConfig));
        return;
      }

      expect(route.request().method()).toBe("POST");
      remoteConfigSaveCallCount += 1;
      if (failRemoteConfigSave) {
        await route.fulfill(failedResponse("remote config save failed"));
        return;
      }
      remoteConfig = route.request().postDataJSON() as RemoteConfigMockData;
      lastRemoteConfigSaveBody = remoteConfig;
      await route.fulfill(successResponse(remoteConfig));
    },
  );

  return {
    /** 完整 API Key。 */
    fullApiKey,
    /** 更新远端配置 mock，供读取断言使用。 */
    setRemoteConfig: (next: RemoteConfigMockData) => {
      remoteConfig = next;
    },
    /** 控制远端配置读取接口是否失败。 */
    setRemoteConfigGetFailure: (next: boolean) => {
      failRemoteConfigGet = next;
    },
    /** 控制远端配置保存接口是否失败。 */
    setRemoteConfigSaveFailure: (next: boolean) => {
      failRemoteConfigSave = next;
    },
    /** 当前生成接口调用次数。 */
    generateCallCount: () => generateCallCount,
    /** 当前刷新缓存接口调用次数。 */
    refreshCacheCallCount: () => refreshCacheCallCount,
    /** 当前远端配置查询次数。 */
    remoteConfigGetCallCount: () => remoteConfigGetCallCount,
    /** 当前远端配置保存次数。 */
    remoteConfigSaveCallCount: () => remoteConfigSaveCallCount,
    /** 最近一次远端配置保存请求。 */
    lastRemoteConfigSaveBody: () => lastRemoteConfigSaveBody,
  };
}

test("API Key 轮换使用确认弹窗，完整 Key 只在一次性弹窗展示", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const api = await mockSystemSettingsApi(page);

  await page.goto("/system-settings");
  await openSettingsTab(page, "api-key");
  await expect(page.getByText("tdm_existing")).toBeVisible();
  await expect(page.getByText(api.fullApiKey)).toHaveCount(0);

  await page.getByRole("button", { name: "重新生成 API Key" }).click();
  await expect(page.getByText("旧 API Key 会立即失效")).toBeVisible();
  expect(api.generateCallCount()).toBe(0);

  await page.getByRole("button", { name: "确认" }).click();
  await expect(page.getByText(api.fullApiKey)).toBeVisible();
  await expect(page.getByText("请立即保存本次生成的 API Key")).toBeVisible();

  await page.getByRole("button", { name: "复制" }).click();
  await expect(page.locator(".n-message__content", { hasText: "已复制" })).toBeVisible();
  const copiedText = await page.evaluate(() => {
    return (window as Window & { copiedTextForTest?: string }).copiedTextForTest ?? "";
  });
  expect(copiedText).toBe(api.fullApiKey);
  const localStorageSnapshot = await page.evaluate(() => {
    const values: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) {
        values.push(window.localStorage.getItem(key) ?? "");
      }
    }
    return values.join("\\n");
  });
  expect(localStorageSnapshot).not.toContain(api.fullApiKey);

  await page.keyboard.press("Escape");
  await expect(page.getByText(api.fullApiKey)).toHaveCount(0);
  await expect(page.getByText("tdm_test_ful")).toBeVisible();
});

test("刷新配置缓存命中 POST 并展示成功结果", async ({ page }) => {
  await loginAsAdmin(page);
  const api = await mockSystemSettingsApi(page);

  await page.goto("/system-settings");
  await expect(page.locator(".n-card-header__main")).toHaveCount(0);
  await expect(page.locator(".section-header")).toHaveCount(0);
  await page.getByRole("button", { name: "刷新配置缓存" }).click();

  await expect(
    page.locator(".n-alert-body__title", { hasText: "配置缓存刷新成功" }),
  ).toBeVisible();
  await expect(page.getByText("已刷新 2 个服务")).toBeVisible();
  await expect(page.getByText("config_public_service")).toBeVisible();
  await expect(page.getByText("payment_config_service")).toBeVisible();
  expect(api.refreshCacheCallCount()).toBe(1);
});

test("远端配置懒加载一次，宽松保存且非法输入不提交", async ({ page }) => {
  await loginAsAdmin(page);
  const api = await mockSystemSettingsApi(page);
  const editor = page.locator(".remote-config-input textarea");
  const configText = `{
  "dom": { "aMessageSelector": ".Message[data-message-id]" },
  "download": { "opfsThresholdBytes": 209715200, "futureKey": true },
  "futureGroup": { "enabled": null }
}`;

  await page.goto("/system-settings");
  await openSettingsTab(page, "remote-config");
  await expect(editor).toHaveValue("{}");
  expect(api.remoteConfigGetCallCount()).toBe(1);

  await openSettingsTab(page, "api-key");
  await openSettingsTab(page, "remote-config");
  expect(api.remoteConfigGetCallCount()).toBe(1);

  await editor.fill(configText);
  await page.getByRole("button", { name: "保存远端配置" }).click();
  await expect(
    page.locator(".n-message__content", { hasText: "远端配置已保存" }),
  ).toBeVisible();
  await expect(editor).toHaveValue(configText);
  expect(api.remoteConfigSaveCallCount()).toBe(1);
  expect(api.lastRemoteConfigSaveBody()).toEqual({
    dom: { aMessageSelector: ".Message[data-message-id]" },
    download: { opfsThresholdBytes: 209715200, futureKey: true },
    futureGroup: { enabled: null },
  });

  await editor.fill("{");
  await page.getByRole("button", { name: "保存远端配置" }).click();
  await expect(page.getByText("请输入合法 JSON")).toBeVisible();
  expect(api.remoteConfigSaveCallCount()).toBe(1);

  await editor.fill("[]");
  await page.getByRole("button", { name: "保存远端配置" }).click();
  await expect(page.getByText("JSON 顶层必须是对象")).toBeVisible();
  expect(api.remoteConfigSaveCallCount()).toBe(1);
});

test("远端配置读取失败可重试，保存失败保留输入", async ({ page }) => {
  await loginAsAdmin(page);
  const api = await mockSystemSettingsApi(page);
  const editor = page.locator(".remote-config-input textarea");
  api.setRemoteConfig({ dom: { aMessageSelector: ".legacy-message" } });
  api.setRemoteConfigGetFailure(true);

  await page.goto("/system-settings");
  await openSettingsTab(page, "remote-config");
  await expect(
    page
      .locator(".n-alert", { hasText: "远端配置读取失败" })
      .getByText("remote config load failed"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "保存远端配置" }),
  ).toBeDisabled();
  expect(api.remoteConfigGetCallCount()).toBe(1);

  api.setRemoteConfigGetFailure(false);
  await page
    .locator(".n-alert", { hasText: "远端配置读取失败" })
    .getByRole("button", { name: "重新读取" })
    .click();
  await expect(editor).toHaveValue(
    JSON.stringify({ dom: { aMessageSelector: ".legacy-message" } }, null, 2),
  );
  expect(api.remoteConfigGetCallCount()).toBe(2);
  expect(api.remoteConfigSaveCallCount()).toBe(0);

  const unsavedText = `{ "download": { "opfsThresholdBytes": 0 } }`;
  api.setRemoteConfigSaveFailure(true);
  await editor.fill(unsavedText);
  await page.getByRole("button", { name: "保存远端配置" }).click();
  await expect(
    page.locator(".n-message__content", { hasText: "remote config save failed" }),
  ).toBeVisible();
  await expect(editor).toHaveValue(unsavedText);
  expect(api.remoteConfigSaveCallCount()).toBe(1);
});
