/**
 * 订单管理 e2e。
 *
 * 覆盖：
 * - 菜单进入订单管理。
 * - 筛选提交订单号、用户 ID、当前邮箱、渠道订单号、流水 ID、状态、商品、支付方式。
 * - 重置、刷新、分页。
 * - 详情抽屉展示 JSON，支持复制订单号和流水 ID。
 * - 页面不出现订单变更类操作。
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
/** JSON 值。 */
type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** 订单行 mock。 */
interface AdminOrderMockData {
  /** 订单主键。 */
  id: number;
  /** 本地订单号。 */
  order_no: string;
  /** 用户 ID。 */
  user_id: number;
  /** 用户当前邮箱。 */
  user_email: string;
  /** 商品类别。 */
  product_class: number;
  /** 商品 ID。 */
  product_id: string;
  /** 商品名称。 */
  product_name: string;
  /** 归一化金额。 */
  amount: number;
  /** 币种。 */
  currency: string;
  /** 订单状态。 */
  order_status: 1 | 2 | 3 | 4 | 5;
  /** 回调状态。 */
  callback_status: 1 | 2 | 3 | 4 | 5;
  /** 支付方式。 */
  payment_method: string;
  /** 支付入口数据。 */
  payment_data: JsonValue | null;
  /** 渠道订单号。 */
  payment_channel_order_no: string;
  /** 支付交易流水 ID。 */
  payment_transaction_id: string;
  /** 渠道 UID。 */
  payment_channel_uid: string;
  /** 渠道实付归一化金额。 */
  paid_amount: number | null;
  /** 渠道币种。 */
  paid_currency: string;
  /** 创建时间。 */
  created_at: number;
  /** 更新时间。 */
  updated_at: number;
  /** 支付时间。 */
  paid_at: number | null;
  /** 过期时间。 */
  expired_at: number;
  /** 客户端 IP。 */
  client_ip: string;
  /** 扩展元数据。 */
  extra_metadata: JsonValue | null;
}

/** 订单列表 mock。 */
interface AdminOrderListMockData {
  /** 订单行。 */
  rows: AdminOrderMockData[];
  /** 总数。 */
  total: number;
  /** 页码。 */
  page: number;
  /** 每页数量。 */
  page_size: number;
}

/** dashboard mock。 */
interface DashboardMockData {
  /** 汇总。 */
  summary: Record<string, number>;
  /** mark type。 */
  mark_types: string[];
  /** 行。 */
  rows: string[];
}

/** 本文件 route.fulfill 可返回的数据联合。 */
type MockResponseData = AdminOrderMockData | AdminOrderListMockData | DashboardMockData;

/** 最近一次订单列表请求参数。 */
interface OrdersRequestParams {
  /** 页码。 */
  page: string | null;
  /** 每页数量。 */
  page_size: string | null;
  /** 订单号。 */
  order_no: string | null;
  /** 用户 ID。 */
  user_id: string | null;
  /** 邮箱。 */
  user_email: string | null;
  /** 渠道订单号。 */
  payment_channel_order_no: string | null;
  /** 支付交易流水 ID。 */
  payment_transaction_id: string | null;
  /** 订单状态。 */
  order_status: string | null;
  /** 回调状态。 */
  callback_status: string | null;
  /** 商品 ID。 */
  product_id: string | null;
  /** 支付方式。 */
  payment_method: string | null;
}

/** 后端统一成功响应。 */
function successResponse(data: MockResponseData) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 10000, data, msg: "success" }),
  };
}

/** 创建测试订单行。 */
function orderRow(partial: Partial<AdminOrderMockData>): AdminOrderMockData {
  return {
    id: 1,
    order_no: "ORD-ADMIN-001",
    user_id: 1001,
    user_email: "buyer@example.com",
    product_class: 1,
    product_id: "legacy-plan",
    product_name: "Legacy Plan",
    amount: 660_000_000,
    currency: "XTR",
    order_status: 2,
    callback_status: 3,
    payment_method: "legacy_pay",
    payment_data: { url: "https://t.me/invoice" },
    payment_channel_order_no: "CHANNEL-ORDER-001",
    payment_transaction_id: "TRANSACTION-001",
    payment_channel_uid: "CHANNEL-UID-001",
    paid_amount: 660_000_000,
    paid_currency: "XTR",
    created_at: 1780100000000,
    updated_at: 1780100100000,
    paid_at: 1780100200000,
    expired_at: 1780101800000,
    client_ip: "127.0.0.1",
    extra_metadata: { source: "e2e" },
    ...partial,
  };
}

/** 注入登录 Token 和布局依赖。 */
async function loginAsAdmin(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("admin_token", "mock-admin-jwt-token");
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

/** 注入跨浏览器剪贴板 stub。 */
async function mockClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value: string) {
          window.localStorage.setItem("e2e_clipboard_text", value);
        },
        async readText() {
          return window.localStorage.getItem("e2e_clipboard_text") ?? "";
        },
      },
    });
  });
}

/** mock 订单列表和详情接口。 */
async function mockOrdersApi(page: Page, requests: OrdersRequestParams[]) {
  const firstOrder = orderRow({});
  const secondOrder = orderRow({
    id: 2,
    order_no: "ORD-ADMIN-002",
    user_id: 1002,
    user_email: "second@example.com",
    product_id: "unlimited",
    product_name: "Unlimited",
    order_status: 1,
    callback_status: 1,
    payment_channel_order_no: "",
    payment_transaction_id: "",
    paid_amount: null,
    paid_currency: "",
    paid_at: null,
  });

  await page.route(/\/api\/admin\/orders(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    requests.push({
      page: url.searchParams.get("page"),
      page_size: url.searchParams.get("page_size"),
      order_no: url.searchParams.get("order_no"),
      user_id: url.searchParams.get("user_id"),
      user_email: url.searchParams.get("user_email"),
      payment_channel_order_no: url.searchParams.get("payment_channel_order_no"),
      payment_transaction_id: url.searchParams.get("payment_transaction_id"),
      order_status: url.searchParams.get("order_status"),
      callback_status: url.searchParams.get("callback_status"),
      product_id: url.searchParams.get("product_id"),
      payment_method: url.searchParams.get("payment_method"),
    });
    const pageNo = Number(url.searchParams.get("page") ?? "1");
    await route.fulfill(
      successResponse({
        rows: pageNo === 1 ? [firstOrder, secondOrder] : [secondOrder],
        total: 51,
        page: pageNo,
        page_size: Number(url.searchParams.get("page_size") ?? "50"),
      }),
    );
  });

  await page.route(/\/api\/admin\/orders\/ORD-ADMIN-001$/, async (route) => {
    await route.fulfill(successResponse(firstOrder));
  });
}

test("订单管理支持筛选、分页、详情和复制", async ({ page }) => {
  const requests: OrdersRequestParams[] = [];
  await mockClipboard(page);
  await loginAsAdmin(page);
  await mockOrdersApi(page, requests);

  await page.goto("/");
  await page.getByRole("menu").getByText("订单管理").click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.locator(".n-card-header__main")).toHaveCount(0);
  await expect(page.getByText("订单管理").first()).toBeVisible();
  await expect(page.getByText("ORD-ADMIN-001")).toBeVisible();
  await expect(page.getByText("[1001] buyer@example.com")).toBeVisible();
  await expect(page.getByText("legacy-plan").first()).toBeVisible();
  await expect(page.getByText("Legacy Plan")).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "支付时间 (+8)" }),
  ).toBeVisible();
  await expect(page.getByText("2026-05-30 08:16:40")).toBeVisible();
  const paidAtHeaderBox = await page
    .getByRole("columnheader", { name: "支付时间 (+8)" })
    .boundingBox();
  const orderStatusHeaderBox = await page
    .getByRole("columnheader", { name: "订单状态" })
    .boundingBox();
  if (!paidAtHeaderBox || !orderStatusHeaderBox) {
    throw new Error("订单列表支付时间或订单状态表头未渲染");
  }
  expect(paidAtHeaderBox.x).toBeLessThan(orderStatusHeaderBox.x);
  const orderNoLabelBox = await page
    .locator(".orders-filter .n-form-item-label")
    .filter({ hasText: "订单号" })
    .first()
    .boundingBox();
  const orderNoInputBox = await page.getByPlaceholder("本地订单号").boundingBox();
  if (!orderNoLabelBox || !orderNoInputBox) {
    throw new Error("订单筛选表单布局元素未渲染");
  }
  expect(orderNoInputBox.x).toBeGreaterThan(
    orderNoLabelBox.x + orderNoLabelBox.width,
  );
  expect(
    Math.abs(
      orderNoInputBox.y +
        orderNoInputBox.height / 2 -
        (orderNoLabelBox.y + orderNoLabelBox.height / 2),
    ),
  ).toBeLessThan(12);

  await page.getByPlaceholder("本地订单号").fill("ORD-ADMIN");
  await page.getByPlaceholder("用户 ID").fill("1001");
  await page.getByPlaceholder("用户当前邮箱").fill("buyer@example.com");
  await page.getByPlaceholder("支付渠道订单号").fill("CHANNEL");
  await page.getByPlaceholder("支付流水 ID").fill("TRANSACTION");
  await page.getByTestId("order-status-select").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByTestId("callback-status-select").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByPlaceholder("商品 ID").fill("legacy-plan");
  await page.getByPlaceholder("支付方式").fill("legacy_pay");
  await page.getByRole("button", { name: "搜索" }).click();

  await expect.poll(() => requests.at(-1)?.order_no).toBe("ORD-ADMIN");
  await expect.poll(() => requests.at(-1)?.user_id).toBe("1001");
  await expect.poll(() => requests.at(-1)?.user_email).toBe("buyer@example.com");
  await expect.poll(() => requests.at(-1)?.payment_channel_order_no).toBe("CHANNEL");
  await expect.poll(() => requests.at(-1)?.payment_transaction_id).toBe("TRANSACTION");
  await expect.poll(() => requests.at(-1)?.order_status).toBe("2");
  await expect.poll(() => requests.at(-1)?.callback_status).toBe("3");
  await expect.poll(() => requests.at(-1)?.product_id).toBe("legacy-plan");
  await expect.poll(() => requests.at(-1)?.payment_method).toBe("legacy_pay");

  await page.getByRole("button", { name: "重置" }).click();
  await expect.poll(() => requests.at(-1)?.order_no).toBeNull();
  await expect.poll(() => requests.at(-1)?.user_email).toBeNull();
  await expect.poll(() => requests.at(-1)?.payment_transaction_id).toBeNull();

  await page.getByRole("button", { name: "刷新" }).click();
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(4);

  await page.getByRole("row", { name: /ORD-ADMIN-001/ }).getByRole("button", { name: "查看" }).click();
  await expect(page.getByRole("heading", { name: "订单详情" })).toBeVisible();
  const detailDialog = page.getByRole("dialog");
  await expect(detailDialog.getByText("[1001] buyer@example.com")).toBeVisible();
  await expect(detailDialog.getByText("CHANNEL-ORDER-001")).toBeVisible();
  await expect(detailDialog.getByText("TRANSACTION-001")).toBeVisible();
  await expect(detailDialog.getByText('"source": "e2e"')).toBeVisible();

  await page.getByRole("button", { name: "复制订单号" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    "ORD-ADMIN-001",
  );

  await page.getByRole("button", { name: "复制流水 ID" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    "TRANSACTION-001",
  );

  await page.keyboard.press("Escape");
  await page.locator(".n-pagination").getByText("2", { exact: true }).click();
  await expect.poll(() => requests.at(-1)?.page).toBe("2");

  await expect(page.getByRole("button", { name: "退款" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "取消订单" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "修改状态" })).toHaveCount(0);
});
