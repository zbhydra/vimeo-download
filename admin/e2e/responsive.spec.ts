/**
 * Admin 响应式收口 e2e（真实后端，tech-视觉基线 §4.3）
 *
 * 与既有 spec 的 page.route mock 架构不同：本 spec 禁止 mock，
 * 全部 API 请求走 vite proxy → 本地真实后端（localhost:7900，vite.config.ts proxy target）。
 *
 * 登录方式：
 * - 用例 1（桌面 1280）走真实登录表单：页面请求 /api/admin/auth/captcha 后，
 *   通过 waitForResponse 观察（非拦截）拿到 captcha_id，再从本地 Redis 读取验证码文本
 *   （key: <key_prefix>:admin:captcha:<captcha_id>，约定见
 *   backend/src/app/services/captcha_service.py），替代人工识图；
 *   提交后由真实后端完成验证码校验 + bcrypt 校验并签发 JWT——不伪造任何 API 响应。
 * - 其余用例复用该真实 JWT 注入 localStorage 进入登录态（与 website smoke 的
 *   token 注入方式一致，见 docs/references/specs/spec-test-client.md §2.2）。
 *
 * 管理员账号从 E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD 读取（临时账号，跑测后清理）。
 * 数据准备：beforeAll 用真实 API 按名查询停用态临时服务节点，存在则复用、不存在才创建
 * （避免空表干扰表格断言，name 无唯一约束、复用消除多轮运行残留累积），
 * afterAll 真实 API 停用（无删除接口，物理删除由执行方按惯例清理 DB 并复查）。
 *
 * 断言口径：
 * - 布局壳无横向溢出：documentElement / body 的 scrollWidth ≤ 视口宽 + 1px 舍入容差；
 * - 平板/桌面横滚发生在表格容器内：.n-data-table 子树内存在 scrollWidth > clientWidth 的
 *   滚动容器（即只有表格内部出现横滚，壳不再溢出）；
 * - 手机（390）表格记录卡片化（tech-视觉基线 §4.2）：不再断言表格内横滚，改为断言
 *   .record-card 记录卡片可见且布局壳无横向溢出；
 * - 平板（820）：侧栏走 NLayoutSider 折叠态——宽 64px（collapsed-width）、
 *   存在 n-layout-sider--collapsed / n-menu--collapsed 折叠类（cssr cM('collapsed')）、
 *   无 n-layout-toggle-button 手动触发钮（show-trigger=!isTablet）；
 * - 手机（390）：汉堡可见 → 抽屉可开 → 分组标签可见 → 选中菜单项后 URL 变化且抽屉收起；
 * - 订单详情抽屉（390/820）：可开、宽度不超视口、可关闭。
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import net from "node:net";
import { registerE2eBrowserIdentity } from "../../scripts/playwright-browser-identity.mjs";

registerE2eBrowserIdentity(test);

/** Redis 连接与 key 前缀（backend/config.yaml redis.*，本机开发配置） */
const REDIS_HOST = "127.0.0.1";
const REDIS_PORT = 6379;
const REDIS_KEY_PREFIX = "vimeo-video-downloader";

/** 临时服务节点标识（跑测后由执行方从 DB 清理并复查） */
const TEMP_NODE_NAME = "e2e-responsive-tmp";

/** 验收视口（tech-视觉基线 §4.3） */
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
} as const;

/** 后端统一响应信封 */
interface AdminEnvelope<T> {
  code: number;
  data: T | null;
  msg: string;
}

/** 临时账号凭据（env 注入，缺省直接失败，不猜测真实账号） */
function adminCredentials(): { username: string; password: string } {
  const username = process.env.E2E_ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "responsive.spec 走真实后端登录：请设置 E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD",
    );
  }
  return { username, password };
}

/** 最小 RESP 客户端：仅支持 GET bulk string（读验证码文本，Node 内建 net，零新依赖）。 */
function redisGet(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: REDIS_HOST, port: REDIS_PORT });
    let received = Buffer.alloc(0);
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      socket.end();
      resolve(value);
    };

    socket.on("connect", () => {
      const keyBytes = Buffer.from(key, "utf8");
      socket.write(
        Buffer.concat([
          Buffer.from(`*2\r\n$3\r\nGET\r\n$${keyBytes.length}\r\n`, "utf8"),
          keyBytes,
          Buffer.from("\r\n", "utf8"),
        ]),
      );
    });
    socket.on("data", (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      const lineEnd = received.indexOf("\r\n");
      if (lineEnd === -1) return;
      const header = received.subarray(0, lineEnd).toString("utf8");
      if (!header.startsWith("$")) {
        fail(new Error(`redis GET 异常响应: ${header}`));
        return;
      }
      const length = Number(header.slice(1));
      if (Number.isNaN(length)) {
        fail(new Error(`redis GET 异常长度: ${header}`));
        return;
      }
      if (length === -1) {
        finish(null);
        return;
      }
      const bodyStart = lineEnd + 2;
      if (received.length < bodyStart + length + 2) return;
      finish(received.subarray(bodyStart, bodyStart + length).toString("utf8"));
    });
    socket.on("error", fail);
    socket.on("close", () => fail(new Error("redis 连接在收到完整响应前关闭")));
  });
}

/** GET 并解包统一信封，code !== 10000 或 data 为空时抛错。 */
async function getJson<T>(
  request: APIRequestContext,
  path: string,
  accessToken?: string,
): Promise<T> {
  const response = await request.get(path, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!response.ok()) {
    throw new Error(`${path} HTTP ${response.status()}`);
  }
  const envelope: AdminEnvelope<T> = await response.json();
  if (envelope.code !== 10000 || envelope.data === null) {
    throw new Error(`${path} 业务失败: code=${envelope.code} msg=${envelope.msg}`);
  }
  return envelope.data;
}

/** POST JSON 并解包统一信封，code !== 10000 或 data 为空时抛错。 */
async function postJson<T>(
  request: APIRequestContext,
  path: string,
  body?: object,
  accessToken?: string,
): Promise<T> {
  const response = await request.post(path, {
    data: body ?? {},
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!response.ok()) {
    throw new Error(`${path} HTTP ${response.status()}`);
  }
  const envelope: AdminEnvelope<T> = await response.json();
  if (envelope.code !== 10000 || envelope.data === null) {
    throw new Error(`${path} 业务失败: code=${envelope.code} msg=${envelope.msg}`);
  }
  return envelope.data;
}

/** 真实登录链路：验证码接口 → Redis 读验证码文本 → 登录接口。 */
async function realAdminLogin(
  request: APIRequestContext,
): Promise<{ accessToken: string; refreshToken: string }> {
  const captcha = await postJson<{ captcha_id: string }>(
    request,
    "/api/admin/auth/captcha",
  );
  const captchaText = await redisGet(
    `${REDIS_KEY_PREFIX}:admin:captcha:${captcha.captcha_id}`,
  );
  if (!captchaText) {
    throw new Error(`验证码文本不在 Redis: ${captcha.captcha_id}`);
  }
  const login = await postJson<{
    access_token: string;
    refresh_token: string;
  }>(request, "/api/admin/auth/login", {
    ...adminCredentials(),
    captcha_id: captcha.captcha_id,
    captcha_code: captchaText,
  });
  return { accessToken: login.access_token, refreshToken: login.refresh_token };
}

/** 布局壳横向溢出口径：documentElement / body scrollWidth ≤ 视口宽（+1px 舍入容差）。 */
async function expectNoShellHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }));
  expect(overflow.doc, "documentElement 无横向溢出").toBeLessThanOrEqual(1);
  expect(overflow.body, "body 无横向溢出").toBeLessThanOrEqual(1);
}

/** 横滚发生在表格容器内：.n-data-table 子树存在 scrollWidth > clientWidth 的容器。 */
async function expectTableScrollsInternally(page: Page): Promise<void> {
  const table = page.locator(".n-data-table");
  await expect(table).toBeVisible();
  const hasInnerOverflow = await table.evaluate((root) => {
    const stack: Element[] = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) break;
      if (node.scrollWidth > node.clientWidth) return true;
      stack.push(...Array.from(node.children));
    }
    return false;
  });
  expect(hasInnerOverflow, "横滚只出现在表格滚动容器内").toBe(true);
}

/** 注入真实 JWT 进入登录态后打开页面。 */
async function gotoWithSession(
  page: Page,
  tokens: { accessToken: string; refreshToken: string },
  path: string,
): Promise<void> {
  await page.addInitScript((injected) => {
    window.localStorage.setItem("admin_token", injected.accessToken);
    window.localStorage.setItem("admin_refresh_token", injected.refreshToken);
  }, tokens);
  await page.goto(path);
}

test.describe.configure({ mode: "serial" });

/** 用例 1 真实表单登录签发的 token，供后续用例注入 localStorage（串行保证先登录） */
let desktopTokens: { accessToken: string; refreshToken: string } | null = null;

test.describe("响应式收口（真实后端）", () => {
  let tempNodeId: number | null = null;

  test.beforeAll(async ({ request }) => {
    // 真实登录拿 token，用于准备停用态临时服务节点（数据准备）。
    // name 无唯一约束：先按名查询，存在则复用（消除多轮运行的残留累积），不存在才创建
    const tokens = await realAdminLogin(request);
    const list = await getJson<{ nodes: Array<{ node_id: number; name: string }> }>(
      request,
      "/api/admin/service-nodes",
      tokens.accessToken,
    );
    const existing = list.nodes.find((node) => node.name === TEMP_NODE_NAME);
    if (existing) {
      tempNodeId = existing.node_id;
      return;
    }
    const node = await postJson<{ node_id: number }>(
      request,
      "/api/admin/service-nodes",
      {
        node_type: 2,
        name: TEMP_NODE_NAME,
        region: "local",
        public_base_url: "http://127.0.0.1:9",
        internal_base_url: "http://127.0.0.1:9",
        enabled: false,
        weight: 100,
      },
      tokens.accessToken,
    );
    tempNodeId = node.node_id;
  });

  test.afterAll(async ({ request }) => {
    // 无删除接口：真实 API 停用临时节点（enabled 已为 false，幂等兜底），物理删除由执行方清理
    if (tempNodeId !== null) {
      const tokens = await realAdminLogin(request);
      await postJson(
        request,
        `/api/admin/service-nodes/${tempNodeId}/disable`,
        undefined,
        tokens.accessToken,
      );
    }
  });

  test("1280 桌面：真实表单登录成功，三视图布局壳无横向溢出", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);

    // 真实登录表单：观察 captcha 请求拿 captcha_id → Redis 读文本 → 提交真实登录
    const captchaResponsePromise = page.waitForResponse("**/api/admin/auth/captcha");
    await page.goto("/login");
    const captchaResponse = await captchaResponsePromise;
    const captcha: AdminEnvelope<{ captcha_id: string }> =
      await captchaResponse.json();
    if (!captcha.data) {
      throw new Error("验证码接口返回空 data");
    }
    const captchaText = await redisGet(
      `${REDIS_KEY_PREFIX}:admin:captcha:${captcha.data.captcha_id}`,
    );
    if (!captchaText) {
      throw new Error(`验证码文本不在 Redis: ${captcha.data.captcha_id}`);
    }

    const loginResponsePromise = page.waitForResponse("**/api/admin/auth/login");
    await page.locator('input[placeholder="用户名"]').fill(adminCredentials().username);
    await page.locator('input[placeholder="密码"]').fill(adminCredentials().password);
    await page.locator('input[placeholder="请输入验证码"]').fill(captchaText);
    await page.getByRole("button", { name: "登 录" }).click();

    const loginResponse = await loginResponsePromise;
    const login: AdminEnvelope<{ access_token: string; refresh_token: string }> =
      await loginResponse.json();
    if (!login.data) {
      throw new Error(`登录失败: ${login.msg}`);
    }
    desktopTokens = {
      accessToken: login.data.access_token,
      refreshToken: login.data.refresh_token,
    };

    await expect(page).toHaveURL("/");
    await expectNoShellHorizontalOverflow(page);

    await page.goto("/service-nodes");
    await expectNoShellHorizontalOverflow(page);
    await expectTableScrollsInternally(page);

    await page.goto("/orders");
    await expectNoShellHorizontalOverflow(page);
  });

  test("820 平板：侧栏 64px 图标轨无触发钮，布局壳无溢出，详情抽屉 720 可开关", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    if (!desktopTokens) {
      throw new Error("依赖用例 1 的真实登录 token（串行执行）");
    }
    await gotoWithSession(page, desktopTokens, "/");

    // 平板合同：桌面骨架 + 侧栏折叠为 64px 图标轨（useViewport isTablet 强制 collapsed），
    // 无手动触发钮（show-trigger=!isTablet）
    const sider = page.locator(".admin-sider");
    await expect(sider).toBeVisible();
    const siderBox = await sider.boundingBox();
    if (!siderBox) throw new Error("侧栏 boundingBox 为 null");
    expect(siderBox.width).toBe(64);
    // 折叠类挂在 sider 根元素与内部 NMenu 上（naive cssr cM('collapsed')）
    await expect(page.locator(".admin-sider.n-layout-sider--collapsed")).toBeVisible();
    await expect(page.locator(".admin-sider .n-menu--collapsed")).toBeVisible();
    await expect(page.locator(".n-layout-toggle-button")).toHaveCount(0);

    await expectNoShellHorizontalOverflow(page);
    await page.goto("/service-nodes");
    await expectNoShellHorizontalOverflow(page);
    await expectTableScrollsInternally(page);
    await page.goto("/orders");
    await expectNoShellHorizontalOverflow(page);

    // 详情抽屉：平板固定 720 宽，可开可关
    const viewButton = page.getByRole("button", { name: "查看" }).first();
    await expect(viewButton).toBeVisible();
    await viewButton.click();
    const drawer = page.locator(".n-drawer");
    await expect(drawer).toBeVisible();
    await expect
      .poll(async () => (await drawer.boundingBox())?.width ?? 0)
      .toBeCloseTo(720, 0);
    await drawer.locator(".n-base-close").click();
    await expect(drawer).toHaveCount(0);
  });

  test("390 手机：抽屉导航可达，记录卡片可见无横向溢出，详情抽屉全宽可开关", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    if (!desktopTokens) {
      throw new Error("依赖用例 1 的真实登录 token（串行执行）");
    }
    await gotoWithSession(page, desktopTokens, "/");

    // 手机导航：汉堡可见 → 抽屉可开 → 三分组标签可见 → 选中后跳转且抽屉收起
    const hamburger = page.locator(".mobile-menu-trigger");
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    const drawer = page.locator(".n-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("运营", { exact: true })).toBeVisible();
    await expect(drawer.getByText("数据", { exact: true })).toBeVisible();
    await expect(drawer.getByText("配置", { exact: true })).toBeVisible();
    await drawer.getByRole("menuitem", { name: "订单管理" }).click();
    await expect(page).toHaveURL("/orders");
    await expect(drawer).toHaveCount(0);

    // 表格记录卡片化（tech-视觉基线 §4.2）：卡片可见，布局壳无横向溢出
    await expect(page.locator(".record-card").first()).toBeVisible();
    await expectNoShellHorizontalOverflow(page);

    await page.goto("/service-nodes");
    await expect(page.locator(".record-card").first()).toBeVisible();
    await expectNoShellHorizontalOverflow(page);

    await page.goto("/");
    await expectNoShellHorizontalOverflow(page);

    // 详情抽屉：手机全宽（100vw）不溢出，可开可关（操作按钮在卡片底部操作区）
    await page.goto("/orders");
    const viewButton = page.getByRole("button", { name: "查看" }).first();
    await expect(viewButton).toBeVisible();
    await viewButton.click();
    const detailDrawer = page.locator(".n-drawer");
    await expect(detailDrawer).toBeVisible();
    await expect
      .poll(async () => (await detailDrawer.boundingBox())?.width ?? 0)
      .toBeCloseTo(390, 0);
    await detailDrawer.locator(".n-base-close").click();
    await expect(detailDrawer).toHaveCount(0);
    await expectNoShellHorizontalOverflow(page);
  });
});
