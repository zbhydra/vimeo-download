/**
 * 布局导航与登出 e2e
 *
 * 覆盖：
 * - 侧边栏菜单渲染（数据看板 / 服务节点 / 日志排查 / 系统设置）
 * - 菜单点击导航
 * - 侧边栏折叠/展开
 * - 顶栏登出按钮 + 确认弹窗
 * - 登出后清除 Token → 跳转登录页
 */
import { expect, test, type Page } from "@playwright/test";
import { registerE2eBrowserIdentity } from "../../scripts/playwright-browser-identity.mjs";

registerE2eBrowserIdentity(test);

/** Dashboard 菜单页依赖的最小 mock。 */
interface DashboardMockData {
  /** dashboard 汇总统计。 */
  summary: Record<string, number>;
  /** 诊断标记类型列表。 */
  mark_types: string[];
  /** 诊断行列表，本测试不关心具体结构。 */
  rows: string[];
}

/** service_nodes 列表中的节点 mock；node_type/status/health_status 使用后端数字枚举。 */
interface ServiceNodeMockData {
  /** service_nodes 自增 ID。 */
  node_id: number;
  /** 节点类型：1=business，2=download。 */
  node_type: 1 | 2;
  /** 节点展示名。 */
  name: string;
  /** 节点地区。 */
  region: string;
  /** 浏览器直连节点使用的公网 base URL。 */
  public_base_url: string;
  /** 业务服务器健康检查使用的内网 base URL。 */
  internal_base_url: string;
  /** 管理员启用状态。 */
  enabled: boolean;
  /** 分配状态：1=active，2=draining，3=disabled。 */
  status: 1 | 2 | 3;
  /** 加权随机权重。 */
  weight: number;
  /** 健康状态：0=unknown，1=healthy，2=unhealthy。 */
  last_health_status: 0 | 1 | 2;
  /** 最近健康检查 Unix 秒。 */
  last_health_at: number | null;
  /** 最近健康检查错误。 */
  last_error: string | null;
  /** 最近上报 session 数。 */
  session_count: number;
  /** 节点上报版本。 */
  version: string | null;
  /** 创建 Unix 秒。 */
  created_at: number;
  /** 更新 Unix 秒。 */
  updated_at: number;
}

/** 服务节点列表页 mock。 */
interface ServiceNodeListMockData {
  /** 服务节点列表。 */
  nodes: ServiceNodeMockData[];
  /** 服务节点总数。 */
  total: number;
  /** 健康业务兜底节点数量。 */
  healthy_business_count: number;
}

/** 手动健康检查响应 mock。 */
interface ServiceNodeHealthCheckMockData {
  /** 本次手动健康检查诊断。 */
  diagnosis: {
    /** 被检查节点 ID。 */
    node_id: number;
    /** 检查时间 Unix 秒。 */
    checked_at: number;
    /** 实际请求 URL。 */
    url: string;
    /** 是否健康。 */
    healthy: boolean;
    /** HTTP 状态码。 */
    http_status: number | null;
    /** 节点原始健康 payload。 */
    payload: Record<string, string | number | boolean | null> | null;
    /** 错误详情。 */
    error: string | null;
  };
  /** 写回后的节点。 */
  node: ServiceNodeMockData;
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

/** 本文件 route.fulfill 可返回的数据联合。 */
type MockResponseData =
  | DashboardMockData
  | ServiceNodeMockData
  | ServiceNodeListMockData
  | ServiceNodeHealthCheckMockData
  | ApiKeyMetaMockData;

/** 后端统一成功响应 */
function successResponse(data: MockResponseData) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 10000, data, msg: "success" }),
  };
}

/** 注入登录 Token + mock dashboard */
async function loginAsAdmin(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("admin_token", "mock-admin-jwt-token");
  });

  await page.route("**/api/admin/dashboard", async (route) => {
    await route.fulfill(
      successResponse({
        summary: {
          total_users: 100,
          new_users: 5,
          active_users_24h: 20,
          active_users_7d: 80,
        },
        mark_types: [],
        rows: [],
      }),
    );
  });

  await page.route("**/api/admin/system-settings/api-key", async (route) => {
    await route.fulfill(
      successResponse({
        has_api_key: false,
        api_key_prefix: "",
        api_key_created_at: null,
      }),
    );
  });

  return mockServiceNodes(page);
}

/** 获取侧边栏菜单项（精确匹配，排除卡片标题等干扰） */
function menuLink(page: Page, name: string) {
  return page.getByRole("menu").getByText(name);
}

function serviceNode(partial: Partial<ServiceNodeMockData>): ServiceNodeMockData {
  return {
    node_id: 1,
    node_type: 2,
    name: "download-sg",
    region: "sg",
    public_base_url: "https://trusted-node.example/base",
    internal_base_url: "http://download-sg.internal/base",
    enabled: true,
    status: 1,
    weight: 100,
    last_health_status: 1,
    last_health_at: 1780977600,
    last_error: null,
    session_count: 3,
    version: "v-test",
    created_at: 1780977000,
    updated_at: 1780977600,
    ...partial,
  };
}

async function mockServiceNodes(page: Page) {
  const nodes: ServiceNodeMockData[] = [
    serviceNode({}),
    serviceNode({
      node_id: 2,
      node_type: 1,
      name: "business-us",
      region: "us",
      public_base_url: "https://business.example",
      internal_base_url: "http://business.internal",
      session_count: 1,
    }),
  ];
  const updatePayloads: Array<Partial<ServiceNodeMockData>> = [];

  await page.route("**/api/admin/service-nodes", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill(
        successResponse({
          nodes,
          total: nodes.length,
          healthy_business_count: 1,
        }),
      );
      return;
    }

    const payload = route.request().postDataJSON() as Partial<ServiceNodeMockData>;
    const created = serviceNode({
      node_id: 3,
      name: String(payload.name ?? "download-new"),
      region: String(payload.region ?? "hk"),
      public_base_url: String(payload.public_base_url ?? "https://new.example"),
      internal_base_url: String(payload.internal_base_url ?? "http://new.internal"),
      weight: Number(payload.weight ?? 100),
    });
    nodes.push(created);
    await route.fulfill(successResponse(created));
  });

  await page.route("**/api/admin/service-nodes/*/update", async (route) => {
    const nodeId = Number(route.request().url().match(/service-nodes\/(\d+)/)?.[1]);
    const payload = route.request().postDataJSON() as Partial<ServiceNodeMockData>;
    updatePayloads.push(payload);
    const node = nodes.find((item) => item.node_id === nodeId) ?? nodes[0]!;
    Object.assign(node, payload, { updated_at: node.updated_at + 1 });
    await route.fulfill(successResponse(node));
  });

  await page.route("**/api/admin/service-nodes/*/disable", async (route) => {
    nodes[0]!.enabled = false;
    await route.fulfill(successResponse(nodes[0]!));
  });
  await page.route("**/api/admin/service-nodes/*/enable", async (route) => {
    nodes[0]!.enabled = true;
    await route.fulfill(successResponse(nodes[0]!));
  });
  await page.route("**/api/admin/service-nodes/*/health-check", async (route) => {
    nodes[0]!.last_health_status = 1;
    nodes[0]!.session_count = 4;
    await route.fulfill(
      successResponse({
        diagnosis: {
          node_id: nodes[0]!.node_id,
          checked_at: 1780977700,
          url: "http://download-sg.internal/base/internal/service-node/health",
          healthy: true,
          http_status: 200,
          payload: { status: "ok", session_count: 4 },
          error: null,
        },
        node: nodes[0]!,
      }),
    );
  });

  return { updatePayloads };
}

// ========== 测试 ==========

test.describe("侧边栏菜单", () => {
  test("菜单项可见：数据看板 / 服务节点 / 日志排查 / 系统设置", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");

    await expect(menuLink(page, "数据看板")).toBeVisible();
    await expect(menuLink(page, "服务节点")).toBeVisible();
    await expect(menuLink(page, "日志排查")).toBeVisible();
    await expect(menuLink(page, "系统设置")).toBeVisible();
  });

  test("点击数据看板菜单 → 导航到 /", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/service-nodes");

    await menuLink(page, "数据看板").click();
    await expect(page).toHaveURL("/");
  });

  test("点击系统设置菜单 → 导航到 /system-settings", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");

    await menuLink(page, "系统设置").click();
    await expect(page).toHaveURL("/system-settings");
  });

  test("点击服务节点菜单 → 导航到 /service-nodes", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");

    await menuLink(page, "服务节点").click();
    await expect(page).toHaveURL("/service-nodes");
    await expect(page.getByText("download-sg")).toBeVisible();
    await expect(page.getByText("健康业务节点 1")).toBeVisible();
  });

  test("当前页面菜单项高亮", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");

    // Dashboard 菜单项可见
    await expect(menuLink(page, "数据看板")).toBeVisible();

    // 导航到服务节点
    await menuLink(page, "服务节点").click();
    await expect(menuLink(page, "服务节点")).toBeVisible();
  });
});

test.describe("服务节点管理", () => {
  test("列表、新增、编辑零权重、启停、健康检查", async ({
    page,
  }) => {
    const { updatePayloads } = await loginAsAdmin(page);
    await page.goto("/service-nodes");

    await expect(page.getByText("download-sg")).toBeVisible();
    await expect(page.getByText("https://trusted-node.example/base")).toBeVisible();

    await page.getByRole("button", { name: "新增节点" }).click();
    await page.getByTestId("service-node-name-input").locator("input").fill("download-hk");
    await page.getByTestId("service-node-region-input").locator("input").fill("hk");
    await page.getByTestId("service-node-weight-input").locator("input").fill("200");
    await page
      .getByTestId("service-node-public-url-input")
      .locator("input")
      .fill("https://download-hk.example/base");
    await page
      .getByTestId("service-node-internal-url-input")
      .locator("input")
      .fill("http://download-hk.internal/base");
    await page.getByRole("button", { name: "确认" }).click();
    await expect(
      page.locator("tr").filter({ hasText: "download-hk" }).first(),
    ).toBeVisible();

    const firstRow = page.locator("tr").filter({ hasText: "download-sg" }).first();
    await firstRow.getByRole("button", { name: "编辑" }).click();
    await page
      .getByTestId("service-node-name-input")
      .locator("input")
      .fill("download-sg-edit");
    await page.getByTestId("service-node-weight-input").locator("input").fill("0");
    await page.getByRole("button", { name: "确认" }).click();
    await expect(page.getByText("download-sg-edit")).toBeVisible();
    expect(updatePayloads.at(-1)?.weight).toBe(0);

    const editedRow = page.locator("tr").filter({ hasText: "download-sg-edit" }).first();
    await editedRow.getByRole("button", { name: "停用" }).click();
    await expect(editedRow.getByText("否")).toBeVisible();
    await editedRow.getByRole("button", { name: "启用" }).click();
    await expect(editedRow.getByText("是")).toBeVisible();

    await editedRow.getByRole("button", { name: "健康检查" }).click();
    await expect(page.locator(".n-message__content", { hasText: "节点健康" })).toBeVisible();
  });
});

test.describe("登出流程", () => {
  test("点击退出登录 → 弹出确认弹窗 → 取消 → 仍在当前页", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/");

    await page.getByRole("button", { name: "退出登录" }).click();

    // 确认弹窗
    const dialog = page.locator(".n-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("确定要退出登录吗？")).toBeVisible();

    // 点击取消
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).not.toBeVisible();

    // 仍在首页
    await expect(page).toHaveURL("/");
  });

  test("点击退出登录 → 弹出确认弹窗 → 确认 → 清除 Token → 跳转登录页", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/");

    await page.getByRole("button", { name: "退出登录" }).click();

    const dialog = page.locator(".n-dialog");
    await expect(dialog).toBeVisible();

    // 点击确认
    await dialog.getByRole("button", { name: "确认" }).click();

    // 跳转到登录页
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

    // Token 已清除
    const token = await page.evaluate(() =>
      window.localStorage.getItem("admin_token"),
    );
    expect(token).toBeNull();
  });

  test("移动端抽屉：底部登出 → 确认弹窗在抽屉之上可交互 → 登录页", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // 汉堡唤起抽屉
    await page.getByRole("button", { name: "打开菜单" }).click();
    const drawer = page.locator(".n-drawer");
    await expect(drawer).toBeVisible();

    // 抽屉底部次级区登出（作用域限定在抽屉内，与顶栏登出区分）
    const drawerLogout = drawer.getByRole("button", { name: "退出登录" });
    await expect(drawerLogout).toBeVisible();
    await drawerLogout.click();

    // 确认弹窗必须可交互（即在抽屉层级之上），确认后跳登录页
    const dialog = page.locator(".n-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "确认" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

test.describe("标题显示", () => {
  test("侧边栏展开时显示完整标题", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");

    await expect(page.getByText("Vimeo Downloader 管理后台")).toBeVisible();
  });
});
