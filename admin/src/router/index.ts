/**
 * Vue Router 路由配置 + 导航守卫
 *
 * 路由：
 *   /login       → LoginView（无需鉴权）
 *   /            → AdminLayout > DashboardView（需鉴权）
 *   /service-nodes → AdminLayout > ServiceNodesView（需鉴权）
 *   /mark-logs   → AdminLayout > MarkLogDiagnosticsView（需鉴权）
 *   /download-logs → AdminLayout > DownloadLogsView（需鉴权）
 *   /orders      → AdminLayout > OrdersView（需鉴权）
 *   /analytics   → AdminLayout > AnalyticsView（需鉴权）
 *   /system-settings → AdminLayout > SystemSettingsView（需鉴权）
 *
 * 守卫：未登录时重定向到 /login
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/LoginView.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/",
    component: () => import("@/layouts/AdminLayout.vue"),
    meta: { requiresAuth: true },
    children: [
      {
        path: "",
        name: "Dashboard",
        component: () => import("@/views/DashboardView.vue"),
      },
      {
        path: "service-nodes",
        name: "ServiceNodes",
        component: () => import("@/views/ServiceNodesView.vue"),
      },
      {
        path: "mark-logs",
        name: "MarkLogDiagnostics",
        component: () => import("@/views/MarkLogDiagnosticsView.vue"),
      },
      {
        path: "download-logs",
        name: "DownloadLogs",
        component: () => import("@/views/DownloadLogsView.vue"),
      },
      {
        path: "orders",
        name: "Orders",
        component: () => import("@/views/OrdersView.vue"),
      },
      {
        path: "analytics",
        name: "Analytics",
        component: () => import("@/views/AnalyticsView.vue"),
      },
      {
        path: "system-settings",
        name: "SystemSettings",
        component: () => import("@/views/SystemSettingsView.vue"),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();

  // 需要鉴权但未登录 → 跳转登录
  if (to.matched.some((r) => r.meta.requiresAuth) && !auth.isLoggedIn) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }

  // 已登录访问登录页 → 跳转首页
  if (to.path === "/login" && auth.isLoggedIn) {
    return { path: "/" };
  }
});

export default router;
