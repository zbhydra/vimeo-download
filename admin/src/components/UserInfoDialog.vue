<!--
  管理后台通用用户信息弹窗。

  页面通过 ref 调用 open(userId)，组件内部负责 profile、最近下载、积分记录和订单列表分页。
-->
<template>
  <NModal
    v-model:show="visible"
    preset="card"
    :title="dialogTitle"
    :style="modalStyle"
    class="user-info-dialog"
  >
    <NSpin :show="profileLoading">
      <NAlert
        v-if="profileError"
        type="error"
        :show-icon="false"
        class="user-info-alert"
      >
        {{ profileError }}
      </NAlert>

      <template v-else-if="profile">
        <div class="user-info-sections">
          <NDescriptions bordered size="small" :column="isMobile ? 1 : 2" label-placement="left">
            <NDescriptionsItem :label="t('userInfo.userId')">
              {{ profile.user.user_id }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.email')">
              {{ profile.user.email || "-" }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.accountStatus')">
              <StatusPill :tone="accountStatusTone(profile.user.account_status)">
                {{ accountStatusLabel(profile.user.account_status) }}
              </StatusPill>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.loginCount')">
              {{ profile.user.login_count }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.registerSource')">
              {{ profile.user.register_source || "-" }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.registerMethod')">
              {{ profile.user.register_method || "-" }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.registerIp')">
              {{ formatIpGeo(profile.user.register_ip, profile.user.register_country) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.lastLoginIp')">
              {{ formatIpGeo(profile.user.last_login_ip, profile.user.last_login_country) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.lastOperationIp')">
              {{
                formatIpGeo(
                  profile.user.last_operation_ip,
                  profile.user.last_operation_country,
                )
              }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.createdAt')">
              {{ formatAdminTimeMs(profile.user.created_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.updatedAt')">
              {{ formatAdminTimeMs(profile.user.updated_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.lastLoginAt')">
              {{ formatAdminTimeMs(profile.user.last_login_at) }}
            </NDescriptionsItem>
          </NDescriptions>

          <NDescriptions bordered size="small" :column="isMobile ? 1 : 3" label-placement="left">
            <NDescriptionsItem :label="t('userInfo.creditsBalance')">
              {{ profile.credits.balance }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.hasSubscription')">
              <StatusPill :tone="profile.subscription.has_subscription ? 'success' : 'neutral'">
                {{
                  profile.subscription.has_subscription
                    ? t("common.yes")
                    : t("common.no")
                }}
              </StatusPill>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('userInfo.subscriptionExpiresAt')">
              {{ formatAdminTimeMs(profile.subscription.expires_at) }}
            </NDescriptionsItem>
          </NDescriptions>
        </div>

        <NTabs v-model:value="activeTab" type="line" animated @update:value="handleTabChange">
          <NTabPane name="downloads" :tab="t('userInfo.tabDownloads')">
            <!-- 手机（<768）：记录卡片化（tech-视觉基线 §4.2） -->
            <template v-if="isMobile">
              <RecordCardList
                :columns="downloadColumns"
                :data="downloadRows"
                :loading="downloadsLoading"
                :row-key="(row: AdminUserDownloadRecord) => row.id"
              />
              <NPagination
                class="user-info-pagination"
                :page="downloadsPagination.page"
                :page-size="downloadsPagination.pageSize"
                :item-count="downloadsPagination.itemCount"
                :page-sizes="downloadsPagination.pageSizes"
                :show-size-picker="downloadsPagination.showSizePicker"
                @update:page="handleDownloadsCardPageChange"
                @update:page-size="handleDownloadsPageSizeChange"
              />
            </template>
            <NDataTable
              v-else
              :columns="downloadColumns"
              :data="downloadRows"
              :loading="downloadsLoading"
              :pagination="downloadsPagination"
              :row-key="(row: AdminUserDownloadRecord) => row.id"
              :scroll-x="1180"
              :bordered="false"
              striped
              remote
              @update:page="handleDownloadsPageChange"
              @update:page-size="handleDownloadsPageSizeChange"
            />
          </NTabPane>

          <NTabPane name="credits" :tab="t('userInfo.tabCredits')">
            <template v-if="isMobile">
              <RecordCardList
                :columns="creditColumns"
                :data="creditRows"
                :loading="creditsLoading"
                :row-key="(row: AdminUserCreditRecord) => row.id"
              />
              <NPagination
                class="user-info-pagination"
                :page="creditsPagination.page"
                :page-size="creditsPagination.pageSize"
                :item-count="creditsPagination.itemCount"
                :page-sizes="creditsPagination.pageSizes"
                :show-size-picker="creditsPagination.showSizePicker"
                @update:page="handleCreditsCardPageChange"
                @update:page-size="handleCreditsPageSizeChange"
              />
            </template>
            <NDataTable
              v-else
              :columns="creditColumns"
              :data="creditRows"
              :loading="creditsLoading"
              :pagination="creditsPagination"
              :row-key="(row: AdminUserCreditRecord) => row.id"
              :scroll-x="900"
              :bordered="false"
              striped
              remote
              @update:page="handleCreditsPageChange"
              @update:page-size="handleCreditsPageSizeChange"
            />
          </NTabPane>

          <NTabPane name="orders" :tab="t('userInfo.tabOrders')">
            <template v-if="isMobile">
              <RecordCardList
                :columns="orderColumns"
                :data="orderRows"
                :loading="ordersLoading"
                :row-key="(row: AdminOrder) => row.order_no"
              />
              <NPagination
                class="user-info-pagination"
                :page="ordersPagination.page"
                :page-size="ordersPagination.pageSize"
                :item-count="ordersPagination.itemCount"
                :page-sizes="ordersPagination.pageSizes"
                :show-size-picker="ordersPagination.showSizePicker"
                @update:page="handleOrdersCardPageChange"
                @update:page-size="handleOrdersPageSizeChange"
              />
            </template>
            <NDataTable
              v-else
              :columns="orderColumns"
              :data="orderRows"
              :loading="ordersLoading"
              :pagination="ordersPagination"
              :row-key="(row: AdminOrder) => row.order_no"
              :scroll-x="1320"
              :bordered="false"
              striped
              remote
              @update:page="handleOrdersPageChange"
              @update:page-size="handleOrdersPageSizeChange"
            />
          </NTabPane>
        </NTabs>
      </template>
    </NSpin>
  </NModal>
</template>

<script setup lang="ts">
import { computed, h, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  NAlert,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NEllipsis,
  NModal,
  NPagination,
  NSpin,
  NTabPane,
  NTabs,
  useMessage,
  type DataTableColumns,
  type PaginationProps,
} from "naive-ui";
import {
  getAdminUserCredits,
  getAdminUserDownloads,
  getAdminUserOrders,
  getAdminUserProfile,
  type AdminUserAccountStatus,
  type AdminUserCreditRecord,
  type AdminUserDownloadRecord,
  type AdminUserProfileData,
} from "@/api/users";
import type { AdminOrder, CallbackStatus, OrderStatus } from "@/api/orders";
import RecordCardList from "@/components/RecordCardList.vue";
import StatusPill, { type StatusTone } from "@/components/StatusPill.vue";
import { formatAdminTimeMs } from "@/utils/time";
import { useViewport } from "@/composables/useViewport";

type TabKey = "downloads" | "credits" | "orders";

const { t } = useI18n();
const message = useMessage();
const { isMobile } = useViewport();

const visible = ref(false);
const currentUserId = ref<number | null>(null);
const profileLoading = ref(false);
const profileError = ref("");
const profile = ref<AdminUserProfileData | null>(null);
const activeTab = ref<TabKey>("downloads");

const downloadsLoading = ref(false);
const downloadsLoaded = ref(false);
const downloadRows = ref<AdminUserDownloadRecord[]>([]);
const downloadsPagination = reactive<PaginationProps>({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  pageSizes: [10, 20, 50, 100],
  showSizePicker: true,
});

const creditsLoading = ref(false);
const creditsLoaded = ref(false);
const creditRows = ref<AdminUserCreditRecord[]>([]);
const creditsPagination = reactive<PaginationProps>({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  pageSizes: [10, 20, 50, 100],
  showSizePicker: true,
});

const ordersLoading = ref(false);
const ordersLoaded = ref(false);
const orderRows = ref<AdminOrder[]>([]);
const ordersPagination = reactive<PaginationProps>({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  pageSizes: [10, 20, 50, 100],
  showSizePicker: true,
});

const modalStyle = {
  width: "min(960px, calc(100vw - 32px))",
};

const dialogTitle = computed(() => {
  if (profile.value?.user.user_id) {
    return `${t("userInfo.title")} · ${profile.value.user.user_id}`;
  }
  if (currentUserId.value !== null) {
    return `${t("userInfo.title")} · ${currentUserId.value}`;
  }
  return t("userInfo.title");
});

const downloadColumns = computed<DataTableColumns<AdminUserDownloadRecord>>(() => [
  {
    title: t("userInfo.downloadCreatedAt"),
    key: "created_at",
    width: 170,
    render: (row) => formatAdminTimeMs(row.created_at),
  },
  {
    title: t("userInfo.downloadPlatform"),
    key: "platform",
    width: 100,
  },
  {
    title: t("userInfo.downloadCreditsCost"),
    key: "credits_cost",
    width: 120,
    align: "right",
  },
  {
    title: t("userInfo.downloadSize"),
    key: "size_bytes",
    width: 120,
    align: "right",
    render: (row) => formatFileSize(row.size_bytes),
  },
  {
    title: t("userInfo.downloadFilename"),
    key: "filename",
    minWidth: 180,
    render: (row) => renderText(row.filename),
  },
  {
    title: t("userInfo.downloadSourceId"),
    key: "source_id",
    minWidth: 160,
    render: (row) => renderText(row.source_id),
  },
  {
    title: t("userInfo.downloadResourceKey"),
    key: "resource_key",
    minWidth: 220,
    render: (row) => renderText(row.resource_key),
  },
  {
    title: t("userInfo.downloadLink"),
    key: "canonical_link",
    minWidth: 280,
    render: (row) => renderText(row.canonical_link),
  },
]);

const orderColumns = computed<DataTableColumns<AdminOrder>>(() => [
  {
    title: t("userInfo.orderCreatedAt"),
    key: "created_at",
    width: 170,
    render: (row) => formatAdminTimeMs(row.created_at),
  },
  {
    title: t("userInfo.orderNo"),
    key: "order_no",
    minWidth: 210,
    render: (row) => renderText(row.order_no),
  },
  {
    title: t("userInfo.orderProduct"),
    key: "product",
    minWidth: 220,
    render: (row) => renderProduct(row),
  },
  {
    title: t("userInfo.orderAmount"),
    key: "amount",
    width: 130,
    render: (row) => formatAmount(row.amount, row.currency),
  },
  {
    title: t("userInfo.orderStatus"),
    key: "order_status",
    width: 120,
    render: (row) =>
      h(
        StatusPill,
        { tone: orderStatusTone(row.order_status) },
        { default: () => orderStatusLabel(row.order_status) },
      ),
  },
  {
    title: t("userInfo.callbackStatus"),
    key: "callback_status",
    width: 130,
    render: (row) =>
      h(
        StatusPill,
        { tone: callbackStatusTone(row.callback_status) },
        { default: () => callbackStatusLabel(row.callback_status) },
      ),
  },
  {
    title: t("userInfo.paymentMethod"),
    key: "payment_method",
    width: 140,
    render: (row) => row.payment_method || "-",
  },
  {
    title: t("userInfo.channelOrderNo"),
    key: "payment_channel_order_no",
    minWidth: 220,
    render: (row) => renderText(row.payment_channel_order_no),
  },
]);

const creditColumns = computed<DataTableColumns<AdminUserCreditRecord>>(() => [
  {
    title: t("userInfo.creditCreatedAt"),
    key: "created_at",
    width: 170,
    render: (row) => formatAdminTimeMs(row.created_at),
  },
  {
    title: t("userInfo.creditChangeAmount"),
    key: "change_amount",
    width: 120,
    align: "right",
    render: (row) =>
      h(
        StatusPill,
        {
          tone:
            row.change_amount > 0 ? "success" : row.change_amount < 0 ? "danger" : "neutral",
        },
        { default: () => (row.change_amount > 0 ? `+${row.change_amount}` : row.change_amount) },
      ),
  },
  {
    title: t("userInfo.creditReason"),
    key: "reason",
    width: 140,
    render: (row) => creditReasonLabel(row.reason),
  },
  {
    title: t("userInfo.creditResourceKey"),
    key: "resource_key",
    minWidth: 220,
    render: (row) => renderText(row.resource_key),
  },
  {
    title: t("userInfo.creditDetails"),
    key: "metadata_json",
    minWidth: 250,
    render: (row) => renderText(row.metadata_json),
  },
]);

/** 打开弹窗并重置分页状态。 */
function open(userId: number): void {
  currentUserId.value = userId;
  visible.value = true;
  activeTab.value = "downloads";
  profile.value = null;
  profileError.value = "";
  resetDownloads();
  resetCredits();
  resetOrders();
  void loadInitial(userId);
}

defineExpose({ open });

/** 首次打开先加载 profile，成功后加载默认 tab。 */
async function loadInitial(userId: number) {
  await loadProfile(userId);
  if (!profile.value) {
    return;
  }
  await loadDownloads();
}

/** 加载 profile。 */
async function loadProfile(userId: number) {
  profileLoading.value = true;
  try {
    profile.value = await getAdminUserProfile(userId);
  } catch (error) {
    console.error("UserInfoDialog.loadProfile() 加载失败:", error);
    profileError.value = t("userInfo.profileLoadFailed");
    message.error(t("userInfo.profileLoadFailed"));
  } finally {
    profileLoading.value = false;
  }
}

/** 加载下载分页。 */
async function loadDownloads() {
  if (currentUserId.value === null) return;
  downloadsLoading.value = true;
  try {
    const data = await getAdminUserDownloads(currentUserId.value, {
      page: downloadsPagination.page ?? 1,
      page_size: downloadsPagination.pageSize ?? 20,
    });
    downloadRows.value = data.rows;
    downloadsPagination.itemCount = data.total;
    downloadsPagination.page = data.page;
    downloadsPagination.pageSize = data.page_size;
    downloadsLoaded.value = true;
  } catch (error) {
    console.error("UserInfoDialog.loadDownloads() 加载失败:", error);
    message.error(t("userInfo.downloadsLoadFailed"));
    downloadRows.value = [];
    downloadsPagination.itemCount = 0;
  } finally {
    downloadsLoading.value = false;
  }
}

/** 加载订单分页。 */
async function loadOrders() {
  if (currentUserId.value === null) return;
  ordersLoading.value = true;
  try {
    const data = await getAdminUserOrders(currentUserId.value, {
      page: ordersPagination.page ?? 1,
      page_size: ordersPagination.pageSize ?? 20,
    });
    orderRows.value = data.rows;
    ordersPagination.itemCount = data.total;
    ordersPagination.page = data.page;
    ordersPagination.pageSize = data.page_size;
    ordersLoaded.value = true;
  } catch (error) {
    console.error("UserInfoDialog.loadOrders() 加载失败:", error);
    message.error(t("userInfo.ordersLoadFailed"));
    orderRows.value = [];
    ordersPagination.itemCount = 0;
  } finally {
    ordersLoading.value = false;
  }
}

/** 加载积分流水分页。 */
async function loadCredits() {
  if (currentUserId.value === null) return;
  creditsLoading.value = true;
  try {
    const data = await getAdminUserCredits(currentUserId.value, {
      page: creditsPagination.page ?? 1,
      page_size: creditsPagination.pageSize ?? 20,
    });
    creditRows.value = data.rows;
    creditsPagination.itemCount = data.total;
    creditsPagination.page = data.page;
    creditsPagination.pageSize = data.page_size;
    creditsLoaded.value = true;
  } catch (error) {
    console.error("UserInfoDialog.loadCredits() 加载失败:", error);
    message.error(t("userInfo.creditsLoadFailed"));
    creditRows.value = [];
    creditsPagination.itemCount = 0;
  } finally {
    creditsLoading.value = false;
  }
}

/** 切换 tab 时惰性加载列表。 */
function handleTabChange(value: string | number) {
  const nextTab = String(value) as TabKey;
  if (nextTab === "downloads" && !downloadsLoaded.value) {
    void loadDownloads();
  }
  if (nextTab === "orders" && !ordersLoaded.value) {
    void loadOrders();
  }
  if (nextTab === "credits" && !creditsLoaded.value) {
    void loadCredits();
  }
}

function handleDownloadsPageChange(page: number) {
  downloadsPagination.page = page;
  void loadDownloads();
}

function handleDownloadsPageSizeChange(pageSize: number) {
  downloadsPagination.pageSize = pageSize;
  downloadsPagination.page = 1;
  void loadDownloads();
}

/** 手机卡片分页：翻页后把弹窗滚动容器滚回列表顶部。
    弹窗内容高于视口时滚动发生在 naive modal 外层的 NScrollbar 容器上，
    从弹窗根元素向上找最近的滚动容器。 */
function scrollDialogContentToTop() {
  const scrollContainer = document
    .querySelector(".user-info-dialog")
    ?.closest(".n-scrollbar-container");
  scrollContainer?.scrollTo({ top: 0, behavior: "smooth" });
}

function handleDownloadsCardPageChange(page: number) {
  handleDownloadsPageChange(page);
  scrollDialogContentToTop();
}

function handleOrdersPageChange(page: number) {
  ordersPagination.page = page;
  void loadOrders();
}

function handleCreditsPageChange(page: number) {
  creditsPagination.page = page;
  void loadCredits();
}

function handleCreditsPageSizeChange(pageSize: number) {
  creditsPagination.pageSize = pageSize;
  creditsPagination.page = 1;
  void loadCredits();
}

function handleCreditsCardPageChange(page: number) {
  handleCreditsPageChange(page);
  scrollDialogContentToTop();
}

function handleOrdersPageSizeChange(pageSize: number) {
  ordersPagination.pageSize = pageSize;
  ordersPagination.page = 1;
  void loadOrders();
}

function handleOrdersCardPageChange(page: number) {
  handleOrdersPageChange(page);
  scrollDialogContentToTop();
}

function resetDownloads() {
  downloadRows.value = [];
  downloadsLoaded.value = false;
  downloadsPagination.page = 1;
  downloadsPagination.pageSize = 20;
  downloadsPagination.itemCount = 0;
}

function resetOrders() {
  orderRows.value = [];
  ordersLoaded.value = false;
  ordersPagination.page = 1;
  ordersPagination.pageSize = 20;
  ordersPagination.itemCount = 0;
}

function resetCredits() {
  creditRows.value = [];
  creditsLoaded.value = false;
  creditsPagination.page = 1;
  creditsPagination.pageSize = 20;
  creditsPagination.itemCount = 0;
}

function formatIpGeo(ip: string | null, country: string | null): string {
  if (!ip && !country) {
    return "-";
  }
  return `${ip || "-"} (${country || "-"})`;
}

function accountStatusLabel(status: AdminUserAccountStatus): string {
  const labels: Record<AdminUserAccountStatus, string> = {
    normal: t("userInfo.accountNormal"),
    locked: t("userInfo.accountLocked"),
    deleted: t("userInfo.accountDeleted"),
  };
  return labels[status];
}

function accountStatusTone(status: AdminUserAccountStatus): StatusTone {
  const tones: Record<AdminUserAccountStatus, StatusTone> = {
    normal: "success",
    locked: "warning",
    deleted: "danger",
  };
  return tones[status];
}

function creditReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    registration_bonus: t("userInfo.creditReasonRegistrationBonus"),
    download_charge: t("userInfo.creditReasonDownloadCharge"),
    recharge_purchase: t("userInfo.creditReasonRechargePurchase"),
    checkin_reward: t("userInfo.creditReasonCheckinReward"),
  };
  return labels[reason] ?? reason;
}

function renderText(value: string | null) {
  if (!value) {
    return "-";
  }
  return h(NEllipsis, { tooltip: true }, { default: () => value });
}

function renderProduct(row: AdminOrder) {
  return h("div", { class: "user-info-product" }, [
    h(NEllipsis, { tooltip: true }, { default: () => row.product_name }),
    h("span", { class: "user-info-muted" }, row.product_id),
  ]);
}

function formatFileSize(value: number | null): string {
  if (value === null || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return "-";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatAmount(amount: number, currency: string): string {
  const humanAmount = amount / 1_000_000;
  if (currency === "USD") {
    return `${currency} ${humanAmount.toFixed(2)}`;
  }
  return `${currency} ${humanAmount.toFixed(6).replace(/\.?0+$/, "")}`;
}

function orderStatusLabel(value: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    1: t("orders.statusPending"),
    2: t("orders.statusPaid"),
    3: t("orders.statusCancelled"),
    4: t("orders.statusRefunded"),
    5: t("orders.statusExpired"),
  };
  return labels[value];
}

function orderStatusTone(value: OrderStatus): StatusTone {
  const tones: Record<OrderStatus, StatusTone> = {
    1: "warning",
    2: "success",
    3: "neutral",
    4: "info",
    5: "danger",
  };
  return tones[value];
}

function callbackStatusLabel(value: CallbackStatus): string {
  const labels: Record<CallbackStatus, string> = {
    1: t("orders.callbackNotCalled"),
    2: t("orders.callbackPending"),
    3: t("orders.callbackSuccess"),
    4: t("orders.callbackFailed"),
    5: t("orders.callbackMaxRetry"),
  };
  return labels[value];
}

function callbackStatusTone(value: CallbackStatus): StatusTone {
  const tones: Record<CallbackStatus, StatusTone> = {
    1: "neutral",
    2: "warning",
    3: "success",
    4: "danger",
    5: "danger",
  };
  return tones[value];
}
</script>

<style scoped>
.user-info-dialog {
  max-width: calc(100vw - 32px);
}

.user-info-alert {
  margin-bottom: 12px;
}

.user-info-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.user-info-product {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.user-info-muted {
  color: #667085;
  font-size: 12px;
}

/* 手机卡片分页条 */
.user-info-pagination {
  margin-top: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
