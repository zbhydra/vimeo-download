<!--
  管理后台布局：桌面侧边栏 / 移动端抽屉导航 + 顶栏

  结构：
  NLayout（桌面 has-sider；移动端单列）
  ├── NLayoutSider（≥768px：可折叠侧边栏 + NMenu）
  ├── NDrawer（<768px：顶栏汉堡按钮唤起，内含同源 NMenu，选中后自动收起）
  └── NLayout
      ├── NLayoutHeader（顶栏：移动端汉堡 + 标题，右侧登出）
      └── NLayoutContent（RouterView）

  断点来自 useViewport 的共享状态，CSS 媒体查询（767px）必须与其保持一致。
-->
<template>
  <NLayout :has-sider="!isMobile" class="admin-layout">
    <NLayoutSider
      v-if="!isMobile"
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="220"
      :collapsed="collapsed"
      show-trigger
      @collapse="collapsed = true"
      @expand="collapsed = false"
    >
      <div class="sider-header">
        <span v-if="!collapsed" class="sider-title">{{ t("app.title") }}</span>
        <span v-else class="sider-title-short">A</span>
      </div>
      <NMenu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
        :value="currentRoute"
        @update:value="handleMenuClick"
      />
    </NLayoutSider>

    <NDrawer v-model:show="mobileMenuOpen" placement="left" :width="264">
      <NDrawerContent :title="t('app.title')" closable>
        <NMenu
          :options="menuOptions"
          :value="currentRoute"
          @update:value="handleMobileMenuClick"
        />
      </NDrawerContent>
    </NDrawer>

    <NLayout>
      <NLayoutHeader bordered class="admin-header">
        <div class="header-left">
          <NButton
            v-if="isMobile"
            quaternary
            class="mobile-menu-trigger"
            :aria-label="t('layout.menu')"
            @click="mobileMenuOpen = true"
          >
            <template #icon>
              <NIcon><MenuOutlined /></NIcon>
            </template>
          </NButton>
          <span v-if="isMobile" class="header-title">{{ t("app.title") }}</span>
        </div>
        <div class="header-right">
          <NButton text @click="handleLogout">
            {{ t("layout.logout") }}
          </NButton>
        </div>
      </NLayoutHeader>

      <NLayoutContent class="admin-content">
        <RouterView />
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

<script setup lang="ts">
import { ref, computed, h, type Component } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NButton,
  NDrawer,
  NDrawerContent,
  NIcon,
  useDialog,
  type MenuOption,
} from "naive-ui";
import {
  BarChartOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  HddOutlined,
  MenuOutlined,
  SettingOutlined,
  ProfileOutlined,
} from "@vicons/antd";
import { useAuthStore } from "@/stores/auth";
import { useViewport } from "@/composables/useViewport";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const dialog = useDialog();
const auth = useAuthStore();
const { isMobile } = useViewport();

const collapsed = ref(false);
const mobileMenuOpen = ref(false);

/** 当前路由名用于菜单高亮 */
const currentRoute = computed(() => route.name as string);

/** 渲染图标辅助函数 */
function renderIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

/** 菜单选项 */
const menuOptions = computed<MenuOption[]>(() => [
  {
    label: t("layout.dashboard"),
    key: "Dashboard",
    icon: renderIcon(DashboardOutlined),
  },
  {
    label: t("layout.serviceNodes"),
    key: "ServiceNodes",
    icon: renderIcon(HddOutlined),
  },
  {
    label: t("layout.markLogDiagnostics"),
    key: "MarkLogDiagnostics",
    icon: renderIcon(FileSearchOutlined),
  },
  {
    label: t("layout.downloadLogs"),
    key: "DownloadLogs",
    icon: renderIcon(FileSearchOutlined),
  },
  {
    label: t("layout.orders"),
    key: "Orders",
    icon: renderIcon(ProfileOutlined),
  },
  {
    label: t("layout.analytics"),
    key: "Analytics",
    icon: renderIcon(BarChartOutlined),
  },
  {
    label: t("layout.systemSettings"),
    key: "SystemSettings",
    icon: renderIcon(SettingOutlined),
  },
]);

/** 菜单 key → 路由路径 */
const MENU_ROUTE_MAP: Record<string, string> = {
  Dashboard: "/",
  ServiceNodes: "/service-nodes",
  MarkLogDiagnostics: "/mark-logs",
  DownloadLogs: "/download-logs",
  Orders: "/orders",
  Analytics: "/analytics",
  SystemSettings: "/system-settings",
};

/** 菜单点击跳转 */
function handleMenuClick(key: string) {
  const path = MENU_ROUTE_MAP[key];
  if (path) router.push(path);
}

/** 移动端抽屉菜单点击：跳转后收起抽屉 */
function handleMobileMenuClick(key: string) {
  handleMenuClick(key);
  mobileMenuOpen.value = false;
}

/** 退出登录 */
function handleLogout() {
  dialog.warning({
    title: t("layout.logout"),
    content: t("layout.logoutConfirm"),
    positiveText: t("common.confirm"),
    negativeText: t("common.cancel"),
    onPositiveClick: () => {
      auth.clearToken();
      router.push("/login");
    },
  });
}
</script>

<style scoped>
.admin-layout {
  height: 100vh;
  /* 移动端浏览器地址栏收展不引起高度跳变；不支持时回退 100vh */
  height: 100dvh;
}

.sider-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--n-border-color);
  font-weight: 600;
  font-size: 15px;
}

.sider-title {
  white-space: nowrap;
  overflow: hidden;
}

.sider-title-short {
  font-size: 18px;
  font-weight: 700;
}

.admin-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.header-title {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.admin-content {
  padding: 24px;
  overflow-y: auto;
}

@media (max-width: 767px) {
  .admin-header {
    padding: 0 8px;
  }

  .admin-content {
    padding: 12px;
  }
}
</style>
