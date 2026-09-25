<!--
  Dashboard 数据看板

  展示：
  1. 顶部统计卡片：总用户数、今日新增、24H 活跃、7D 活跃
  2. 下方 NDataTable：60 天按天数据（日期、注册数、各 mark_type 事件数/设备数）
-->
<template>
  <div class="dashboard-view">
    <!-- 统计卡片 -->
    <div class="stat-cards">
      <NCard v-for="item in summaryCards" :key="item.label">
        <NStatistic :label="item.label" :value="item.value" />
      </NCard>
    </div>

    <!-- 数据表格 -->
    <NCard :title="t('layout.dashboard')" style="margin-top: 16px">
      <NDataTable
        :columns="columns"
        :data="rows"
        :loading="loading"
        :pagination="false"
        :bordered="false"
        striped
      />
    </NCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useI18n } from "vue-i18n";
import { NCard, NStatistic, NDataTable, type DataTableColumns } from "naive-ui";
import {
  getDashboard,
  type DashboardData,
  type DashboardRow,
  type DashboardSummary,
} from "@/api/dashboard";
import { useViewport } from "@/composables/useViewport";

const { t } = useI18n();
const { isMobile } = useViewport();

/** 数据看板固定展示最近 60 天，表格不再分页。 */
const DASHBOARD_VISIBLE_ROW_COUNT = 60;

interface SummaryCard {
  /** 统计卡片标题。 */
  label: string;
  /** 统计卡片数值。 */
  value: number;
}

const loading = ref(false);
const dashboardData = ref<DashboardData | null>(null);

const summaryCards = computed<SummaryCard[]>(() => {
  const summary = dashboardData.value?.summary;
  return [
    { label: t("dashboard.totalUsers"), value: summary?.total_users ?? 0 },
    { label: formatNewUsersLabel(summary), value: summary?.new_users ?? 0 },
    { label: t("dashboard.activeUsers24h"), value: summary?.active_users_24h ?? 0 },
    { label: t("dashboard.activeUsers7d"), value: summary?.active_users_7d ?? 0 },
  ];
});
const rows = computed(() =>
  (dashboardData.value?.rows ?? []).slice(0, DASHBOARD_VISIBLE_ROW_COUNT),
);
const markTypes = computed(() => dashboardData.value?.mark_types ?? []);

function formatChangePercent(changePercent: number | null | undefined): string {
  if (changePercent === null || changePercent === undefined) {
    return t("dashboard.changeUnavailable");
  }

  const roundedPercent = Math.round(Math.abs(changePercent));
  if (roundedPercent === 0) {
    return t("dashboard.changeFlat");
  }

  return t(changePercent > 0 ? "dashboard.changeUp" : "dashboard.changeDown", {
    percent: roundedPercent,
  });
}

function formatNewUsersLabel(summary: DashboardSummary | undefined): string {
  if (!summary) {
    return t("dashboard.newUsers");
  }

  const yesterdaySamePeriod = summary.new_users_yesterday_same_period ?? 0;
  const changePercent =
    summary.new_users_yesterday_same_period_change_percent ?? null;

  return t("dashboard.newUsersWithComparison", {
    count: yesterdaySamePeriod,
    change: formatChangePercent(changePercent),
  });
}

/** 动态列：日期 + 注册数 + 各 mark_type 的 event_count / device_count */
const columns = computed<DataTableColumns<DashboardRow>>(() => {
  const base: DataTableColumns<DashboardRow> = [
    {
      title: t("dashboard.date"),
      key: "date_label",
      width: 120,
      // 移动端不固定首列，避免固定列挤占表格横向滚动区域
      fixed: isMobile.value ? undefined : "left",
    },
    {
      title: t("dashboard.registered"),
      key: "registered_count",
      width: 90,
      align: "right",
    },
  ];

  // 按 mark_type 动态生成列，每个 mark_type 一列，单元格内显示 "事件数/设备数"
  for (const mt of markTypes.value) {
    base.push({
      title: mt,
      key: mt,
      width: 140,
      align: "right",
      render: (row: DashboardRow) => {
        const cell = row.metrics[mt];
        if (!cell) return "-";
        return `${cell.event_count}/${cell.device_count}`;
      },
    });
  }

  return base;
});

async function loadData() {
  loading.value = true;
  try {
    dashboardData.value = await getDashboard();
  } catch {
    dashboardData.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.stat-cards {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.stat-cards :deep(.n-statistic__label) {
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}
</style>
