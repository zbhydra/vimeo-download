<!--
  日志排查页面

  功能：
  1. 列表展示 mark_type = web_parse_failed 的 mark_logs
  2. 从 mark_msg 中展示 URL、原始日志内容
  3. 操作列提供“解析”，调用后端真实解析链路复查是否仍失败
-->
<template>
  <div class="mark-log-diagnostics-view">
    <NCard :title="t('layout.markLogDiagnostics')">
      <template #header-extra>
        <NButton :loading="loading" @click="loadLogs">
          {{ t("markLog.refresh") }}
        </NButton>
      </template>

      <NDataTable
        :columns="columns"
        :data="rows"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: WebParseFailedLogRow) => row.log_id"
        :scroll-x="1400"
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
  NSpace,
  NTag,
  NText,
  useMessage,
  type DataTableColumns,
  type PaginationProps,
} from "naive-ui";
import {
  getWebParseFailedLogs,
  retryParseWebParseFailedLog,
  type ParseRetryResult,
  type WebParseFailedLog,
} from "@/api/mark-log";
import UserInfoDialog from "@/components/UserInfoDialog.vue";
import { useViewport } from "@/composables/useViewport";
import { formatAdminTimeMs } from "@/utils/time";

const { t } = useI18n();
const message = useMessage();
const { isMobile } = useViewport();

interface UserInfoDialogExpose {
  /** 打开用户信息弹窗。 */
  open: (userId: number) => void;
}

/** 日志行状态，包含行内解析加载态与结果。 */
interface WebParseFailedLogRow extends WebParseFailedLog {
  /** 当前行是否正在解析复查。 */
  parsing: boolean;
  /** 最近一次解析复查结果。 */
  retryResult: ParseRetryResult | null;
}

const loading = ref(false);
const rows = ref<WebParseFailedLogRow[]>([]);
const userInfoDialogRef = ref<UserInfoDialogExpose | null>(null);

const pagination = reactive<PaginationProps>({
  page: 1,
  pageSize: 50,
  itemCount: 0,
});

/** 表格列定义。 */
const columns = computed<DataTableColumns<WebParseFailedLogRow>>(() => [
  {
    title: t("markLog.operation"),
    key: "operation",
    width: 96,
    // 移动端不固定操作列，避免固定列挤占表格横向滚动区域
    fixed: isMobile.value ? undefined : "left",
    render: (row: WebParseFailedLogRow) =>
      h(
        NButton,
        {
          size: "small",
          type: "primary",
          ghost: true,
          loading: row.parsing,
          disabled: row.url.length === 0,
          onClick: () => handleRetryParse(row),
        },
        { default: () => t("markLog.parse") },
      ),
  },
  {
    title: "id",
    key: "log_id",
    width: 100,
  },
  {
    title: t("markLog.userId"),
    key: "user_id",
    width: 120,
    render: (row: WebParseFailedLogRow) => renderUserButton(row.user_id),
  },
  {
    title: t("markLog.time"),
    key: "mark_time",
    width: 180,
    render: (row: WebParseFailedLogRow) => formatTime(row.mark_time),
  },
  {
    title: "url",
    key: "url",
    minWidth: 280,
    render: (row: WebParseFailedLogRow) =>
      h(NEllipsis, { tooltip: true, lineClamp: 2 }, { default: () => row.url || "-" }),
  },
  {
    title: "mark_msg",
    key: "mark_msg",
    minWidth: 360,
    render: (row: WebParseFailedLogRow) =>
      h(
        NEllipsis,
        { tooltip: true, lineClamp: 2 },
        { default: () => row.mark_msg },
      ),
  },
  {
    title: t("markLog.result"),
    key: "retryResult",
    width: 260,
    render: (row: WebParseFailedLogRow) => renderRetryResult(row),
  },
]);

/** 加载日志列表。 */
async function loadLogs() {
  loading.value = true;
  try {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 50;
    const data = await getWebParseFailedLogs(page, pageSize);
    rows.value = data.rows.map((row: WebParseFailedLog) => ({
      ...row,
      parsing: false,
      retryResult: null,
    }));
    pagination.itemCount = data.total;
  } catch (error) {
    console.error("MarkLogDiagnosticsView.loadLogs() 加载失败:", error);
    message.error(t("markLog.loadFailed"));
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

/** 对单条日志重新解析。 */
async function handleRetryParse(row: WebParseFailedLogRow) {
  row.parsing = true;
  row.retryResult = null;
  try {
    row.retryResult = await retryParseWebParseFailedLog(row.log_id);
    if (row.retryResult.ok) {
      message.success(t("markLog.parseSuccess"));
    } else {
      message.warning(t("markLog.parseStillFailed"));
    }
  } catch (error) {
    console.error("MarkLogDiagnosticsView.handleRetryParse() 解析失败:", error);
    message.error(t("markLog.parseFailed"));
  } finally {
    row.parsing = false;
  }
}

/** 渲染行内解析结果。 */
function renderRetryResult(row: WebParseFailedLogRow) {
  const result = row.retryResult;
  if (!result) {
    return h(NText, { depth: 3 }, { default: () => "-" });
  }

  const tagType = result.ok ? "success" : "error";
  const label = result.ok ? t("markLog.resultOk") : t("markLog.resultFailed");
  const detail = result.ok
    ? `${result.platform} / ${result.resource_count}`
    : result.reason || result.status;

  return h(
    NSpace,
    { size: 6, vertical: true },
    {
      default: () => [
        h(NTag, { type: tagType, size: "small" }, { default: () => label }),
        h(NEllipsis, { tooltip: true, lineClamp: 2 }, { default: () => detail }),
      ],
    },
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

onMounted(() => {
  void loadLogs();
});
</script>
