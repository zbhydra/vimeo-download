/** 数据分析真实后端验收；本轮临时 JWT 和含 USD/XTR 的订单由执行方准备并清理。 */
import { expect, test, type APIResponse, type Page, type Response } from "@playwright/test";
import { registerE2eBrowserIdentity } from "../../scripts/playwright-browser-identity.mjs";
import type {
  DailyRechargeData,
  OrderAnalyticsCurrencyAmount,
  PeriodRechargeData,
  RechargePeriod,
} from "../src/api/analytics";

registerE2eBrowserIdentity(test);
test.use({ timezoneId: "Asia/Shanghai", viewport: { width: 1280, height: 800 } });

interface AdminEnvelope<T> {
  code: number;
  data: T;
  msg: string;
}

const DAY_MS = 86_400_000;

/** 只接收真实签发的临时账号 JWT；缺少验收资源直接失败。 */
function accessToken(): string {
  const token = process.env.E2E_ADMIN_ACCESS_TOKEN;
  if (!token) throw new Error("analytics.spec: 缺少本地真实管理员 E2E_ADMIN_ACCESS_TOKEN");
  return token;
}

/** 通过本地 Vite 代理观察真实 API，不拦截请求。 */
function waitForAnalytics(page: Page, endpoint: string, period?: RechargePeriod) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === "http://127.0.0.1:7920" &&
      url.pathname === `/api/admin/${endpoint}` &&
      (!period || url.searchParams.get("period") === period);
  });
}

/** 同时检查 HTTP 状态、业务码与实际请求入口。 */
async function readData<T>(response: Response | APIResponse): Promise<T> {
  expect(response.url()).toMatch(/^http:\/\/127\.0\.0\.1:7920\/api\/admin\//);
  expect(response.status()).toBe(200);
  const body: AdminEnvelope<T> = await response.json();
  expect(body.code, body.msg).toBe(10000);
  return body.data;
}

/** 注入真实 JWT 并核实默认标签页确实经过本地后端。 */
async function openAnalytics(page: Page) {
  await page.addInitScript((token) => localStorage.setItem("admin_token", token), accessToken());
  const initial = waitForAnalytics(page, "download-analytics/resource-distribution");
  await page.goto("/analytics");
  await readData(await initial);
}

/** 操作与断言仅指向当前可见面板。 */
function currentPane(page: Page) {
  return page.locator(".n-tab-pane:visible");
}

async function switchPeriod(page: Page, period: RechargePeriod) {
  await page.locator(".n-tabs-nav").getByText(period === "week" ? "每周充值统计" : "每月充值统计", { exact: true }).click();
  await expect(currentPane(page)).toHaveCount(1);
}

/** 沿真实输入控件修改时间，保留管理员手动输入能力。 */
async function setRange(page: Page, start: string, end: string) {
  const pane = currentPane(page);
  const startInput = pane.getByRole("textbox", { name: "Start Date and Time" });
  const endInput = pane.getByRole("textbox", { name: "End Date and Time" });
  await startInput.fill(start);
  await startInput.press("Tab");
  await endInput.fill(end);
  await endInput.press("Tab");
  await page.getByRole("heading", { name: "数据分析", exact: true }).click();
  await expect(startInput).toHaveValue(start);
  await expect(endInput).toHaveValue(end);
}

function amountText(amounts: OrderAnalyticsCurrencyAmount[]): string {
  return amounts.map((amount) => `${amount.display_amount} ${amount.currency}`).join(", ");
}

test("每日初始与重新选日覆盖整天，仍可修改时分秒", async ({ page }) => {
  await openAnalytics(page);
  const first = waitForAnalytics(page, "order-analytics/daily-recharge");
  await page.locator(".n-tabs-nav").getByText("每日充值(+8)", { exact: true }).click();
  const response = await first;
  await readData<DailyRechargeData>(response);
  const pane = currentPane(page);
  const inputs = pane.getByRole("textbox");
  const today = (await inputs.nth(1).inputValue()).slice(0, 10);
  const todayStart = Date.parse(`${today}T00:00:00+08:00`);
  const params = new URL(response.url()).searchParams;
  expect(Number(params.get("from_ms"))).toBe(todayStart - 6 * DAY_MS);
  expect(Number(params.get("to_ms"))).toBe(todayStart + DAY_MS - 1);
  await expect(inputs.nth(0)).toHaveValue(/ 00:00:00$/);
  await expect(inputs.nth(1)).toHaveValue(/ 23:59:59$/);

  const seedDate = process.env.E2E_ANALYTICS_SEED_DATE;
  if (!seedDate) throw new Error("analytics.spec: 缺少含最后一秒订单的 E2E_ANALYTICS_SEED_DATE");
  await inputs.nth(0).click();
  await page.locator(".n-date-panel").getByRole("button", { name: "Clear", exact: true }).click();
  await inputs.nth(0).click();
  const panel = page.locator(".n-date-panel");
  const day = panel.locator(".n-date-panel-date:not(.n-date-panel-date--excluded)")
    .filter({ hasText: new RegExp(`^${Number(seedDate.slice(8))}$`) }).first();
  await day.click();
  await day.click();
  await expect(panel.getByPlaceholder("Select Time").nth(0)).toHaveValue("00:00:00");
  await expect(panel.getByPlaceholder("Select Time").nth(1)).toHaveValue("23:59:59");
  await panel.getByRole("button", { name: "Confirm", exact: true }).click();
  const selected = waitForAnalytics(page, "order-analytics/daily-recharge");
  await pane.getByRole("button", { name: "查询", exact: true }).click();
  const selectedResponse = await selected;
  const selectedData = await readData<DailyRechargeData>(selectedResponse);
  const selectedParams = new URL(selectedResponse.url()).searchParams;
  const seedStart = Date.parse(`${seedDate}T00:00:00+08:00`);
  expect(Number(selectedParams.get("from_ms"))).toBe(seedStart);
  expect(Number(selectedParams.get("to_ms"))).toBe(seedStart + DAY_MS - 1);
  const seededRow = selectedData.rows.find((row) => row.date === seedDate);
  expect(seededRow?.success_count).toBeGreaterThanOrEqual(2);
  expect(seededRow?.success_amounts.find((amount) => amount.currency === "XTR")?.amount).toBeGreaterThanOrEqual(3_000_000);

  await setRange(page, `${seedDate} 12:00:00`, `${seedDate} 13:00:00`);
  const manual = waitForAnalytics(page, "order-analytics/daily-recharge");
  await pane.getByRole("button", { name: "查询", exact: true }).click();
  const manualResponse = await manual;
  await readData<DailyRechargeData>(manualResponse);
  const manualParams = new URL(manualResponse.url()).searchParams;
  expect(Number(manualParams.get("from_ms"))).toBe(seedStart + 12 * 3_600_000);
  expect(Number(manualParams.get("to_ms"))).toBe(seedStart + 13 * 3_600_000);
});

test("桌面周/月汇总与每日一致，筛选独立并显示跨年日期", async ({ page, request }, testInfo) => {
  await openAnalytics(page);
  for (const period of ["week", "month"] as const) {
    const first = waitForAnalytics(page, "order-analytics/period-recharge", period);
    await switchPeriod(page, period);
    const response = await first;
    const data = await readData<PeriodRechargeData>(response);
    expect(data.rows.length).toBeGreaterThan(0);
    const params = new URL(response.url()).searchParams;
    const from = Number(params.get("from_ms"));
    const to = Number(params.get("to_ms"));
    const today = new Date(to + 8 * 3_600_000);
    const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - 8 * 3_600_000;
    const expectedStart = period === "week"
      ? todayStart - (((today.getUTCDay() + 6) % 7) + 21) * DAY_MS
      : Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1) - 8 * 3_600_000;
    expect(from).toBe(expectedStart);
    expect(to).toBe(todayStart + DAY_MS - 1);

    const daily = await readData<DailyRechargeData>(await request.get("/api/admin/order-analytics/daily-recharge", {
      params: { from_ms: from, to_ms: Math.min(to, Date.now()) },
      headers: { Authorization: `Bearer ${accessToken()}` },
    }));
    expect(data.rows.reduce((count, row) => count + row.count, 0)).toBe(daily.rows.reduce((count, row) => count + row.success_count, 0));
    const dailyAmounts: Record<string, number> = {};
    const periodAmounts: Record<string, number> = {};
    for (const row of daily.rows) {
      for (const amount of row.success_amounts) dailyAmounts[amount.currency] = (dailyAmounts[amount.currency] ?? 0) + amount.amount;
    }
    for (const row of data.rows) {
      expect(row.day_count).toBe((Date.parse(row.end_date) - Date.parse(row.start_date)) / DAY_MS + 1);
      for (const amount of row.amounts) {
        periodAmounts[amount.currency] = (periodAmounts[amount.currency] ?? 0) + amount.amount;
        expect(row.daily_average_amounts.find((average) => average.currency === amount.currency)?.amount).toBe(Math.floor(amount.amount / row.day_count + 0.5));
      }
    }
    expect(periodAmounts).toEqual(dailyAmounts);
    expect(Object.keys(periodAmounts)).toEqual(expect.arrayContaining(["USD", "XTR"]));
    const pane = currentPane(page);
    const row = data.rows[0]!;
    const label = period === "month" ? `${row.start_date} ~ ${row.end_date}` : `${row.start_date.slice(5)} ~ ${row.end_date.slice(5)}`;
    const tableRow = pane.locator("tr").filter({ hasText: label });
    await expect(tableRow.locator('td[data-col-key="count"]')).toHaveText(String(row.count));
    await expect(tableRow.locator('td[data-col-key="amounts"]')).toHaveText(amountText(row.amounts));
    await expect(tableRow.locator('td[data-col-key="daily_average_amounts"]')).toHaveText(amountText(row.daily_average_amounts));
    const refresh = waitForAnalytics(page, "order-analytics/period-recharge", period);
    await pane.getByRole("button", { name: "刷新", exact: true }).click();
    expect(await readData<PeriodRechargeData>(await refresh)).toEqual(data);
    await page.screenshot({ path: testInfo.outputPath(`${period}-desktop.png`), fullPage: true });
  }

  await switchPeriod(page, "week");
  await setRange(page, "2024-12-31 00:00:00", "2025-01-12 23:59:59");
  const crossYear = waitForAnalytics(page, "order-analytics/period-recharge", "week");
  await currentPane(page).getByRole("button", { name: "查询", exact: true }).click();
  await readData<PeriodRechargeData>(await crossYear);
  await expect(currentPane(page).locator('td[data-col-key="start_date"]').filter({ hasText: "2024-12-31 ~ 2025-01-05" })).toHaveCount(1);
  await switchPeriod(page, "month");
  await expect(currentPane(page).getByRole("textbox").nth(0)).not.toHaveValue("2024-12-31 00:00:00");
  await switchPeriod(page, "week");
  await expect(currentPane(page).getByRole("textbox").nth(0)).toHaveValue("2024-12-31 00:00:00");
  await setRange(page, "2400-01-01 00:00:00", "2400-01-02 23:59:59");
  const empty = waitForAnalytics(page, "order-analytics/period-recharge", "week");
  await currentPane(page).getByRole("button", { name: "查询", exact: true }).click();
  expect((await readData<PeriodRechargeData>(await empty)).rows).toEqual([]);
  await expect(currentPane(page).getByText("暂无数据").last()).toBeVisible();
});

test("手机周/月复用全部统计列，页面无横向溢出", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAnalytics(page);
  for (const period of ["week", "month"] as const) {
    const first = waitForAnalytics(page, "order-analytics/period-recharge", period);
    await switchPeriod(page, period);
    const data = await readData<PeriodRechargeData>(await first);
    const pane = currentPane(page);
    const row = data.rows[0]!;
    const card = pane.locator(".record-card").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(period === "week" ? "周平均每日金额" : "月平均每日金额");
    await expect(card).toContainText(amountText(row.amounts));
    await expect(card).toContainText(amountText(row.daily_average_amounts));
    await expect(card.locator(".record-card__field").filter({ hasText: "总笔数" }).locator(".record-card__value")).toHaveText(String(row.count));
    const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, body: document.body.scrollWidth - innerWidth }));
    expect(overflow.doc).toBeLessThanOrEqual(1);
    expect(overflow.body).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`${period}-mobile.png`), fullPage: true });
  }
});
