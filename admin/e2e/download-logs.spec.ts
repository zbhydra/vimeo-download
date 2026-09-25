/**
 * 下载详情 e2e。
 *
 * 覆盖存储预检阻断、自动 GET 降级状态和紧凑 payload 解析结果。
 */
import { expect, test, type Page } from "@playwright/test";
import { registerE2eBrowserIdentity } from "../../scripts/playwright-browser-identity.mjs";

registerE2eBrowserIdentity(test);

/** 注入管理员登录态。 */
async function loginAsAdmin(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("admin_token", "mock-admin-jwt-token");
  });
}

test("download logs renders storage preflight outcomes", async ({ page }) => {
  await loginAsAdmin(page);
  await page.route("**/api/admin/mark-logs/web-downloads**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 10000,
        data: {
          rows: [
            {
              log_id: 1031,
              user_id: 42,
              mark_type: "web_download_storage_preflight_blocked",
              status: "preflight_blocked",
              platform: "vimeo",
              url: "https://vimeo.com/1031",
              file_size: 2_238_550_410,
              filename: "",
              node_id: "",
              retry_count: null,
              error_message: "原因: insufficient_storage",
              mark_time: 1_788_000_000_000,
            },
            {
              log_id: 1032,
              user_id: 43,
              mark_type: "web_download_storage_preflight_fallback",
              status: "preflight_fallback",
              platform: "vimeo",
              url: "https://vimeo.com/1032",
              file_size: 734_003_200,
              filename: "",
              node_id: "",
              retry_count: null,
              error_message: "原因: insufficient_storage",
              mark_time: 1_788_000_000_001,
            },
          ],
          total: 2,
          page: 1,
          page_size: 50,
        },
        msg: "success",
      }),
    });
  });

  await page.goto("/download-logs");

  await expect(page.getByText("存储预检阻断")).toBeVisible();
  await expect(page.getByText("存储预检降级 GET")).toBeVisible();
  await expect(page.getByText("https://vimeo.com/1031")).toBeVisible();
  await expect(page.getByText("https://vimeo.com/1032")).toBeVisible();
  await expect(page.getByText("2.1 GB")).toBeVisible();
  await expect(page.getByText("原因: insufficient_storage").first()).toBeVisible();
});
