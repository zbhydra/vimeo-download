<!--
  订单管理页面。

  功能：
  1. 只读筛选订单列表。
  2. 支持按用户当前邮箱搜索，后端两段解析 user_id。
  3. 查看订单详情，复制订单号和渠道订单号。
-->
<template>
  <div class="orders-view">
    <NCard class="orders-panel">
      <NForm
        :label-placement="isMobile ? 'top' : 'left'"
        :label-width="isMobile ? undefined : 124"
        :show-feedback="false"
        class="orders-filter"
      >
        <div class="orders-filter-grid">
          <NFormItem :label="t('orders.orderNo')">
            <NInput
              v-model:value="filters.orderNo"
              clearable
              :placeholder="t('orders.orderNoPlaceholder')"
              @keydown.enter="handleSearch"
            />
          </NFormItem>
          <NFormItem :label="t('orders.userId')">
            <NInputNumber
              v-model:value="filters.userId"
              clearable
              :min="1"
              :precision="0"
              :placeholder="t('orders.userIdPlaceholder')"
              style="width: 100%"
              @keydown.enter="handleSearch"
            />
          </NFormItem>
          <NFormItem :label="t('orders.userEmail')">
            <NInput
              v-model:value="filters.userEmail"
              clearable
              :placeholder="t('orders.userEmailPlaceholder')"
              @keydown.enter="handleSearch"
            />
          </NFormItem>
          <NFormItem :label="t('orders.channelOrderNo')">
            <NInput
              v-model:value="filters.channelOrderNo"
              clearable
              :placeholder="t('orders.channelOrderNoPlaceholder')"
              @keydown.enter="handleSearch"
            />
          </NFormItem>
          <NFormItem :label="t('orders.transactionId')">
            <NInput
              v-model:value="filters.transactionId"
              clearable
              :placeholder="t('orders.transactionIdPlaceholder')"
              @keydown.enter="handleSearch"
            />
          </NFormItem>
          <NFormItem :label="t('orders.orderStatus')">
            <NSelect
              v-model:value="filters.orderStatus"
              clearable
              :options="orderStatusOptions"
              data-testid="order-status-select"
            />
          </NFormItem>
          <NFormItem :label="t('orders.callbackStatus')">
            <NSelect
              v-model:value="filters.callbackStatus"
              clearable
              :options="callbackStatusOptions"
              data-testid="callback-status-select"
            />
          </NFormItem>
          <NFormItem :label="t('orders.productId')">
            <NInput
              v-model:value="filters.productId"
              clearable
              :placeholder="t('orders.productIdPlaceholder')"
              @keydown.enter="handleSearch"
            />
          </NFormItem>
          <NFormItem :label="t('orders.paymentMethod')">
            <NInput
              v-model:value="filters.paymentMethod"
              clearable
              :placeholder="t('orders.paymentMethodPlaceholder')"
              @keydown.enter="handleSearch"
            />
          </NFormItem>
          <NFormItem :label="t('orders.createdRange')" class="span-2">
            <NDatePicker
              v-model:value="filters.createdRange"
              type="datetimerange"
              clearable
              :format="ADMIN_DATETIME_FORMAT"
              style="width: 100%"
            />
          </NFormItem>
        </div>
        <div class="orders-filter-actions">
          <NSpace :size="8">
            <NButton type="primary" :loading="loading" @click="handleSearch">
              <template #icon>
                <NIcon>
                  <SearchOutlined />
                </NIcon>
              </template>
              {{ t("orders.search") }}
            </NButton>
            <NButton @click="handleReset">
              {{ t("orders.reset") }}
            </NButton>
            <NButton :loading="loading" @click="loadOrders">
              <template #icon>
                <NIcon>
                  <ReloadOutlined />
                </NIcon>
              </template>
              {{ t("common.refresh") }}
            </NButton>
          </NSpace>
        </div>
      </NForm>

      <!-- 手机（<768）：记录卡片化，操作列渲染到卡底（tech-视觉基线 §4.2） -->
      <template v-if="isMobile">
        <RecordCardList
          :columns="columns"
          :data="rows"
          :loading="loading"
          :action-keys="['operation']"
          :row-key="(row: AdminOrder) => row.order_no"
        />
        <NPagination
          class="card-pagination"
          :page="pagination.page"
          :page-size="pagination.pageSize"
          :item-count="pagination.itemCount"
          :page-sizes="pagination.pageSizes"
          :show-size-picker="pagination.showSizePicker"
          @update:page="handleCardPageChange"
          @update:page-size="handleCardPageSizeChange"
        />
      </template>
      <NDataTable
        v-else
        :columns="columns"
        :data="rows"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: AdminOrder) => row.order_no"
        :scroll-x="1750"
        :bordered="false"
        striped
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <!-- 详情抽屉：移动端全宽防溢出（tech-视觉基线 §3：NDrawer 详情类移动端全宽） -->
    <NDrawer v-model:show="detailVisible" :width="drawerWidth" placement="right">
      <NDrawerContent :title="t('orders.detailTitle')" closable>
        <NSpin :show="detailLoading">
          <NDescriptions v-if="detail" :column="1" bordered size="small">
            <NDescriptionsItem :label="t('orders.orderNo')">
              <div class="copy-line">
                <span>{{ detail.order_no }}</span>
                <NButton
                  quaternary
                  circle
                  size="small"
                  :aria-label="t('orders.copyOrderNo')"
                  @click="copyText(detail.order_no)"
                >
                  <template #icon>
                    <NIcon>
                      <CopyOutlined />
                    </NIcon>
                  </template>
                </NButton>
              </div>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.user')">
              <NButton
                text
                type="primary"
                class="user-link"
                @click="openUserInfo(detail.user_id)"
              >
                {{ formatOrderUser(detail.user_id, detail.user_email) }}
              </NButton>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.product')">
              {{ detail.product_name }} / {{ detail.product_id }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.amount')">
              {{ formatAmount(detail.amount, detail.currency) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.orderStatus')">
              <StatusPill :tone="orderStatusTone(detail.order_status)">
                {{ orderStatusLabel(detail.order_status) }}
              </StatusPill>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.callbackStatus')">
              <StatusPill :tone="callbackStatusTone(detail.callback_status)">
                {{ callbackStatusLabel(detail.callback_status) }}
              </StatusPill>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.paymentMethod')">
              {{ detail.payment_method || "-" }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.channelOrderNo')">
              <div class="copy-line">
                <span>{{ detail.payment_channel_order_no || "-" }}</span>
                <NButton
                  v-if="detail.payment_channel_order_no"
                  quaternary
                  circle
                  size="small"
                  :aria-label="t('orders.copyChannelOrderNo')"
                  @click="copyText(detail.payment_channel_order_no)"
                >
                  <template #icon>
                    <NIcon>
                      <CopyOutlined />
                    </NIcon>
                  </template>
                </NButton>
              </div>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.transactionId')">
              <div class="copy-line">
                <span>{{ detail.payment_transaction_id || "-" }}</span>
                <NButton
                  v-if="detail.payment_transaction_id"
                  quaternary
                  circle
                  size="small"
                  :aria-label="t('orders.copyTransactionId')"
                  @click="copyText(detail.payment_transaction_id)"
                >
                  <template #icon>
                    <NIcon>
                      <CopyOutlined />
                    </NIcon>
                  </template>
                </NButton>
              </div>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.channelUid')">
              {{ detail.payment_channel_uid || "-" }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.paidAmount')">
              {{ formatNullableAmount(detail.paid_amount, detail.paid_currency) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.createdAt')">
              {{ formatTime(detail.created_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.updatedAt')">
              {{ formatTime(detail.updated_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.paidAt')">
              {{ formatTime(detail.paid_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.expiredAt')">
              {{ formatTime(detail.expired_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.clientIp')">
              {{ detail.client_ip || "-" }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.paymentData')">
              <NCode :code="formatJson(detail.payment_data)" language="json" word-wrap />
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('orders.extraMetadata')">
              <NCode :code="formatJson(detail.extra_metadata)" language="json" word-wrap />
            </NDescriptionsItem>
          </NDescriptions>
        </NSpin>
      </NDrawerContent>
    </NDrawer>

    <UserInfoDialog ref="userInfoDialogRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  NButton,
  NCard,
  NCode,
  NDataTable,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NEllipsis,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NPagination,
  NSelect,
  NSpace,
  NSpin,
  useMessage,
  type DataTableColumns,
  type PaginationProps,
  type SelectOption,
} from "naive-ui";
import {
  CopyOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@vicons/antd";
import {
  getAdminOrderDetail,
  getAdminOrders,
  type AdminOrder,
  type AdminOrderListParams,
  type CallbackStatus,
  type JsonValue,
  type OrderStatus,
} from "@/api/orders";
import UserInfoDialog from "@/components/UserInfoDialog.vue";
import RecordCardList from "@/components/RecordCardList.vue";
import StatusPill, { type StatusTone } from "@/components/StatusPill.vue";
import { useViewport } from "@/composables/useViewport";
import { ADMIN_DATETIME_FORMAT, formatAdminTimeMs } from "@/utils/time";

type DateRangeValue = [number, number] | null;
type StringFilterKey =
  | "order_no"
  | "user_email"
  | "payment_channel_order_no"
  | "payment_transaction_id"
  | "product_id"
  | "payment_method";

interface OrderFilters {
  /** 本地订单号包含。 */
  orderNo: string;
  /** 用户 ID。 */
  userId: number | null;
  /** 用户当前邮箱包含。 */
  userEmail: string;
  /** 支付渠道订单号包含。 */
  channelOrderNo: string;
  /** 支付渠道交易流水 ID 包含。 */
  transactionId: string;
  /** 订单状态。 */
  orderStatus: OrderStatus | null;
  /** 履约回调状态。 */
  callbackStatus: CallbackStatus | null;
  /** 商品 ID。 */
  productId: string;
  /** 支付方式。 */
  paymentMethod: string;
  /** 创建时间范围。 */
  createdRange: DateRangeValue;
}

interface UserInfoDialogExpose {
  /** 打开用户信息弹窗。 */
  open: (userId: number) => void;
}

const { t } = useI18n();
const message = useMessage();
const { isMobile } = useViewport();

const loading = ref(false);
const detailLoading = ref(false);
const detailVisible = ref(false);
const rows = ref<AdminOrder[]>([]);
const detail = ref<AdminOrder | null>(null);
const userInfoDialogRef = ref<UserInfoDialogExpose | null>(null);

/** 详情抽屉宽度：手机全宽防溢出，桌面/平板固定 720。 */
const drawerWidth = computed(() => (isMobile.value ? "100vw" : 720));

const filters = reactive<OrderFilters>({
  orderNo: "",
  userId: null,
  userEmail: "",
  channelOrderNo: "",
  transactionId: "",
  orderStatus: null,
  callbackStatus: null,
  productId: "",
  paymentMethod: "",
  createdRange: null,
});

const pagination = reactive<PaginationProps>({
  page: 1,
  pageSize: 50,
  itemCount: 0,
  pageSizes: [20, 50, 100],
  showSizePicker: true,
});

const orderStatusOptions = computed<SelectOption[]>(() => [
  { label: t("orders.statusPending"), value: 1 },
  { label: t("orders.statusPaid"), value: 2 },
  { label: t("orders.statusCancelled"), value: 3 },
  { label: t("orders.statusRefunded"), value: 4 },
  { label: t("orders.statusExpired"), value: 5 },
]);

const callbackStatusOptions = computed<SelectOption[]>(() => [
  { label: t("orders.callbackNotCalled"), value: 1 },
  { label: t("orders.callbackPending"), value: 2 },
  { label: t("orders.callbackSuccess"), value: 3 },
  { label: t("orders.callbackFailed"), value: 4 },
  { label: t("orders.callbackMaxRetry"), value: 5 },
]);

const columns = computed<DataTableColumns<AdminOrder>>(() => [
  {
    title: t("orders.orderNo"),
    key: "order_no",
    width: 220,
    render: (row) => renderCopyValue(row.order_no),
  },
  {
    title: t("orders.user"),
    key: "user",
    width: 140,
    render: (row) => renderUserButton(row.user_id, row.user_email),
  },
  {
    title: t("orders.product"),
    key: "product",
    width: 160,
    render: (row) =>
      h(
        NEllipsis,
        { tooltip: true },
        { default: () => row.product_id || "-" },
      ),
  },
  {
    title: t("orders.amount"),
    key: "amount",
    width: 110,
    render: (row) => formatAmount(row.amount, row.currency),
  },
  {
    title: t("orders.paidAtUtc8"),
    key: "paid_at",
    width: 170,
    render: (row) => formatTime(row.paid_at),
  },
  {
    title: t("orders.orderStatus"),
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
    title: t("orders.callbackStatus"),
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
    title: t("orders.paymentMethod"),
    key: "payment_method",
    width: 150,
    render: (row) => row.payment_method || "-",
  },
  {
    title: t("orders.channelOrderNo"),
    key: "payment_channel_order_no",
    width: 180,
    render: (row) =>
      renderCopyValue(
        row.payment_channel_order_no || "-",
        "channel-order-copy-line",
      ),
  },
  {
    title: t("orders.createdAt"),
    key: "created_at",
    width: 180,
    render: (row) => formatTime(row.created_at),
  },
  {
    title: t("orders.operation"),
    key: "operation",
    width: 110,
    // 移动端不固定操作列，避免固定列挤占表格横向滚动区域
    fixed: isMobile.value ? undefined : "right",
    render: (row) =>
      h(
        NButton,
        {
          size: "small",
          tertiary: true,
          onClick: () => openDetail(row.order_no),
        },
        {
          icon: () => h(NIcon, null, { default: () => h(EyeOutlined) }),
          default: () => t("orders.view"),
        },
      ),
  },
]);

/** 加载订单列表。 */
async function loadOrders() {
  loading.value = true;
  try {
    const data = await getAdminOrders(buildListParams());
    rows.value = data.rows;
    pagination.itemCount = data.total;
    pagination.page = data.page;
    pagination.pageSize = data.page_size;
  } catch (error) {
    console.error("OrdersView.loadOrders() 加载失败:", error);
    message.error(t("orders.loadFailed"));
    rows.value = [];
    pagination.itemCount = 0;
  } finally {
    loading.value = false;
  }
}

/** 查询并回到第一页。 */
function handleSearch() {
  pagination.page = 1;
  void loadOrders();
}

/** 重置筛选条件。 */
function handleReset() {
  filters.orderNo = "";
  filters.userId = null;
  filters.userEmail = "";
  filters.channelOrderNo = "";
  filters.transactionId = "";
  filters.orderStatus = null;
  filters.callbackStatus = null;
  filters.productId = "";
  filters.paymentMethod = "";
  filters.createdRange = null;
  pagination.page = 1;
  void loadOrders();
}

/** 切换页码。 */
function handlePageChange(page: number) {
  pagination.page = page;
  void loadOrders();
}

/** 切换每页数量。 */
function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  void loadOrders();
}

/** 手机卡片分页：翻页后滚回列表顶部。 */
function handleCardPageChange(page: number) {
  handlePageChange(page);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** 手机卡片切换每页数量。 */
function handleCardPageSizeChange(pageSize: number) {
  handlePageSizeChange(pageSize);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** 打开详情抽屉。 */
async function openDetail(orderNo: string) {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await getAdminOrderDetail(orderNo);
  } catch (error) {
    console.error("OrdersView.openDetail() 加载失败:", error);
    message.error(t("orders.detailLoadFailed"));
  } finally {
    detailLoading.value = false;
  }
}

/** 构造列表请求参数。 */
function buildListParams(): AdminOrderListParams {
  const params: AdminOrderListParams = {
    page: pagination.page ?? 1,
    page_size: pagination.pageSize ?? 50,
  };
  assignTrimmed(params, "order_no", filters.orderNo);
  if (filters.userId !== null) {
    params.user_id = filters.userId;
  }
  assignTrimmed(params, "user_email", filters.userEmail);
  assignTrimmed(params, "payment_channel_order_no", filters.channelOrderNo);
  assignTrimmed(params, "payment_transaction_id", filters.transactionId);
  if (filters.orderStatus !== null) {
    params.order_status = filters.orderStatus;
  }
  if (filters.callbackStatus !== null) {
    params.callback_status = filters.callbackStatus;
  }
  assignTrimmed(params, "product_id", filters.productId);
  assignTrimmed(params, "payment_method", filters.paymentMethod);
  if (filters.createdRange) {
    const [fromMs, toMs] = filters.createdRange;
    params.created_from_ms = fromMs;
    params.created_to_ms = toMs;
  }
  return params;
}

/** 只在非空时写入字符串筛选参数。 */
function assignTrimmed(
  params: AdminOrderListParams,
  key: StringFilterKey,
  value: string,
) {
  const trimmed = value.trim();
  if (trimmed) {
    params[key] = trimmed;
  }
}

/** 渲染可复制长文本。 */
function renderCopyValue(value: string, extraClass = "") {
  const canCopy = value !== "-";
  return h(
    "div",
    { class: ["copy-line", "table-copy-line", extraClass] },
    [
      h(NEllipsis, { tooltip: true }, { default: () => value }),
      canCopy
        ? h(
            NButton,
            {
              quaternary: true,
              circle: true,
              size: "small",
              "aria-label": t("orders.copyValue"),
              onClick: () => copyText(value),
            },
            { icon: () => h(NIcon, null, { default: () => h(CopyOutlined) }) },
          )
        : null,
    ],
  );
}

/** 渲染用户信息弹窗入口。 */
function renderUserButton(userId: number, userEmail: string) {
  const userText = formatOrderUser(userId, userEmail);
  return h(
    NButton,
    {
      text: true,
      type: "primary",
      class: ["order-user-link", "user-link"],
      onClick: () => openUserInfo(userId),
    },
    {
      default: () =>
        h(
          NEllipsis,
          { class: "order-user-ellipsis", tooltip: true },
          { default: () => userText },
        ),
    },
  );
}

/** 格式化用户展示文案。 */
function formatOrderUser(userId: number, userEmail: string): string {
  return `[${userId}] ${userEmail || "-"}`;
}

/** 打开通用用户信息弹窗。 */
function openUserInfo(userId: number) {
  userInfoDialogRef.value?.open(userId);
}

/** 复制文本。 */
async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
  message.success(t("orders.copySuccess"));
}

/** 订单状态标签文案。 */
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

/** 订单状态语义色。 */
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

/** 回调状态标签文案。 */
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

/** 回调状态语义色。 */
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

/** 格式化 6 位精度金额。 */
function formatAmount(amount: number, currency: string): string {
  const humanAmount = amount / 1_000_000;
  if (currency === "USD") {
    return `${currency} ${humanAmount.toFixed(2)}`;
  }
  return `${currency} ${humanAmount.toFixed(6).replace(/\.?0+$/, "")}`;
}

/** 格式化可空金额。 */
function formatNullableAmount(amount: number | null, currency: string): string {
  if (amount === null) {
    return "-";
  }
  return formatAmount(amount, currency || "-");
}

/** 格式化毫秒时间戳。 */
function formatTime(value: number | null): string {
  return formatAdminTimeMs(value);
}

/** 格式化 JSON 字段。 */
function formatJson(value: JsonValue | null): string {
  if (value === null) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

onMounted(() => {
  void loadOrders();
});
</script>

<style scoped>
.orders-view {
  min-width: 0;
}

.orders-panel {
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.04);
}

.orders-filter {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e6e6e6;
}

.orders-filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px 16px;
  align-items: start;
}

.orders-filter :deep(.n-form-item-label) {
  /* 字号/字重/颜色走 global.css 基线收口（12px/500），此处只保留不换行的布局约束 */
  white-space: nowrap;
}

.orders-filter :deep(.n-form-item-blank) {
  min-width: 0;
}

.span-2 {
  grid-column: span 2;
}

.orders-filter-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.copy-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.table-copy-line {
  width: 100%;
}

.table-copy-line :deep(.n-ellipsis) {
  flex: 1 1 auto;
  min-width: 0;
}

.channel-order-copy-line :deep(.n-ellipsis) {
  overflow: hidden;
}

.order-user-link {
  max-width: 100%;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  justify-content: flex-start;
}

.order-user-link :deep(.n-button__content) {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.order-user-ellipsis {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

@media (max-width: 960px) {
  .orders-filter-grid {
    grid-template-columns: repeat(2, minmax(280px, 1fr));
  }
}

@media (max-width: 560px) {
  .orders-filter-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: span 1;
  }
}

/* 手机卡片分页条 */
.card-pagination {
  margin-top: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
