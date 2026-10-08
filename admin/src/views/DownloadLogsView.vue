<!--
  下载详情页面

  功能：
  1. 列表展示 website 下载开始、成功、失败和存储预检阻断日志
  2. 展示媒体平台、地址、节点 ID、文件信息、错误摘要和时间
  3. 支持刷新当前页和远程分页
-->
<template>
  <div class="download-logs-view">
    <NCard :title="t('layout.downloadLogs')">
      <template #header-extra>
        <NButton :loading="loading" @click="loadLogs">
          {{ t("downloadLog.refresh") }}
        </NButton>
      </template>

      <!-- 手机（<768）：记录卡片化，不再横滚表格（tech-视觉基线 §4.2） -->
      <template v-if="isMobile">
        <RecordCardList
          :columns="columns"
          :data="rows"
          :loading="loading"
          :row-key="(row: WebDownloadLog) => row.log_id"
        />
        <NPagination
          class="card-pagination"
          :page="pagination.page"
          :page-size="pagination.pageSize"
          :item-count="pagination.itemCount"
          @update:page="handleCardPageChange"
        />
      </template>
      <NDataTable
        v-else
        :columns="columns"
        :data="rows"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: WebDownloadLog) => row.log_id"
        :scroll-x="1810"
        :bordered="false"
        striped
        remote
        @update:page="handlePageChange"
      />
    </NCard>

    <UserInfoDialog ref="userInfoDialogRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  NButton,
  NCard,
  NDataTable,
  NEllipsis,
  NPagination,
  useMessage,
  type DataTableColumns,
  type PaginationProps,
} from "naive-ui";
import {
  getWebDownloadLogs,
  type WebDownloadLog,
  type WebDownloadLogStatus,
} from "@/api/mark-log";
import UserInfoDialog from "@/components/UserInfoDialog.vue";
import RecordCardList from "@/components/RecordCardList.vue";
import StatusPill, { type StatusTone } from "@/components/StatusPill.vue";
import { useViewport } from "@/composables/useViewport";
import { formatAdminTimeMs } from "@/utils/time";

interface UserInfoDialogExpose {
  /** 打开用户信息弹窗。 */
  open: (userId: number) => void;
}

interface WebDownloadLogStatusMeta {
  /** 状态语义色。 */
  tone: StatusTone;
  /** i18n 文案 key。 */
  labelKey: string;
}

const { t } = useI18n();
const message = useMessage();
const { isMobile } = useViewport();

const loading = ref(false);
const rows = ref<WebDownloadLog[]>([]);
const userInfoDialogRef = ref<UserInfoDialogExpose | null>(null);

const pagination = reactive<PaginationProps>({
  page: 1,
  pageSize: 50,
  itemCount: 0,
});

/** 下载状态展示映射。 */
const statusMeta: Record<WebDownloadLogStatus, WebDownloadLogStatusMeta> = {
  start: { tone: "neutral", labelKey: "downloadLog.start" },
  success: { tone: "success", labelKey: "downloadLog.success" },
  failed: { tone: "danger", labelKey: "downloadLog.failed" },
  preflight_blocked: { tone: "warning", labelKey: "downloadLog.preflightBlocked" },
  preflight_fallback: { tone: "neutral", labelKey: "downloadLog.preflightFallback" },
};

/** 表格列定义。 */
const columns = computed<DataTableColumns<WebDownloadLog>>(() => [
  {
    title: "id",
    key: "log_id",
    width: 100,
  },
  {
    title: t("downloadLog.userId"),
    key: "user_id",
    width: 120,
    render: (row: WebDownloadLog) => renderUserButton(row.user_id),
  },
  {
    title: t("downloadLog.status"),
    key: "status",
    width: 110,
    render: (row: WebDownloadLog) => renderStatus(row),
  },
  {
    title: t("downloadLog.platform"),
    key: "platform",
    width: 120,
    render: (row: WebDownloadLog) => row.platform || "unknown",
  },
  {
    title: t("downloadLog.nodeId"),
    key: "node_id",
    width: 120,
    render: (row: WebDownloadLog) => row.node_id || "-",
  },
  {
    title: t("downloadLog.retryCount"),
    key: "retry_count",
    width: 120,
    render: (row: WebDownloadLog) =>
      typeof row.retry_count === "number" && Number.isFinite(row.retry_count)
        ? row.retry_count
        : "-",
  },
  {
    title: t("downloadLog.url"),
    key: "url",
    minWidth: 320,
    render: (row: WebDownloadLog) =>
      h(NEllipsis, { tooltip: true, lineClamp: 2 }, { default: () => row.url || "-" }),
  },
  {
    title: t("downloadLog.fileSize"),
    key: "file_size",
    width: 120,
    render: (row: WebDownloadLog) => formatFileSize(row.file_size),
  },
  {
    title: t("downloadLog.filename"),
    key: "filename",
    minWidth: 220,
    render: (row: WebDownloadLog) =>
      h(
        NEllipsis,
        { tooltip: true, lineClamp: 2 },
        { default: () => row.filename || "-" },
      ),
  },
  {
    title: t("downloadLog.errorMessage"),
    key: "error_message",
    minWidth: 280,
    render: (row: WebDownloadLog) =>
      h(
        NEllipsis,
        { tooltip: true, lineClamp: 2 },
        { default: () => row.error_message || "-" },
      ),
  },
  {
    title: t("downloadLog.time"),
    key: "mark_time",
    width: 180,
    render: (row: WebDownloadLog) => formatTime(row.mark_time),
  },
]);

/** 加载下载日志列表。 */
async function loadLogs() {
  loading.value = true;
  try {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 50;
    const data = await getWebDownloadLogs(page, pageSize);
    rows.value = data.rows;
    pagination.itemCount = data.total;
  } catch (error) {
    console.error("DownloadLogsView.loadLogs() 加载失败:", error);
    message.error(t("downloadLog.loadFailed"));
    rows.value = [];
    pagination.itemCount = 0;
  } finally {
    loading.value = false;
  }
}

/** 切换分页。 */
function handlePageChange(page: number) {
  pagination.page = page;
  void loadLogs();
}

/** 手机卡片分页：翻页后滚回列表顶部（卡片形态无表格内滚动容器）。 */
function handleCardPageChange(page: number) {
  handlePageChange(page);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** 渲染下载状态标签。 */
function renderStatus(row: WebDownloadLog) {
  const meta = statusMeta[row.status];
  if (!meta) {
    return h(StatusPill, { tone: "neutral" }, { default: () => row.status || "-" });
  }

  return h(
    StatusPill,
    { tone: meta.tone },
    { default: () => t(meta.labelKey) },
  );
}

/** 渲染通用用户信息弹窗入口。 */
function renderUserButton(userId: number | null) {
  if (userId === null || userId <= 0) {
    return "-";
  }

  return h(
    NButton,
    {
      text: true,
      type: "primary",
      class: "user-link",
      onClick: () => openUserInfo(userId),
    },
    { default: () => userId },
  );
}

/** 打开通用用户信息弹窗。 */
function openUserInfo(userId: number) {
  userInfoDialogRef.value?.open(userId);
}

/** 格式化毫秒时间戳。 */
function formatTime(value: number) {
  return formatAdminTimeMs(value);
}

/** 格式化文件大小。 */
function formatFileSize(value: number | null) {
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

onMounted(() => {
  void loadLogs();
});
</script>

<style scoped>
/* 手机卡片分页条 */
.card-pagination {
  margin-top: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
