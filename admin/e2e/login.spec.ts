/**
 * Admin 登录流程 e2e
 *
 * 覆盖：
 * - 登录页表单渲染（用户名、密码、验证码输入框 + 登录按钮）
 * - 表单验证（必填拦截）
 * - 验证码图片渲染 + 点击刷新
 * - 登录成功 → Token 存储 → 跳转 Dashboard
 * - 登录失败 → 错误提示 → 验证码刷新
 * - 路由守卫：已登录访问 /login → 重定向首页
 * - 路由守卫：未登录访问 / → 重定向登录页
 */
import { expect, test, type Page } from "@playwright/test";
import { registerE2eBrowserIdentity } from "../../scripts/playwright-browser-identity.mjs";

registerE2eBrowserIdentity(test);

const CAPTCHA_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAHgAAAAoCAMAAAACNM4XAAADAFBMVEUAAAABAQECAgIDAwMEBAQFBQUGBgYHBwcICAgJCQkKCgoLCwsMDAwNDQ0ODg4PDw8QEBARERESEhITExMUFBQVFRUWFhYXFxcYGBgZGRkaGhobGxscHBwdHR0eHh4fHx8gICAhISEiIiIjIyMkJCQlJSUmJiYnJycoKCgpKSkqKiorKyssLCwtLS0uLi4vLy8wMDAxMTEyMjIzMzM0NDQ1NTU2NjY3Nzc4ODg5OTk6Ojo7Ozs8PDw9PT0+Pj4/Pz9AQEBBQUFCQkJDQ0NERERFRUVGRkZHR0dISEhJSUlKSkpLS0tMTExNTU1OTk5PT09QUFBRUVFSUlJTU1NUVFRVVVVWVlZXV1dYWFhZWVlaWlpbW1tcXFxdXV1eXl5fX19gYGBhYWFiYmJjY2NkZGRlZWVmZmZnZ2doaGhpaWlqampra2tsbGxtbW1ubm5vb29wcHBxcXFycnJzc3N0dHR1dXV2dnZ3d3d4eHh5eXl6enp7e3t8fHx9fX1+fn5/f3+AgICBgYGCgoKDg4OEhISFhYWGhoaHh4eIiIiJiYmKioqLi4uMjIyNjY2Ojo6Pj4+QkJCRkZGSkpKTk5OUlJSVlZWWlpaXl5eYmJiZmZmampqbm5ucnJydnZ2enp6fn5+goKChoaGioqKjo6OkpKSlpaWmpqanp6eoqKipqamqqqqrq6usrKytra2urq6vr6+wsLCxsbGysrKzs7O0tLS1tbW2tra3t7e4uLi5ubm6urq7u7u8vLy9vb2+vr6/v7/AwMDBwcHCwsLDw8PExMTFxcXGxsbHx8fIyMjJycnKysrLy8vMzMzNzc3Ozs7Pz8/Q0NDR0dHS0tLT09PU1NTV1dXW1tbX19fY2NjZ2dna2trb29vc3Nzd3d3e3t7f39/g4ODh4eHi4uLj4+Pk5OTl5eXm5ubn5+fo6Ojp6enq6urr6+vs7Ozt7e3u7u7v7+/w8PDx8fHy8vLz8/P09PT19fX29vb39/f4+Pj5+fn6+vr7+/v8/Pz9/f3+/v7////isF19AAAAw0lEQVR42u3W3Q6AIAgF4PP+L01bay3xoJKwusCrfswvCTHIRw0FF1xwwYEwzqZO1cXrhvnQBgwGQ3Xr+2TBKhCzoLhgDGGw0OKFzGFRo+pJtsh9mAVLA7Rw/929MBZhyYCNwZ6R5kg4rFIHBrKT1RjDQ2VrHTeJO1rHwipZIgwTdtZM8OoB9G+gxp5GfgMGq8lc8rpRsNsVOz8IjLXZv4TZimbZFbpJLMCSAdMdd76OEQJ3p/PKhZj9uH5vCy644L/DB5tYDtOQeV9WAAAAAElFTkSuQmCC";

/** 后端统一成功响应 */
function successResponse(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 10000, data, msg: "success" }),
  };
}

/** 后端错误响应 */
function errorResponse(code: number, msg: string) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code, data: null, msg }),
  };
}

/** mock 验证码接口 */
async function mockCaptcha(page: Page) {
  await page.route("**/api/admin/auth/captcha", async (route) => {
    await route.fulfill(
      successResponse({
        captcha_id: "test-captcha-id-001",
        image_base64: CAPTCHA_IMAGE_BASE64,
      }),
    );
  });
}

/** mock 登录成功 */
async function mockLoginSuccess(page: Page) {
  await page.route("**/api/admin/auth/login", async (route) => {
    await route.fulfill(
      successResponse({
        access_token: "mock-admin-jwt-token-001",
        refresh_token: "mock-admin-refresh-token-001",
        expires_in: 604800,
        refresh_expires_in: 2678400,
      }),
    );
  });
}

/** mock 登录失败 */
async function mockLoginFail(page: Page, msg = "账号或密码错误") {
  await page.route("**/api/admin/auth/login", async (route) => {
    await route.fulfill(errorResponse(30001, msg));
  });
}

/** mock dashboard 接口 */
async function mockDashboard(page: Page) {
  await page.route("**/api/admin/dashboard", async (route) => {
    await route.fulfill(
      successResponse({
        summary: {
          total_users: 1024,
          new_users: 42,
          active_users_24h: 88,
          active_users_7d: 320,
        },
        mark_types: ["web_parse_click", "web_download_start"],
        rows: [
          {
            date_label: "2026-06-01",
            registered_count: 10,
            metrics: {
              web_parse_click: { event_count: 100, device_count: 80 },
              web_download_start: { event_count: 30, device_count: 20 },
            },
          },
        ],
      }),
    );
  });
}

/** mock token 刷新 */
async function mockRefresh(page: Page) {
  await page.route("**/api/admin/auth/refresh", async (route) => {
    await route.fulfill(
      successResponse({
        access_token: "mock-admin-jwt-token-refreshed",
        refresh_token: "mock-admin-refresh-token-refreshed",
        expires_in: 604800,
        refresh_expires_in: 2678400,
      }),
    );
  });
}

// ========== 测试 ==========

test.describe("登录页渲染", () => {
  test("表单所有元素可见：标题、用户名、密码、验证码输入框、验证码图片、登录按钮", async ({
    page,
  }) => {
    await mockCaptcha(page);
    await page.goto("/login");

    // 标题
    await expect(page.getByText("管理员登录")).toBeVisible();

    // 用户名输入框
    const usernameInput = page.locator('input[placeholder="用户名"]');
    await expect(usernameInput).toBeVisible();

    // 密码输入框
    const passwordInput = page.locator('input[placeholder="密码"]');
    await expect(passwordInput).toBeVisible();

    // 验证码输入框
    const captchaInput = page.locator('input[placeholder="请输入验证码"]');
    await expect(captchaInput).toBeVisible();

    // 验证码图片
    const captchaImg = page.locator(".captcha-img img");
    await expect(captchaImg).toBeVisible();
    await expect(page.locator(".captcha-img")).toHaveCSS("height", "40px");

    // 登录按钮
    const submitBtn = page.getByRole("button", { name: "登 录" });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });

  test("点击验证码图片刷新验证码", async ({ page }) => {
    let captchaCallCount = 0;
    await page.route("**/api/admin/auth/captcha", async (route) => {
      captchaCallCount++;
      await route.fulfill(
        successResponse({
          captcha_id: `captcha-${captchaCallCount}`,
          image_base64: CAPTCHA_IMAGE_BASE64,
        }),
      );
    });

    await page.goto("/login");
    await expect(page.locator(".captcha-img img")).toBeVisible();
    expect(captchaCallCount).toBe(1);

    // 点击验证码图片触发刷新
    await page.locator(".captcha-img").click();
    await page.waitForResponse("**/api/admin/auth/captcha");
    expect(captchaCallCount).toBe(2);
  });
});

test.describe("表单验证", () => {
  test("不填写任何内容直接提交，仍在登录页", async ({ page }) => {
    await mockCaptcha(page);
    await page.goto("/login");

    // 直接点击登录
    await page.getByRole("button", { name: "登 录" }).click();

    // 仍然在登录页（表单校验失败阻止了提交）
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("登录成功流程", () => {
  test("填写表单并登录成功 → 跳转 Dashboard → Token 写入 localStorage", async ({
    page,
  }) => {
    await mockCaptcha(page);
    await mockLoginSuccess(page);
    await mockDashboard(page);

    await page.goto("/login");

    // 填写表单
    await page.locator('input[placeholder="用户名"]').fill("hydra");
    await page.locator('input[placeholder="密码"]').fill("Hydra123$");
    await page.locator('input[placeholder="请输入验证码"]').fill("1234");

    // 点击登录
    await page.getByRole("button", { name: "登 录" }).click();

    // 等待跳转到 Dashboard
    await expect(page).toHaveURL("/", { timeout: 5000 });

    // Token 写入 localStorage
    const token = await page.evaluate(() =>
      window.localStorage.getItem("admin_token"),
    );
    const refreshToken = await page.evaluate(() =>
      window.localStorage.getItem("admin_refresh_token"),
    );
    expect(token).toBe("mock-admin-jwt-token-001");
    expect(refreshToken).toBe("mock-admin-refresh-token-001");
  });

  test("登录成功后刷新页面保持登录态（Token 在 localStorage）", async ({
    page,
  }) => {
    await mockCaptcha(page);
    await mockLoginSuccess(page);
    await mockDashboard(page);

    await page.goto("/login");
    await page.locator('input[placeholder="用户名"]').fill("hydra");
    await page.locator('input[placeholder="密码"]').fill("Hydra123$");
    await page.locator('input[placeholder="请输入验证码"]').fill("1234");
    await page.getByRole("button", { name: "登 录" }).click();
    await expect(page).toHaveURL("/", { timeout: 5000 });

    // 刷新页面
    await page.reload();
    await expect(page).toHaveURL("/");
    // Dashboard 数据仍可见
    await expect(page.getByText("1024")).toBeVisible();
  });

  test("Access Token 过期后使用 Refresh Token 续签并重试 Dashboard", async ({
    page,
  }) => {
    let dashboardCallCount = 0;
    const dashboardRetryHeaders: Array<string | undefined> = [];
    await mockRefresh(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("admin_token", "expired-admin-jwt-token");
      window.localStorage.setItem("admin_refresh_token", "valid-admin-refresh-token");
    });
    await page.route("**/api/admin/dashboard", async (route) => {
      dashboardCallCount++;
      dashboardRetryHeaders.push(route.request().headers()["x-admin-auth-retry"]);
      if (dashboardCallCount === 1) {
        await route.fulfill({ status: 401, body: "" });
        return;
      }
      await route.fulfill(
        successResponse({
          summary: {
            total_users: 2048,
            new_users: 64,
            active_users_24h: 120,
            active_users_7d: 512,
          },
          mark_types: ["web_first_opened"],
          rows: [],
        }),
      );
    });

    await page.goto("/");
    await expect(page.getByText("2048")).toBeVisible();
    expect(dashboardCallCount).toBe(2);
    expect(dashboardRetryHeaders).toEqual([undefined, undefined]);
    const token = await page.evaluate(() =>
      window.localStorage.getItem("admin_token"),
    );
    const refreshToken = await page.evaluate(() =>
      window.localStorage.getItem("admin_refresh_token"),
    );
    expect(token).toBe("mock-admin-jwt-token-refreshed");
    expect(refreshToken).toBe("mock-admin-refresh-token-refreshed");
  });

  test("Access Token 过期且没有 Refresh Token → 清理登录态并跳转登录页", async ({
    page,
  }) => {
    await mockCaptcha(page);
    await page.route("**/api/admin/dashboard", async (route) => {
      await route.fulfill({ status: 401, body: "" });
    });

    await page.goto("/login");
    await page.evaluate(() => {
      window.localStorage.setItem("admin_token", "expired-admin-jwt-token");
      window.localStorage.removeItem("admin_refresh_token");
    });
    await page.goto("/");

    await expect(page).toHaveURL(/\/login\?redirect=%2F/, { timeout: 5000 });
    const token = await page.evaluate(() =>
      window.localStorage.getItem("admin_token"),
    );
    const refreshToken = await page.evaluate(() =>
      window.localStorage.getItem("admin_refresh_token"),
    );
    expect(token).toBeNull();
    expect(refreshToken).toBeNull();
  });
});

test.describe("登录失败流程", () => {
  test("错误凭证 → 显示错误提示 → 验证码刷新", async ({ page }) => {
    let captchaCallCount = 0;
    await page.route("**/api/admin/auth/captcha", async (route) => {
      captchaCallCount++;
      await route.fulfill(
        successResponse({
          captcha_id: `captcha-${captchaCallCount}`,
          image_base64: CAPTCHA_IMAGE_BASE64,
        }),
      );
    });
    await mockLoginFail(page);

    await page.goto("/login");

    // 等待验证码加载完成
    await expect(page.locator(".captcha-img img")).toBeVisible();

    await page.locator('input[placeholder="用户名"]').fill("wrong");
    await page.locator('input[placeholder="密码"]').fill("wrong");
    await page.locator('input[placeholder="请输入验证码"]').fill("0000");
    await page.getByRole("button", { name: "登 录" }).click();

    // 错误提示 Toast
    await expect(page.getByText("账号或密码错误")).toBeVisible();

    // 验证码自动刷新（多等一次 captcha 请求）
    await page.waitForResponse("**/api/admin/auth/captcha");

    // 仍在登录页
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("路由守卫", () => {
  test("未登录访问 / → 重定向到 /login", async ({ page }) => {
    await mockCaptcha(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("未登录访问 /service-nodes → 重定向到 /login（带 redirect 参数）", async ({
    page,
  }) => {
    await mockCaptcha(page);
    await page.goto("/service-nodes");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    await expect(page).toHaveURL(/redirect=\/service-nodes/);
  });

  test("已登录访问 /login → 重定向到 /", async ({ page }) => {
    await mockCaptcha(page);
    await mockLoginSuccess(page);
    await mockDashboard(page);

    // 先登录
    await page.goto("/login");
    await page.locator('input[placeholder="用户名"]').fill("hydra");
    await page.locator('input[placeholder="密码"]').fill("Hydra123$");
    await page.locator('input[placeholder="请输入验证码"]').fill("1234");
    await page.getByRole("button", { name: "登 录" }).click();
    await expect(page).toHaveURL("/", { timeout: 5000 });

    // 再访问 /login → 自动跳回首页
    await page.goto("/login");
    await expect(page).toHaveURL("/", { timeout: 5000 });
  });
});
