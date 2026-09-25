/**
 * 数据分析 e2e。
 *
 * 覆盖：
 * - 每日充值(+8) tab 请求订单统计接口并展示多币种金额。
 * - 商品统计(+8) tab 请求订单统计接口并展示商品 ID 维度。
 */
import { expect, test, type Page } from "@playwright/test";
import { registerE2eBrowserIdentity } from "../../scripts/playwright-browser-identity.mjs";

registerE2eBrowserIdentity(test);

/** JSON 原子值。 */
type JsonPrimitive = string | number | boolean | null;

/** JSON 对象。 */
interface JsonObject {
  /** JSON 字段值。 */
  [key: string]: JsonValue;
}

/** JSON 数组。 */
type JsonArray = JsonValue[];

/** route.fulfill 可序列化 JSON 值。 */
type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** 后端统一成功响应。 */
function successResponse(data: JsonObject) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 10000, data, msg: "success" }),
  };
}

/** 注入登录 Token。 */
async function loginAsAdmin(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("admin_token", "mock-admin-jwt-token");
  });
}

/** mock 数据分析页首次加载的下载资源分析接口。 */
async function mockInitialResourceAnalytics(page: Page) {
  await page.route(
    "**/api/admin/download-analytics/resource-distribution**",
    async (route) => {
      await route.fulfill(
        successResponse({
          buckets: [
            { key: "le_1m", label: "≤ 1 MB", paid_count: 0, total_count: 0 },
          ],
        }),
      );
    },
  );
}

test("analytics order tabs render daily recharge and product statistics", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await mockInitialResourceAnalytics(page);

  await page.route("**/api/admin/order-analytics/daily-recharge**", async (route) => {
    await route.fulfill(
      successResponse({
        rows: [
          {
            date: "2026-07-08",
            success_count: 2,
            success_amounts: [
              { currency: "XTR", amount: 12_000_000, display_amount: "12" },
              { currency: "USD", amount: 15_300_000, display_amount: "15.3" },
            ],
            total_count: 3,
            total_amounts: [
              { currency: "XTR", amount: 12_000_000, display_amount: "12" },
              { currency: "USD", amount: 30_600_000, display_amount: "30.6" },
            ],
          },
        ],
      }),
    );
  });

  await page.route("**/api/admin/order-analytics/product-statistics**", async (route) => {
    await route.fulfill(
      successResponse({
        rows: [
          {
            date: "2026-07-08",
            product_id: "credits-100",
            success_count: 2,
            success_amounts: [
              { currency: "USD", amount: 1_500_000, display_amount: "1.5" },
              { currency: "XTR", amount: 10_000_000, display_amount: "10" },
            ],
            total_count: 3,
            total_amounts: [
              { currency: "USD", amount: 1_500_000, display_amount: "1.5" },
              { currency: "XTR", amount: 15_000_000, display_amount: "15" },
            ],
          },
        ],
      }),
    );
  });

  await page.goto("/analytics");

  await page.locator(".n-tabs-nav").getByText("每日充值(+8)", { exact: true }).click();
  await expect(page.locator('td[data-col-key="date"]').filter({ hasText: "2026-07-08(周三)" })).toHaveCount(1);
  await expect(page.getByText("12 XTR, 15.3 USD")).toBeVisible();
  await expect(page.getByText("12 XTR, 30.6 USD")).toBeVisible();

  await page.locator(".n-tabs-nav").getByText("商品统计(+8)", { exact: true }).click();
  await expect(page.locator('td[data-col-key="date"]').filter({ hasText: "2026-07-08(周三)" })).toHaveCount(2);
  await expect(page.getByText("credits-100")).toBeVisible();
  await expect(page.getByText("1.5 USD, 10 XTR")).toBeVisible();
  await expect(page.getByText("1.5 USD, 15 XTR")).toBeVisible();
});
