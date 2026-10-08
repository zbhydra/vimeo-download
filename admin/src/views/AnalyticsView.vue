<!--
  数据分析页面（单文件，页内 NTabs 内联 6 个标签页）。

  结构：
    NTabs
    ├── 下载资源分析：NDataTable，固定 12 行档位（空档 0），5 列（含占比）
    ├── 下载排名：    NDataTable，前 20 用户，4 列（含前端行号）
    ├── 下载统计：    6 个 NStatistic 卡片（3×2 grid），资源大小格式化为 MB/GB
    ├── 用户地理分析：NDataTable，国家分布，2 列（国名用 Intl.DisplayNames 转，人数含占比）
    ├── 每日充值(+8)：NDataTable，按 Asia/Shanghai 日期聚合订单笔数和多币种金额
    └── 商品统计(+8)：NDataTable，按 Asia/Shanghai 日期 + 商品 ID 聚合订单笔数和多币种金额

  每个 pane 独立：timeRange、loading、数据 ref、load()。
  下载维度默认最近 24 小时；订单维度（每日充值 / 商品统计）默认最近 7 天。
  onMounted 触发首个激活 pane 首次加载；切 tab 时仅对未加载过的 pane 触发加载，已加载不重复请求。

  口径/接口/UI 规格见 docs/feat/008.管理后台/tech-数据分析.md。
-->
<template>
  <div class="analytics-view">
    <NTabs v-model:value="activeTab" type="line" animated @update:value="handleTabChange">
      <!-- ============ 下载资源分析 ============ -->
      <NTabPane name="resource" :tab="t('analytics.tabResource')">
        <NCard :bordered="false">
          <template #header>
            <div class="pane-header">
              <TimeRangePicker v-model="resourceRange" />
              <NSpace :size="8">
                <NButton type="primary" :loading="resourceLoading" @click="loadResource(true)">
                  {{ t("analytics.search") }}
                </NButton>
                <NButton :loading="resourceLoading" @click="loadResource(true)">
                  {{ t("analytics.refresh") }}
                </NButton>
              </NSpace>
            </div>
          </template>
          <!-- 手机（<768）：记录卡片化，不再横滚表格（tech-视觉基线 §4.2） -->
          <RecordCardList
            v-if="isMobile"
            :columns="resourceColumns"
            :data="resourceRows"
            :loading="resourceLoading"
          />
          <NDataTable
            v-else
            :columns="resourceColumns"
            :data="resourceRows"
            :loading="resourceLoading"
            :pagination="false"
            :bordered="false"
            :scroll-x="900"
            striped
          />
        </NCard>
      </NTabPane>

      <!-- ============ 下载排名 ============ -->
      <NTabPane name="topUsers" :tab="t('analytics.tabTopUsers')">
        <NCard :bordered="false">
          <template #header>
            <div class="pane-header">
              <TimeRangePicker v-model="topUsersRange" />
              <NSpace :size="8">
                <NButton type="primary" :loading="topUsersLoading" @click="loadTopUsers(true)">
                  {{ t("analytics.search") }}
                </NButton>
                <NButton :loading="topUsersLoading" @click="loadTopUsers(true)">
                  {{ t("analytics.refresh") }}
                </NButton>
              </NSpace>
            </div>
          </template>
          <RecordCardList
            v-if="isMobile"
            :columns="topUsersColumns"
            :data="topUsersRows"
            :loading="topUsersLoading"
          />
          <NDataTable
            v-else
            :columns="topUsersColumns"
            :data="topUsersRows"
            :loading="topUsersLoading"
            :pagination="false"
            :bordered="false"
            striped
          />
          <NEmpty
            v-if="!isMobile && !topUsersLoading && topUsersRows.length === 0"
            class="pane-empty"
            :description="t('analytics.empty')"
          />
        </NCard>
      </NTabPane>

      <!-- ============ 下载统计 ============ -->
      <NTabPane name="summary" :tab="t('analytics.tabSummary')">
        <NCard :bordered="false">
          <template #header>
            <div class="pane-header">
              <TimeRangePicker v-model="summaryRange" />
              <NSpace :size="8">
                <NButton type="primary" :loading="summaryLoading" @click="loadSummary(true)">
                  {{ t("analytics.search") }}
                </NButton>
                <NButton :loading="summaryLoading" @click="loadSummary(true)">
                  {{ t("analytics.refresh") }}
                </NButton>
              </NSpace>
            </div>
          </template>
          <div class="summary-grid">
            <NCard v-for="card in summaryCards" :key="card.key" :bordered="true" size="small">
              <NStatistic :label="card.label" :value="card.value" />
            </NCard>
          </div>
        </NCard>
      </NTabPane>

      <!-- ============ 用户地理分析 ============ -->
      <NTabPane name="geo" :tab="t('analytics.tabGeo')">
        <NCard :bordered="false">
          <template #header>
            <div class="pane-header">
              <TimeRangePicker v-model="geoRange" />
              <NSpace :size="8">
                <NButton type="primary" :loading="geoLoading" @click="loadGeo(true)">
                  {{ t("analytics.search") }}
                </NButton>
                <NButton :loading="geoLoading" @click="loadGeo(true)">
                  {{ t("analytics.refresh") }}
                </NButton>
              </NSpace>
            </div>
          </template>
          <RecordCardList
            v-if="isMobile"
            :columns="geoColumns"
            :data="geoRows"
            :loading="geoLoading"
          />
          <NDataTable
            v-else
            :columns="geoColumns"
            :data="geoRows"
            :loading="geoLoading"
            :pagination="false"
            :bordered="false"
            striped
          />
          <NEmpty
            v-if="!isMobile && !geoLoading && geoRows.length === 0"
            class="pane-empty"
            :description="t('analytics.empty')"
          />
        </NCard>
      </NTabPane>

      <!-- ============ 每日充值(+8) ============ -->
      <NTabPane name="dailyRecharge" :tab="t('analytics.tabDailyRecharge')">
        <NCard :bordered="false">
          <template #header>
            <div class="pane-header">
              <TimeRangePicker v-model="dailyRechargeRange" />
              <NSpace :size="8">
                <NButton
                  type="primary"
                  :loading="dailyRechargeLoading"
                  @click="loadDailyRecharge(true)"
                >
                  {{ t("analytics.search") }}
                </NButton>
                <NButton :loading="dailyRechargeLoading" @click="loadDailyRecharge(true)">
                  {{ t("analytics.refresh") }}
                </NButton>
              </NSpace>
            </div>
          </template>
          <RecordCardList
            v-if="isMobile"
            :columns="dailyRechargeColumns"
            :data="dailyRechargeRows"
            :loading="dailyRechargeLoading"
          />
          <NDataTable
            v-else
            :columns="dailyRechargeColumns"
            :data="dailyRechargeRows"
            :loading="dailyRechargeLoading"
            :pagination="false"
            :bordered="false"
            :scroll-x="960"
            striped
          />
          <NEmpty
            v-if="!isMobile && !dailyRechargeLoading && dailyRechargeRows.length === 0"
            class="pane-empty"
            :description="t('analytics.empty')"
          />
        </NCard>
      </NTabPane>

      <!-- ============ 商品统计(+8) ============ -->
      <NTabPane name="productStats" :tab="t('analytics.tabProductStats')">
        <NCard :bordered="false">
          <template #header>
            <div class="pane-header">
              <TimeRangePicker v-model="productStatsRange" />
              <NSpace :size="8">
                <NButton
                  type="primary"
                  :loading="productStatsLoading"
                  @click="loadProductStats(true)"
                >
                  {{ t("analytics.search") }}
                </NButton>
                <NButton :loading="productStatsLoading" @click="loadProductStats(true)">
                  {{ t("analytics.refresh") }}
                </NButton>
              </NSpace>
            </div>
          </template>
          <RecordCardList
            v-if="isMobile"
            :columns="productStatsColumns"
            :data="productStatsRows"
            :loading="productStatsLoading"
          />
          <NDataTable
            v-else
            :columns="productStatsColumns"
            :data="productStatsRows"
            :loading="productStatsLoading"
            :pagination="false"
            :bordered="false"
            :scroll-x="1120"
            striped
          />
          <NEmpty
            v-if="!isMobile && !productStatsLoading && productStatsRows.length === 0"
            class="pane-empty"
            :description="t('analytics.empty')"
          />
        </NCard>
      </NTabPane>
    </NTabs>
    <UserInfoDialog ref="userInfoDialogRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  NButton,
  NCard,
  NDataTable,
  NEmpty,
  NSpace,
  NStatistic,
  NTabPane,
  NTabs,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import TimeRangePicker from "@/components/TimeRangePicker.vue";
import RecordCardList from "@/components/RecordCardList.vue";
import {
  getDailyRecharge,
  getDownloadSummary,
  getProductStatistics,
  getResourceDistribution,
  getTopUsers,
  getUserGeo,
  type DailyRechargeRow,
  type DownloadSummaryData,
  type OrderAnalyticsCurrencyAmount,
  type ProductStatisticsRow,
  type ResourceBucket,
  type TopUserRow,
  type UserGeoRow,
} from "@/api/analytics";
import UserInfoDialog from "@/components/UserInfoDialog.vue";
import { formatAdminDateWithWeekday } from "@/utils/time";
import { useViewport } from "@/composables/useViewport";

interface UserInfoDialogExpose {
  /** 打开用户信息弹窗。 */
  open: (userId: number) => void;
}

const { t, locale } = useI18n();
const message = useMessage();
const { isMobile } = useViewport();
const userInfoDialogRef = ref<UserInfoDialogExpose | null>(null);

/** 毫秒时间戳二元组或空。 */
type RangeValue = [number, number] | null;

/** 默认窗口：挂载时锁定，不随时间滚动。 */
function defaultRange(days: number): RangeValue {
  const now = Date.now();
  return [now - days * 24 * 3600 * 1000, now];
}

/** 6 个 tab 的 key。 */
type TabKey =
  | "resource"
  | "topUsers"
  | "summary"
  | "geo"
  | "dailyRecharge"
  | "productStats";

const activeTab = ref<TabKey>("resource");

// ---------- 下载资源分析 ----------
const resourceRange = ref<RangeValue>(defaultRange(1));
const resourceLoading = ref(false);
const resourceRows = ref<ResourceBucket[]>([]);
const resourceLoaded = ref(false);

const resourceTotals = computed(() => {
  return resourceRows.value.reduce(
    (totals, row) => {
      totals.paid += row.paid_count;
      totals.total += row.total_count;
      return totals;
    },
    { paid: 0, total: 0 },
  );
});

function formatPercent(count: number, total: number): string {
  if (total <= 0) return "0%";
  const percent = (count / total) * 100;
  return `${percent.toFixed(2).replace(/\.?0+$/, "")}%`;
}

const resourceColumns = computed<DataTableColumns<ResourceBucket>>(() => [
  {
    title: t("analytics.colResourceSize"),
    key: "label",
    minWidth: 180,
  },
  {
    title: t("analytics.colPaidCount"),
    key: "paid_count",
    width: 200,
    align: "right",
  },
  {
    title: t("analytics.colPercentCount"),
    key: "paid_percent",
    width: 160,
    align: "right",
    render: (row) => formatPercent(row.paid_count, resourceTotals.value.paid),
  },
  {
    title: t("analytics.colTotalCount"),
    key: "total_count",
    width: 200,
    align: "right",
  },
  {
    title: t("analytics.colPercentCount"),
    key: "total_percent",
    width: 160,
    align: "right",
    render: (row) => formatPercent(row.total_count, resourceTotals.value.total),
  },
]);

async function loadResource(force = false) {
  const range = resourceRange.value;
  if (!range) {
    message.error(t("analytics.rangeRequired"));
    return;
  }
  resourceLoading.value = true;
  try {
    const data = await getResourceDistribution({
      from_ms: range[0],
      to_ms: range[1],
    });
    resourceRows.value = data.buckets;
    resourceLoaded.value = true;
  } catch (error) {
    console.error("AnalyticsView.loadResource 失败:", error);
    message.error(t("analytics.loadFailed"));
    if (force) resourceRows.value = [];
  } finally {
    resourceLoading.value = false;
  }
}

// ---------- 下载排名 ----------
const topUsersRange = ref<RangeValue>(defaultRange(1));
const topUsersLoading = ref(false);
const topUsersRows = ref<TopUserRow[]>([]);
const topUsersLoaded = ref(false);

const topUsersColumns = computed<DataTableColumns<TopUserRow>>(() => [
  {
    title: t("analytics.colRank"),
    key: "rank",
    width: 100,
    align: "right",
    // 排名列用前端行号（基于当前数组顺序，后端已按 total_count 降序返回）
    render: (_row, index) => index + 1,
  },
  {
    title: t("analytics.colUserId"),
    key: "user_id",
    minWidth: 160,
    render: (row) => renderUserButton(row.user_id),
  },
  {
    title: t("analytics.colPaidCount"),
    key: "paid_count",
    width: 200,
    align: "right",
  },
  {
    title: t("analytics.colTotalCount"),
    key: "total_count",
    width: 200,
    align: "right",
  },
]);

async function loadTopUsers(force = false) {
  const range = topUsersRange.value;
  if (!range) {
    message.error(t("analytics.rangeRequired"));
    return;
  }
  topUsersLoading.value = true;
  try {
    const data = await getTopUsers({ from_ms: range[0], to_ms: range[1] });
    topUsersRows.value = data.users;
    topUsersLoaded.value = true;
  } catch (error) {
    console.error("AnalyticsView.loadTopUsers 失败:", error);
    message.error(t("analytics.loadFailed"));
    if (force) topUsersRows.value = [];
  } finally {
    topUsersLoading.value = false;
  }
}

/** 渲染通用用户信息弹窗入口。 */
function renderUserButton(userId: number) {
  return h(
    NButton,
    {
      text: true,
      type: "primary",
      class: ["analytics-user-link", "user-link"],
      onClick: () => openUserInfo(userId),
    },
    { default: () => userId },
  );
}

/** 打开用户信息弹窗。 */
function openUserInfo(userId: number) {
  userInfoDialogRef.value?.open(userId);
}

// ---------- 下载统计 ----------
const summaryRange = ref<RangeValue>(defaultRange(1));
const summaryLoading = ref(false);
const summaryData = ref<DownloadSummaryData | null>(null);
const summaryLoaded = ref(false);

/** 字节格式化为人类可读的 MB/GB（1 MB := 1 MiB = 1_048_576 字节）。 */
function formatBytes(bytes: number): string {
  const GIB = 1_073_741_824;
  const MIB = 1_048_576;
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes >= GIB) {
    return `${(bytes / GIB).toFixed(2)} GB`;
  }
  return `${(bytes / MIB).toFixed(2)} MB`;
}

const summaryCards = computed(() => {
  const s = summaryData.value;
  return [
    { key: "paid_user", label: t("analytics.statPaidUserCount"), value: s?.paid_user_count ?? 0 },
    { key: "total_user", label: t("analytics.statTotalUserCount"), value: s?.total_user_count ?? 0 },
    {
      key: "paid_download",
      label: t("analytics.statPaidDownloadCount"),
      value: s?.paid_download_count ?? 0,
    },
    {
      key: "total_download",
      label: t("analytics.statTotalDownloadCount"),
      value: s?.total_download_count ?? 0,
    },
    {
      key: "paid_size",
      label: t("analytics.statPaidSize"),
      value: formatBytes(s?.paid_size_bytes ?? 0),
    },
    {
      key: "total_size",
      label: t("analytics.statTotalSize"),
      value: formatBytes(s?.total_size_bytes ?? 0),
    },
  ];
});

async function loadSummary(force = false) {
  const range = summaryRange.value;
  if (!range) {
    message.error(t("analytics.rangeRequired"));
    return;
  }
  summaryLoading.value = true;
  try {
    const data = await getDownloadSummary({ from_ms: range[0], to_ms: range[1] });
    summaryData.value = data;
    summaryLoaded.value = true;
  } catch (error) {
    console.error("AnalyticsView.loadSummary 失败:", error);
    message.error(t("analytics.loadFailed"));
    if (force) summaryData.value = null;
  } finally {
    summaryLoading.value = false;
  }
}

// ---------- 用户地理分析 ----------
const geoRange = ref<RangeValue>(defaultRange(1));
const geoLoading = ref(false);
const geoRows = ref<UserGeoRow[]>([]);
const geoLoaded = ref(false);
const geoTotal = computed(() => geoRows.value.reduce((total, row) => total + row.count, 0));

/**
 * 国家码 → 国家名：用浏览器原生 Intl.DisplayNames 转换。
 * - "unknown" 显示「未知」。
 * - Intl 不支持或抛错时降级显示原始国家码。
 * locale 取自 useI18n().locale（当前固定 zh-CN）。
 */
function countryDisplayName(code: string): string {
  if (code === "unknown") return t("analytics.unknownRegion");
  try {
    const dn = new Intl.DisplayNames([locale.value], { type: "region" });
    const name = dn.of(code);
    return name ?? code;
  } catch (error) {
    console.error("AnalyticsView.countryDisplayName Intl 降级:", error);
    return code;
  }
}

const geoColumns = computed<DataTableColumns<UserGeoRow>>(() => [
  {
    title: t("analytics.colRegion"),
    key: "country",
    minWidth: 200,
    render: (row) => countryDisplayName(row.country),
  },
  {
    title: t("analytics.colPeopleCount"),
    key: "count",
    width: 200,
    align: "right",
    render: (row) => `${row.count} (${formatPercent(row.count, geoTotal.value)})`,
  },
]);

async function loadGeo(force = false) {
  const range = geoRange.value;
  if (!range) {
    message.error(t("analytics.rangeRequired"));
    return;
  }
  geoLoading.value = true;
  try {
    const data = await getUserGeo({ from_ms: range[0], to_ms: range[1] });
    geoRows.value = data.regions;
    geoLoaded.value = true;
  } catch (error) {
    console.error("AnalyticsView.loadGeo 失败:", error);
    message.error(t("analytics.loadFailed"));
    if (force) geoRows.value = [];
  } finally {
    geoLoading.value = false;
  }
}

// ---------- 每日充值(+8) ----------
const dailyRechargeRange = ref<RangeValue>(defaultRange(7));
const dailyRechargeLoading = ref(false);
const dailyRechargeRows = ref<DailyRechargeRow[]>([]);
const dailyRechargeLoaded = ref(false);

/** 多币种金额展示为 “12 XTR, 15.3 USD”，与后端 6 位精度格式保持一致。 */
function formatAmountList(amounts: OrderAnalyticsCurrencyAmount[]): string {
  if (amounts.length === 0) return "0";
  return amounts
    .map((item) => `${item.display_amount} ${item.currency}`)
    .join(", ");
}

/** 订单统计的笔数/人数展示：x 是订单笔数，y 是去重用户数。 */
function formatOrderCountUserPair(count: number, userCount: number): string {
  return `${count}/${userCount}`;
}

const dailyRechargeColumns = computed<DataTableColumns<DailyRechargeRow>>(() => [
  {
    title: t("analytics.colDate"),
    key: "date",
    width: 160,
    render: (row) => formatAdminDateWithWeekday(row.date),
  },
  {
    title: t("analytics.colOrderSuccessCount"),
    key: "success_count",
    width: 160,
    align: "right",
    render: (row) =>
      formatOrderCountUserPair(row.success_count, row.success_user_count),
  },
  {
    title: t("analytics.colOrderSuccessAmount"),
    key: "success_amounts",
    minWidth: 220,
    align: "right",
    render: (row) => formatAmountList(row.success_amounts),
  },
  {
    title: t("analytics.colOrderTotalCount"),
    key: "total_count",
    width: 160,
    align: "right",
    render: (row) => formatOrderCountUserPair(row.total_count, row.total_user_count),
  },
  {
    title: t("analytics.colOrderTotalAmount"),
    key: "total_amounts",
    minWidth: 220,
    align: "right",
    render: (row) => formatAmountList(row.total_amounts),
  },
]);

async function loadDailyRecharge(force = false) {
  const range = dailyRechargeRange.value;
  if (!range) {
    message.error(t("analytics.rangeRequired"));
    return;
  }
  dailyRechargeLoading.value = true;
  try {
    const data = await getDailyRecharge({ from_ms: range[0], to_ms: range[1] });
    dailyRechargeRows.value = data.rows;
    dailyRechargeLoaded.value = true;
  } catch (error) {
    console.error("AnalyticsView.loadDailyRecharge 失败:", error);
    message.error(t("analytics.loadFailed"));
    if (force) dailyRechargeRows.value = [];
  } finally {
    dailyRechargeLoading.value = false;
  }
}

// ---------- 商品统计(+8) ----------
const productStatsRange = ref<RangeValue>(defaultRange(7));
const productStatsLoading = ref(false);
const productStatsRows = ref<ProductStatisticsRow[]>([]);
const productStatsLoaded = ref(false);

const productStatsColumns = computed<DataTableColumns<ProductStatisticsRow>>(() => [
  {
    title: t("analytics.colDate"),
    key: "date",
    width: 160,
    render: (row) => formatAdminDateWithWeekday(row.date),
  },
  {
    title: t("analytics.colProductId"),
    key: "product_id",
    minWidth: 180,
  },
  {
    title: t("analytics.colOrderSuccessCount"),
    key: "success_count",
    width: 160,
    align: "right",
    render: (row) =>
      formatOrderCountUserPair(row.success_count, row.success_user_count),
  },
  {
    title: t("analytics.colOrderSuccessAmount"),
    key: "success_amounts",
    minWidth: 220,
    align: "right",
    render: (row) => formatAmountList(row.success_amounts),
  },
  {
    title: t("analytics.colOrderTotalCount"),
    key: "total_count",
    width: 160,
    align: "right",
    render: (row) => formatOrderCountUserPair(row.total_count, row.total_user_count),
  },
  {
    title: t("analytics.colOrderTotalAmount"),
    key: "total_amounts",
    minWidth: 220,
    align: "right",
    render: (row) => formatAmountList(row.total_amounts),
  },
]);

async function loadProductStats(force = false) {
  const range = productStatsRange.value;
  if (!range) {
    message.error(t("analytics.rangeRequired"));
    return;
  }
  productStatsLoading.value = true;
  try {
    const data = await getProductStatistics({ from_ms: range[0], to_ms: range[1] });
    productStatsRows.value = data.rows;
    productStatsLoaded.value = true;
  } catch (error) {
    console.error("AnalyticsView.loadProductStats 失败:", error);
    message.error(t("analytics.loadFailed"));
    if (force) productStatsRows.value = [];
  } finally {
    productStatsLoading.value = false;
  }
}

/** 切 tab：仅对未加载过的 pane 触发首次加载，已加载不重复请求。 */
function handleTabChange(key: string | number) {
  const tab = String(key) as TabKey;
  if (tab === "resource" && !resourceLoaded.value) void loadResource();
  else if (tab === "topUsers" && !topUsersLoaded.value) void loadTopUsers();
  else if (tab === "summary" && !summaryLoaded.value) void loadSummary();
  else if (tab === "geo" && !geoLoaded.value) void loadGeo();
  else if (tab === "dailyRecharge" && !dailyRechargeLoaded.value) {
    void loadDailyRecharge();
  } else if (tab === "productStats" && !productStatsLoaded.value) {
    void loadProductStats();
  }
}

onMounted(() => {
  // 默认激活第一个 tab（下载资源分析），挂载即触发首次加载
  void loadResource();
});
</script>

<style scoped>
.analytics-view {
  min-width: 0;
}

.analytics-user-link {
  max-width: 100%;
}

.pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.pane-empty {
  margin-top: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 960px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .pane-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
