<!-- 代理池配置管理页面：列表筛选、批量新增、编辑启停和物理删除。 -->
<template>
  <div class="proxy-pool-view">
    <NCard :title="t('proxyPool.title')">
      <template #header-extra>
        <NSpace :size="8">
          <NButton :loading="loading" @click="loadEntries">
            <template #icon>
              <NIcon><ReloadOutlined /></NIcon>
            </template>
            {{ t("common.refresh") }}
          </NButton>
          <NButton type="primary" @click="openCreateModal">
            <template #icon>
              <NIcon><PlusOutlined /></NIcon>
            </template>
            {{ t("proxyPool.add") }}
          </NButton>
        </NSpace>
      </template>

      <NForm label-placement="top" class="proxy-pool-filter-form">
        <div class="filter-grid">
          <NFormItem :label="t('proxyPool.name')">
            <NInput v-model:value="filters.name" clearable />
          </NFormItem>
          <NFormItem :label="t('proxyPool.type')">
            <NSelect v-model:value="filters.proxyType" :options="proxyTypeFilterOptions" clearable />
          </NFormItem>
          <NFormItem :label="t('proxyPool.protocol')">
            <NInput v-model:value="filters.protocol" clearable />
          </NFormItem>
          <NFormItem :label="t('proxyPool.countryCode')">
            <NInput v-model:value="filters.countryCode" clearable />
          </NFormItem>
          <NFormItem :label="t('proxyPool.enabled')">
            <NSelect v-model:value="filters.enabled" :options="enabledFilterOptions" clearable />
          </NFormItem>
          <div class="filter-actions">
            <NButton type="primary" @click="handleSearch">
              <template #icon>
                <NIcon><SearchOutlined /></NIcon>
              </template>
              {{ t("proxyPool.search") }}
            </NButton>
            <NButton @click="handleReset">{{ t("proxyPool.reset") }}</NButton>
          </div>
        </div>
      </NForm>

      <template v-if="isMobile">
        <RecordCardList
          :columns="columns"
          :data="rows"
          :loading="loading"
          :action-keys="['operation']"
          :row-key="(row: ProxyPoolEntrySummary) => row.proxy_id"
        />
        <NPagination
          class="card-pagination"
          :page="pagination.page"
          :page-size="pagination.pageSize"
          :item-count="pagination.itemCount"
          :page-sizes="pagination.pageSizes"
          :show-size-picker="pagination.showSizePicker"
          @update:page="handlePageChange"
          @update:page-size="handlePageSizeChange"
        />
      </template>
      <NDataTable
        v-else
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(row: ProxyPoolEntrySummary) => row.proxy_id"
        :pagination="pagination"
        :scroll-x="PROXY_POOL_TABLE_SCROLL_X"
        :bordered="false"
        striped
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <NModal
      v-model:show="showModal"
      preset="dialog"
      :show-icon="false"
      :title="editingProxyId === null ? t('proxyPool.add') : t('proxyPool.edit')"
      :style="{ maxWidth: '760px', width: 'calc(100vw - 32px)' }"
    >
      <NSpin :show="detailLoading">
        <NForm label-placement="top" :disabled="saving || detailLoading">
          <div class="form-grid">
            <NFormItem :label="t('proxyPool.name')">
              <NInput v-model:value="form.name" />
            </NFormItem>
            <NFormItem :label="t('proxyPool.type')">
              <NSelect v-model:value="form.proxy_type" :options="proxyTypeOptions" />
            </NFormItem>
            <NFormItem :label="t('proxyPool.protocol')">
              <NInput v-model:value="form.protocol" />
            </NFormItem>
            <NFormItem :label="t('proxyPool.countryCode')">
              <NInput v-model:value="form.country_code" maxlength="2" />
            </NFormItem>
            <NFormItem :label="t('proxyPool.enabled')">
              <NSwitch v-model:value="form.enabled" />
            </NFormItem>

            <NFormItem v-if="form.proxy_type === PROXY_TYPE_DYNAMIC" :label="t('proxyPool.dynamicUrl')" class="span-2">
              <NInput v-model:value="form.dynamic_url" />
            </NFormItem>

            <template v-else>
              <NFormItem :label="t('proxyPool.host')">
                <NInput v-model:value="form.host" />
              </NFormItem>
              <NFormItem :label="t('proxyPool.port')">
                <NInputNumber v-model:value="form.port" :min="1" :max="65535" style="width: 100%" />
              </NFormItem>
              <NFormItem :label="t('proxyPool.username')">
                <NInput v-model:value="form.username" />
              </NFormItem>
              <NFormItem :label="t('proxyPool.password')">
                <NInput v-model:value="form.password" type="password" show-password-on="click" />
              </NFormItem>
              <NFormItem v-if="editingProxyId === null" :label="t('proxyPool.staticBatch')" class="span-2">
                <NInput
                  v-model:value="staticBatchText"
                  type="textarea"
                  :rows="4"
                  :placeholder="t('proxyPool.staticBatchPlaceholder')"
                />
              </NFormItem>
            </template>
          </div>
        </NForm>
      </NSpin>

      <template #action>
        <NSpace justify="end">
          <NButton @click="showModal = false">{{ t("common.cancel") }}</NButton>
          <NButton type="primary" :loading="saving" :disabled="detailLoading" @click="handleSave">
            {{ t("common.confirm") }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
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
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NModal,
  NPagination,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  useDialog,
  useMessage,
  type DataTableColumns,
  type PaginationProps,
  type SelectOption,
} from "naive-ui";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@vicons/antd";
import {
  batchCreateProxyPoolEntries,
  deleteProxyPoolEntry,
  getProxyPoolEntries,
  getProxyPoolEntry,
  updateProxyPoolEntry,
  type ProxyPoolEntry,
  type ProxyPoolEntrySummary,
  type ProxyPoolEntryType,
  type ProxyPoolEntryWritePayload,
  type ProxyPoolListParams,
} from "@/api/proxy-pool";
import RecordCardList from "@/components/RecordCardList.vue";
import StatusPill from "@/components/StatusPill.vue";
import { useViewport } from "@/composables/useViewport";
import { formatAdminTimeMs } from "@/utils/time";

const PROXY_TYPE_DYNAMIC: ProxyPoolEntryType = 1;
const PROXY_TYPE_STATIC: ProxyPoolEntryType = 2;
const { t } = useI18n();
const message = useMessage();
const dialog = useDialog();
const { isMobile } = useViewport();

const loading = ref(false);
const saving = ref(false);
const detailLoading = ref(false);
const showModal = ref(false);
const editingProxyId = ref<number | null>(null);
const rows = ref<ProxyPoolEntrySummary[]>([]);
const staticBatchText = ref("");

const filters = reactive<{
  name: string;
  proxyType: ProxyPoolEntryType | null;
  protocol: string;
  countryCode: string;
  /** NSelect 值不支持 boolean，用字符串枚举承载，构造查询参数时转回 boolean。 */
  enabled: "true" | "false" | null;
}>({
  name: "",
  proxyType: null,
  protocol: "",
  countryCode: "",
  enabled: null,
});

const form = reactive<ProxyPoolEntryWritePayload>({
  name: "",
  proxy_type: PROXY_TYPE_STATIC,
  protocol: "http",
  dynamic_url: null,
  host: null,
  port: null,
  username: null,
  password: null,
  country_code: null,
  enabled: true,
});

const pagination = reactive<PaginationProps>({
  page: 1,
  pageSize: 50,
  itemCount: 0,
  pageSizes: [20, 50, 100],
  showSizePicker: true,
});

const proxyTypeOptions = computed<SelectOption[]>(() => [
  { label: t("proxyPool.typeDynamic"), value: PROXY_TYPE_DYNAMIC },
  { label: t("proxyPool.typeStatic"), value: PROXY_TYPE_STATIC },
]);

const proxyTypeFilterOptions = proxyTypeOptions;
const enabledFilterOptions = computed<SelectOption[]>(() => [
  { label: t("common.yes"), value: "true" },
  { label: t("common.no"), value: "false" },
]);

const PROXY_POOL_TABLE_SCROLL_X = 1280;

const columns = computed<DataTableColumns<ProxyPoolEntrySummary>>(() => [
  { title: "ID", key: "proxy_id", width: 80 },
  {
    title: t("proxyPool.name"),
    key: "name",
    width: 170,
    render: (row) => h(NEllipsis, { tooltip: true }, { default: () => row.name }),
  },
  {
    title: t("proxyPool.type"),
    key: "proxy_type",
    width: 110,
    render: (row) =>
      h(StatusPill, { tone: row.proxy_type === PROXY_TYPE_DYNAMIC ? "info" : "success" }, {
        default: () => proxyTypeLabel(row.proxy_type),
      }),
  },
  {
    title: t("proxyPool.protocol"),
    key: "protocol",
    width: 120,
    render: (row) => h(NEllipsis, { tooltip: true }, { default: () => row.protocol }),
  },
  {
    title: t("proxyPool.endpoint"),
    key: "endpoint",
    width: 260,
    render: (row) => h(NEllipsis, { tooltip: true }, { default: () => endpointLabel(row) }),
  },
  { title: t("proxyPool.countryCode"), key: "country_code", width: 100 },
  {
    title: t("proxyPool.enabled"),
    key: "enabled",
    width: 100,
    render: (row) =>
      h(StatusPill, { tone: row.enabled ? "success" : "neutral" }, {
        default: () => (row.enabled ? t("common.yes") : t("common.no")),
      }),
  },
  {
    title: t("proxyPool.updatedAt"),
    key: "updated_at",
    width: 180,
    render: (row) => formatAdminTimeMs(row.updated_at),
  },
  {
    title: t("proxyPool.operation"),
    key: "operation",
    width: 150,
    fixed: isMobile.value ? undefined : "right",
    render: (row) =>
      h(NSpace, { size: 4 }, {
        default: () => [
          h(NButton, {
            size: "small",
            tertiary: true,
            onClick: () => void openEditModal(row),
          }, {
            icon: () => h(NIcon, null, { default: () => h(EditOutlined) }),
            default: () => t("proxyPool.edit"),
          }),
          h(NButton, {
            size: "small",
            tertiary: true,
            type: "error",
            onClick: () => confirmDelete(row),
          }, {
            icon: () => h(NIcon, null, { default: () => h(DeleteOutlined) }),
            default: () => t("proxyPool.delete"),
          }),
        ],
      }),
  },
]);

function proxyTypeLabel(value: ProxyPoolEntryType): string {
  return value === PROXY_TYPE_DYNAMIC ? t("proxyPool.typeDynamic") : t("proxyPool.typeStatic");
}

function endpointLabel(row: ProxyPoolEntrySummary): string {
  if (row.proxy_type === PROXY_TYPE_DYNAMIC) return row.dynamic_url || "-";
  if (!row.host) return "-";
  return `${row.host}:${row.port ?? "-"}`;
}

async function loadEntries() {
  loading.value = true;
  try {
    const data = await getProxyPoolEntries(buildListParams());
    rows.value = data.rows;
    pagination.itemCount = data.total;
    pagination.page = data.page;
    pagination.pageSize = data.page_size;
  } catch {
    console.error("ProxyPoolView.loadEntries: request failed");
    message.error(t("proxyPool.loadFailed"));
    rows.value = [];
    pagination.itemCount = 0;
  } finally {
    loading.value = false;
  }
}

function buildListParams(): ProxyPoolListParams {
  const params: ProxyPoolListParams = {
    page: pagination.page ?? 1,
    page_size: pagination.pageSize ?? 50,
  };
  assignTrimmed(params, "name", filters.name);
  assignTrimmed(params, "protocol", filters.protocol);
  assignTrimmed(params, "country_code", filters.countryCode);
  if (filters.proxyType !== null) params.proxy_type = filters.proxyType;
  if (filters.enabled !== null) params.enabled = filters.enabled === "true";
  return params;
}

function assignTrimmed(
  params: ProxyPoolListParams,
  key: "name" | "protocol" | "country_code",
  value: string,
) {
  const normalized = value.trim();
  if (normalized) params[key] = normalized;
}

function handleSearch() {
  pagination.page = 1;
  void loadEntries();
}

function handleReset() {
  filters.name = "";
  filters.proxyType = null;
  filters.protocol = "";
  filters.countryCode = "";
  filters.enabled = null;
  pagination.page = 1;
  void loadEntries();
}

function handlePageChange(page: number) {
  pagination.page = page;
  void loadEntries();
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  void loadEntries();
}

function resetForm() {
  Object.assign(form, {
    name: "",
    proxy_type: PROXY_TYPE_STATIC,
    protocol: "http",
    dynamic_url: null,
    host: null,
    port: null,
    username: null,
    password: null,
    country_code: null,
    enabled: true,
  });
  staticBatchText.value = "";
}

function openCreateModal() {
  editingProxyId.value = null;
  resetForm();
  showModal.value = true;
}

async function openEditModal(row: ProxyPoolEntrySummary) {
  editingProxyId.value = row.proxy_id;
  showModal.value = true;
  detailLoading.value = true;
  Object.assign(form, row, {
    username: null,
    password: null,
  });
  try {
    const detail = await getProxyPoolEntry(row.proxy_id);
    applyDetail(detail);
  } catch {
    console.error("ProxyPoolView.openEditModal: request failed");
    message.error(t("proxyPool.detailLoadFailed"));
    showModal.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function applyDetail(detail: ProxyPoolEntry) {
  Object.assign(form, detail);
}

function buildWriteEntries(): ProxyPoolEntryWritePayload[] {
  const base: ProxyPoolEntryWritePayload = {
    ...form,
    name: form.name.trim(),
    protocol: form.protocol.trim(),
    dynamic_url: form.dynamic_url?.trim() || null,
    host: form.host?.trim() || null,
    username: form.username?.trim() || null,
    password: form.password || null,
    country_code: form.country_code?.trim() || null,
  };
  if (editingProxyId.value !== null || base.proxy_type === PROXY_TYPE_DYNAMIC) {
    return [base];
  }
  const lines = staticBatchText.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [base];
  return lines.map((line) => {
    const parts = line.split(",").map((part) => part.trim());
    if (parts.length < 2 || parts.length > 5) {
      throw new Error("invalid static batch line");
    }
    const hasName = parts.length >= 3;
    const name = hasName ? parts[0] : base.name;
    const host = hasName ? parts[1] : parts[0];
    const portText = hasName ? parts[2] : parts[1];
    const port = Number(portText);
    if (!name || !host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("invalid static batch line");
    }
    return {
      ...base,
      name,
      host,
      port,
      username: (hasName ? parts[3] : parts[2]) || null,
      password: (hasName ? parts[4] : parts[3]) || null,
    };
  });
}

async function handleSave() {
  let entries: ProxyPoolEntryWritePayload[];
  try {
    entries = buildWriteEntries();
    if (!entries[0]?.name || !entries[0].protocol) throw new Error("required fields");
    if (entries[0].proxy_type === PROXY_TYPE_DYNAMIC && !entries[0].dynamic_url) {
      throw new Error("dynamic url required");
    }
    if (entries[0].proxy_type === PROXY_TYPE_STATIC && (!entries[0].host || entries[0].port === null)) {
      throw new Error("static endpoint required");
    }
  } catch {
    message.error(t("proxyPool.invalidForm"));
    return;
  }

  saving.value = true;
  try {
    if (editingProxyId.value === null) {
      await batchCreateProxyPoolEntries(entries);
    } else {
      await updateProxyPoolEntry(editingProxyId.value, entries[0]);
    }
    message.success(t("proxyPool.saveSuccess"));
    showModal.value = false;
    await loadEntries();
  } catch {
    console.error("ProxyPoolView.handleSave: request failed");
    message.error(t("proxyPool.saveFailed"));
  } finally {
    saving.value = false;
  }
}

function confirmDelete(row: ProxyPoolEntrySummary) {
  dialog.warning({
    title: t("proxyPool.delete"),
    content: t("proxyPool.deleteConfirm"),
    positiveText: t("common.confirm"),
    negativeText: t("common.cancel"),
    onPositiveClick: () => deleteEntry(row.proxy_id),
  });
}

async function deleteEntry(proxyId: number) {
  try {
    await deleteProxyPoolEntry(proxyId);
    message.success(t("proxyPool.deleteSuccess"));
    if ((rows.value.length === 1) && (pagination.page ?? 1) > 1) pagination.page = (pagination.page ?? 1) - 1;
    await loadEntries();
  } catch {
    console.error("ProxyPoolView.deleteEntry: request failed");
    message.error(t("proxyPool.actionFailed"));
  }
}

onMounted(() => {
  void loadEntries();
});
</script>

<style scoped>
.proxy-pool-filter-form {
  margin-bottom: 20px;
}

.filter-grid,
.form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 16px;
}

.filter-actions {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding-bottom: 4px;
}

.form-grid .span-2 {
  grid-column: span 2;
}

@media (max-width: 1023px) {
  .filter-grid,
  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .filter-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-grid .span-2 {
    grid-column: span 1;
  }

  .filter-actions {
    padding-bottom: 0;
  }
}
</style>
