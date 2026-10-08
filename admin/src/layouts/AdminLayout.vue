<!--
  管理后台布局：桌面/平板侧边栏 / 移动端抽屉导航 + 顶栏

  结构：
  NLayout（非移动端 has-sider；移动端单列）
  ├── NLayoutSider（≥768px：侧边栏 + NMenu；桌面可手动折叠，平板强制折叠为图标轨且隐藏触发钮）
  ├── NDrawer（<768px：顶栏汉堡按钮唤起，内含同源 NMenu，选中后自动收起）
  └── NLayout
      ├── NLayoutHeader（顶栏：当前路由 i18n 页面标题 + 移动端汉堡，右侧登出）
      └── NLayoutContent（RouterView）

  断点来自 useViewport 的共享状态，CSS 媒体查询（767px / 1023px）必须与其保持一致。
-->
<template>
  <NLayout :has-sider="!isMobile" class="admin-layout">
    <NLayoutSider
      v-if="!isMobile"
      bordered
      class="admin-sider"
      collapse-mode="width"
      :collapsed-width="64"
      :width="220"
      :collapsed="siderCollapsed"
      :show-trigger="!isTablet"
      @collapse="collapsed = true"
      @expand="collapsed = false"
    >
      <div class="sider-header">
        <span v-if="!siderCollapsed" class="sider-title">{{ t("app.title") }}</span>
        <span v-else class="sider-title-short">A</span>
      </div>
      <NMenu
        :collapsed="siderCollapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
        :value="currentRoute"
        @update:value="handleMenuClick"
      />
    </NLayoutSider>

    <NDrawer v-model:show="mobileMenuOpen" placement="left" :width="270">
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
          <h1 class="header-title">{{ pageTitle }}</h1>
        </div>
        <div class="header-right">
          <NButton class="logout-button" @click="handleLogout">
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
const { isMobile, isTablet } = useViewport();

const collapsed = ref(false);
const mobileMenuOpen = ref(false);

/**
 * 侧栏生效折叠态：平板（768–1023）强制折叠为 64px 图标轨（tech-视觉基线 §4.1），
 * 桌面跟随手动折叠；平板隐藏触发钮，切回桌面时保留此前的手动状态。
 */
const siderCollapsed = computed(() => collapsed.value || isTablet.value);

/** 当前路由名用于菜单高亮 */
const currentRoute = computed(() => route.name as string);

/** 渲染图标辅助函数 */
function renderIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

/**
 * 菜单项单一来源：key = 路由名；菜单 label、顶栏标题（titleKey）与跳转路径（path）同源。
 */
const MENU_ITEMS = {
  Dashboard: { path: "/", titleKey: "layout.dashboard", icon: DashboardOutlined },
  ServiceNodes: { path: "/service-nodes", titleKey: "layout.serviceNodes", icon: HddOutlined },
  Orders: { path: "/orders", titleKey: "layout.orders", icon: ProfileOutlined },
  DownloadLogs: { path: "/download-logs", titleKey: "layout.downloadLogs", icon: FileSearchOutlined },
  MarkLogDiagnostics: { path: "/mark-logs", titleKey: "layout.markLogDiagnostics", icon: FileSearchOutlined },
  Analytics: { path: "/analytics", titleKey: "layout.analytics", icon: BarChartOutlined },
  SystemSettings: { path: "/system-settings", titleKey: "layout.systemSettings", icon: SettingOutlined },
};

/** 侧栏三分组：组 key、组标签 i18n key 与组内菜单顺序（条目统一取 MENU_ITEMS）。 */
const MENU_GROUPS: Array<{
  key: string;
  labelKey: string;
  items: Array<keyof typeof MENU_ITEMS>;
}> = [
  { key: "group-ops", labelKey: "layout.groupOps", items: ["Dashboard", "ServiceNodes", "Orders"] },
  { key: "group-data", labelKey: "layout.groupData", items: ["DownloadLogs", "MarkLogDiagnostics", "Analytics"] },
  { key: "group-config", labelKey: "layout.groupConfig", items: ["SystemSettings"] },
];

function isMenuItemKey(key: string): key is keyof typeof MENU_ITEMS {
  return key in MENU_ITEMS;
}

/**
 * 菜单选项：三分组导航（组标签走 type: "group"，仍由 NMenu 渲染 role="menu"）。
 */
const menuOptions = computed<MenuOption[]>(() =>
  MENU_GROUPS.map((group) => ({
    type: "group" as const,
    label: t(group.labelKey),
    key: group.key,
    children: group.items.map((name): MenuOption => {
      const item = MENU_ITEMS[name];
      return { label: t(item.titleKey), key: name, icon: renderIcon(item.icon) };
    }),
  })),
);

/** 顶栏页面标题：路由名即菜单 key，标题与菜单名同源 */
const pageTitle = computed(() => {
  const name = String(route.name ?? "");
  return isMenuItemKey(name) ? t(MENU_ITEMS[name].titleKey) : "";
});

/** 菜单点击跳转 */
function handleMenuClick(key: string) {
  if (!isMenuItemKey(key)) return;
  router.push(MENU_ITEMS[key].path);
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

/* 页面 h1（tech-视觉基线 §1.2：24px / 500 / -0.72px / heading 色） */
.header-title {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.72px;
  color: var(--admin-heading);
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

/* 登出钮：白底描边（基线 §3 顶栏「右侧登出白底描边钮」，边框 #dedfdb 为 U2 移交规格）。
   naive 主题变量行内注入、只能按元素覆盖：背景压过 .n-button 根（0,1,0），
   悬停/聚焦背景与字色压过 naive hover 规则（0,3,0），描边色压过 .n-button .n-button__border（0,2,0） */
.logout-button {
  background-color: #ffffff;
}

.logout-button:not(.n-button--disabled):hover,
.logout-button:not(.n-button--disabled):focus {
  background-color: #ffffff;
  color: var(--admin-ink);
}

.logout-button :deep(.n-button__border) {
  border-color: var(--admin-button-border);
}

/* 折叠图标轨（64px，平板强制/桌面手动）内图标居中：
   naive 的折叠居中 padding 只算根级菜单项，分组子项仍带分组缩进（use-menu-child paddingLeft），
   图标整体右偏 ~15px → 折叠态统一清掉缩进与图标右边距（两者均为行内样式，须 !important）、
   收敛为单列居中；header/arrow 隐藏避免落入隐式网格行 */
.admin-sider :deep(.n-menu--collapsed .n-menu-item-content) {
  grid-template-columns: 1fr;
  grid-template-areas: "icon";
  justify-items: center;
  padding-left: 0 !important;
  padding-right: 0;
}

.admin-sider :deep(.n-menu--collapsed .n-menu-item-content__icon) {
  margin-right: 0 !important;
}

.admin-sider :deep(.n-menu--collapsed .n-menu-item-content-header),
.admin-sider :deep(.n-menu--collapsed .n-menu-item-content__arrow) {
  display: none;
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
