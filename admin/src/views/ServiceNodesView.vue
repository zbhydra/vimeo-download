<!--
  服务节点管理页面。

  功能：
  1. 列表展示 business/download 节点、启用状态和最近健康结果。
  2. 新增/编辑节点基础信息。
  3. 启停、手动健康检查。
-->
<template>
  <div class="service-nodes-view">
    <NCard :title="t('serviceNodes.title')">
      <template #header-extra>
        <NSpace :size="8">
          <StatusPill :tone="healthyBusinessCount > 0 ? 'success' : 'warning'">
            {{ t("serviceNodes.healthyBusinessCount", { count: healthyBusinessCount }) }}
          </StatusPill>
          <NButton :loading="loading" @click="loadNodes">
            {{ t("common.refresh") }}
          </NButton>
          <NButton type="primary" @click="openCreateModal">
            {{ t("serviceNodes.addNode") }}
          </NButton>
        </NSpace>
      </template>

      <NAlert
        v-if="healthyBusinessCount === 0"
        type="warning"
        :show-icon="false"
        class="node-alert"
      >
        {{ t("serviceNodes.noBusinessFallback") }}
      </NAlert>

      <NDataTable
        :columns="columns"
        :data="nodes"
        :loading="loading"
        :row-key="(row: ServiceNode) => row.node_id"
        :pagination="{ pageSize: 50 }"
        :scroll-x="SERVICE_NODES_TABLE_SCROLL_X"
        :bordered="false"
        striped
      />
    </NCard>

    <NModal
      v-model:show="showModal"
      preset="dialog"
      :show-icon="false"
      :title="editingNode ? t('serviceNodes.editNode') : t('serviceNodes.addNode')"
      :style="{ maxWidth: '760px', width: 'calc(100vw - 32px)' }"
    >
      <NForm label-placement="top">
        <div class="form-grid">
          <NFormItem :label="t('serviceNodes.nodeType')">
            <NSelect v-model:value="form.node_type" :options="nodeTypeOptions" />
          </NFormItem>
          <NFormItem :label="t('serviceNodes.name')">
            <NInput v-model:value="form.name" data-testid="service-node-name-input" />
          </NFormItem>
          <NFormItem :label="t('serviceNodes.region')">
            <NInput v-model:value="form.region" data-testid="service-node-region-input" />
          </NFormItem>
          <NFormItem :label="t('serviceNodes.weight')">
            <NInputNumber
              v-model:value="form.weight"
              :min="SERVICE_NODE_MIN_WEIGHT"
              :max="SERVICE_NODE_MAX_WEIGHT"
              :step="10"
              :precision="0"
              data-testid="service-node-weight-input"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem :label="t('serviceNodes.publicBaseUrl')" class="span-2">
            <NInput
              v-model:value="form.public_base_url"
              data-testid="service-node-public-url-input"
            />
          </NFormItem>
          <NFormItem :label="t('serviceNodes.internalBaseUrl')" class="span-2">
            <NInput
              v-model:value="form.internal_base_url"
              data-testid="service-node-internal-url-input"
            />
          </NFormItem>
          <NFormItem :label="t('serviceNodes.enabled')">
            <NSwitch v-model:value="form.enabled" />
          </NFormItem>
        </div>
      </NForm>

      <template #action>
        <NSpace justify="end">
          <NButton @click="closeModal">
            {{ t("common.cancel") }}
          </NButton>
          <NButton type="primary" :loading="saving" @click="handleSave">
            {{ t("common.confirm") }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, reactive, ref, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NEllipsis,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NSwitch,
  NTooltip,
  useMessage,
  type DataTableColumns,
  type SelectOption,
} from "naive-ui";
import {
  createServiceNode,
  disableServiceNode,
  enableServiceNode,
  getServiceNodes,
  healthCheckServiceNode,
  updateServiceNode,
  type ServiceNode,
  type ServiceNodeType,
  type ServiceNodeWritePayload,
} from "@/api/service-nodes";
import {
  buildTrustedNodeRequestTarget,
  type NodeRequestTarget,
} from "@/api/node-request";
import {
  formatNetworkRate,
  getNodeNetworkRate,
  type NodeNetworkRate,
} from "@/api/node-monitor";
import StatusPill, { type StatusTone } from "@/components/StatusPill.vue";
import { formatAdminTimeSeconds } from "@/utils/time";
import { useViewport } from "@/composables/useViewport";

const { t } = useI18n();
const message = useMessage();
const { isMobile } = useViewport();

const loading = ref(false);
const saving = ref(false);
const nodes = ref<ServiceNode[]>([]);
const healthyBusinessCount = ref(0);
const showModal = ref(false);
const editingNode = ref<ServiceNode | null>(null);
const checkingNodeIds = ref<Set<number>>(new Set());
const nodeNetworkRates = ref<Record<number, NodeNetworkRate | null>>({});
let networkRateLoadGeneration = 0;
let networkRateRefreshTimer: ReturnType<typeof setInterval> | null = null;

/** 权重为 0 时节点保留配置但不进入分配池。 */
const SERVICE_NODE_MIN_WEIGHT = 0;
/** 后端允许的节点权重上限。 */
const SERVICE_NODE_MAX_WEIGHT = 1000;
/** 当前速率刷新间隔，与后端本机监控 5 秒采样窗口保持一致。 */
const NETWORK_RATE_REFRESH_INTERVAL_MS = 5000;

/** 列宽定义（单一来源），表格横向滚动宽度按此合计（tech-视觉基线 §3：宽表必须传 scroll-x）。 */
const COLUMN_WIDTH = {
  id: 70,
  nodeType: 120,
  name: 150,
  region: 100,
  publicBaseUrl: 230,
  enabled: 90,
  health: 150,
  networkRate: 170,
  version: 130,
  updatedAt: 170,
  operation: 220,
} as const;

/** 表格横向滚动宽度 = 各列 width/minWidth 合计（当前 1600）。 */
const SERVICE_NODES_TABLE_SCROLL_X = Object.values(COLUMN_WIDTH).reduce(
  (sum, width) => sum + width,
  0,
);

const form = reactive<ServiceNodeWritePayload>({
  node_type: 2,
  name: "",
  region: "",
  public_base_url: "",
  internal_base_url: "",
  enabled: true,
  weight: 100,
});

const nodeTypeOptions = computed<SelectOption[]>(() => [
  { label: t("serviceNodes.typeBusiness"), value: 1 },
  { label: t("serviceNodes.typeDownload"), value: 2 },
]);

const columns = computed<DataTableColumns<ServiceNode>>(() => [
  { title: "ID", key: "node_id", width: COLUMN_WIDTH.id },
  {
    title: t("serviceNodes.nodeType"),
    key: "node_type",
    width: COLUMN_WIDTH.nodeType,
    render: (row) =>
      h(
        StatusPill,
        { tone: row.node_type === 1 ? "info" : "success" },
        { default: () => nodeTypeLabel(row.node_type) },
      ),
  },
  {
    title: t("serviceNodes.name"),
    key: "name",
    minWidth: COLUMN_WIDTH.name,
    render: (row) => h(NEllipsis, { tooltip: true }, { default: () => row.name }),
  },
  { title: t("serviceNodes.region"), key: "region", width: COLUMN_WIDTH.region },
  {
    title: t("serviceNodes.publicBaseUrl"),
    key: "public_base_url",
    minWidth: COLUMN_WIDTH.publicBaseUrl,
    render: (row) =>
      h(NEllipsis, { tooltip: true }, { default: () => row.public_base_url }),
  },
  {
    title: t("serviceNodes.enabled"),
    key: "enabled",
    width: COLUMN_WIDTH.enabled,
    render: (row) =>
      h(
        StatusPill,
        { tone: row.enabled ? "success" : "neutral" },
        { default: () => (row.enabled ? t("common.yes") : t("common.no")) },
      ),
  },
  {
    title: t("serviceNodes.health"),
    key: "last_health_status",
    width: COLUMN_WIDTH.health,
    render: renderHealth,
  },
  {
    title: t("serviceNodes.networkRate"),
    key: "network_rate",
    width: COLUMN_WIDTH.networkRate,
    render: renderNetworkRate,
  },
  {
    title: t("serviceNodes.version"),
    key: "version",
    width: COLUMN_WIDTH.version,
    render: (row) => row.version || "-",
  },
  {
    title: t("serviceNodes.updatedAt"),
    key: "updated_at",
    width: COLUMN_WIDTH.updatedAt,
    render: (row) => formatUnix(row.updated_at),
  },
  {
    title: t("serviceNodes.operation"),
    key: "operation",
    width: COLUMN_WIDTH.operation,
    // 移动端不固定操作列，避免固定列挤占表格横向滚动区域
    fixed: isMobile.value ? undefined : "right",
    render: renderActions,
  },
]);

function nodeTypeLabel(value: ServiceNodeType): string {
  return value === 1 ? t("serviceNodes.typeBusiness") : t("serviceNodes.typeDownload");
}

/** 健康状态语义色：1=健康，2=异常，其余未知。 */
function healthTone(value: number): StatusTone {
  if (value === 1) return "success";
  if (value === 2) return "danger";
  return "neutral";
}

function healthLabel(value: number): string {
  if (value === 1) return t("serviceNodes.healthHealthy");
  if (value === 2) return t("serviceNodes.healthUnhealthy");
  return t("serviceNodes.healthUnknown");
}

function formatUnix(value: number | null): string {
  return formatAdminTimeSeconds(value);
}

function renderHealth(row: ServiceNode) {
  const tag = h(
    StatusPill,
    { tone: healthTone(row.last_health_status) },
    { default: () => healthLabel(row.last_health_status) },
  );
  if (!row.last_error) {
    return tag;
  }
  return h(
    NTooltip,
    { trigger: "hover", placement: "top" },
    { trigger: () => tag, default: () => row.last_error },
  );
}

function renderNetworkRate(row: ServiceNode) {
  const rate = nodeNetworkRates.value[row.node_id] ?? null;
  return h(
    "div",
    { class: "service-node-network-rate" },
    [
      h("span", [
        t("serviceNodes.networkInbound"),
        " ",
        formatNetworkRate(rate?.rx_bytes_per_second),
      ]),
      h("span", [
        t("serviceNodes.networkOutbound"),
        " ",
        formatNetworkRate(rate?.tx_bytes_per_second),
      ]),
    ],
  );
}

function renderActions(row: ServiceNode) {
  const healthLoading = checkingNodeIds.value.has(row.node_id);
  return h(
    NSpace,
    { size: 6, wrap: false },
    {
      default: () => [
        h(
          NButton,
          { size: "small", tertiary: true, onClick: () => openEditModal(row) },
          { default: () => t("serviceNodes.edit") },
        ),
        h(
          NButton,
          {
            size: "small",
            tertiary: true,
            // 基线 §3 按钮语义：红（error）=删除/停用类
            type: row.enabled ? "error" : "primary",
            onClick: () => handleToggleEnabled(row),
          },
          { default: () => (row.enabled ? t("serviceNodes.disable") : t("serviceNodes.enable")) },
        ),
        h(
          NButton,
          {
            size: "small",
            tertiary: true,
            loading: healthLoading,
            onClick: () => handleHealthCheck(row),
          },
          { default: () => t("serviceNodes.healthCheck") },
        ),
      ],
    },
  );
}

async function loadNodes() {
  loading.value = true;
  try {
    const data = await getServiceNodes();
    nodes.value = data.nodes;
    healthyBusinessCount.value = data.healthy_business_count;
    void loadNodeNetworkRates(data.nodes, ++networkRateLoadGeneration);
  } catch (error) {
    console.error("ServiceNodesView.loadNodes() 加载失败:", error);
    message.error(t("serviceNodes.loadFailed"));
  } finally {
    loading.value = false;
  }
}

function setNodeNetworkRate(nodeId: number, rate: NodeNetworkRate | null) {
  nodeNetworkRates.value = {
    ...nodeNetworkRates.value,
    [nodeId]: rate,
  };
}

function refreshCurrentNodeNetworkRates() {
  if (nodes.value.length === 0) {
    return;
  }
  void loadNodeNetworkRates(nodes.value, ++networkRateLoadGeneration);
}

async function loadNodeNetworkRates(
  serviceNodes: ServiceNode[],
  generation: number,
) {
  const nextRates: Record<number, NodeNetworkRate | null> = {};
  for (const node of serviceNodes) {
    nextRates[node.node_id] = nodeNetworkRates.value[node.node_id] ?? null;
  }
  nodeNetworkRates.value = nextRates;

  await Promise.all(
    serviceNodes.map(async (node) => {
      const target: NodeRequestTarget | null = buildTrustedNodeRequestTarget(node);
      if (!target) {
        if (generation === networkRateLoadGeneration) {
          setNodeNetworkRate(node.node_id, null);
        }
        return;
      }
      try {
        const data = await getNodeNetworkRate(target);
        if (generation === networkRateLoadGeneration) {
          setNodeNetworkRate(node.node_id, data.network_rate);
        }
      } catch (error) {
        console.error(
          `ServiceNodesView.loadNodeNetworkRates() 加载节点速率失败 node_id=${node.node_id}:`,
          error,
        );
        if (generation === networkRateLoadGeneration) {
          setNodeNetworkRate(node.node_id, null);
        }
      }
    }),
  );
}

function resetForm() {
  form.node_type = 2;
  form.name = "";
  form.region = "";
  form.public_base_url = "";
  form.internal_base_url = "";
  form.enabled = true;
  form.weight = 100;
}

function openCreateModal() {
  editingNode.value = null;
  resetForm();
  showModal.value = true;
}

function openEditModal(row: ServiceNode) {
  editingNode.value = row;
  form.node_type = row.node_type;
  form.name = row.name;
  form.region = row.region;
  form.public_base_url = row.public_base_url;
  form.internal_base_url = row.internal_base_url;
  form.enabled = row.enabled;
  form.weight = row.weight;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
}

function validateForm(): boolean {
  if (!form.name.trim() || !form.region.trim()) {
    message.error(t("serviceNodes.nameRegionRequired"));
    return false;
  }
  if (!form.public_base_url.trim() || !form.internal_base_url.trim()) {
    message.error(t("serviceNodes.urlRequired"));
    return false;
  }
  if (
    !Number.isInteger(form.weight) ||
    form.weight < SERVICE_NODE_MIN_WEIGHT ||
    form.weight > SERVICE_NODE_MAX_WEIGHT
  ) {
    message.error(t("serviceNodes.weightInvalid"));
    return false;
  }
  return true;
}

function normalizedPayload(): ServiceNodeWritePayload {
  return {
    node_type: form.node_type,
    name: form.name.trim(),
    region: form.region.trim(),
    public_base_url: form.public_base_url.trim(),
    internal_base_url: form.internal_base_url.trim(),
    enabled: form.enabled,
    weight: form.weight,
  };
}

async function handleSave() {
  if (!validateForm()) return;
  saving.value = true;
  try {
    if (editingNode.value) {
      await updateServiceNode(editingNode.value.node_id, normalizedPayload());
    } else {
      await createServiceNode(normalizedPayload());
    }
    message.success(t("common.success"));
    closeModal();
    await loadNodes();
  } catch (error) {
    console.error("ServiceNodesView.handleSave() 保存失败:", error);
    message.error(t("serviceNodes.saveFailed"));
  } finally {
    saving.value = false;
  }
}

async function handleToggleEnabled(row: ServiceNode) {
  try {
    if (row.enabled) {
      await disableServiceNode(row.node_id);
    } else {
      await enableServiceNode(row.node_id);
    }
    await loadNodes();
  } catch (error) {
    console.error("ServiceNodesView.handleToggleEnabled() 失败:", error);
    message.error(t("serviceNodes.actionFailed"));
  }
}

async function handleHealthCheck(row: ServiceNode) {
  checkingNodeIds.value = new Set([...checkingNodeIds.value, row.node_id]);
  try {
    const data = await healthCheckServiceNode(row.node_id);
    message[data.diagnosis.healthy ? "success" : "warning"](
      data.diagnosis.healthy
        ? t("serviceNodes.healthCheckHealthy")
        : t("serviceNodes.healthCheckUnhealthy"),
    );
    await loadNodes();
  } catch (error) {
    console.error("ServiceNodesView.handleHealthCheck() 失败:", error);
    message.error(t("serviceNodes.healthCheckFailed"));
  } finally {
    const next = new Set(checkingNodeIds.value);
    next.delete(row.node_id);
    checkingNodeIds.value = next;
  }
}

onMounted(() => {
  void loadNodes();
  networkRateRefreshTimer = setInterval(
    refreshCurrentNodeNetworkRates,
    NETWORK_RATE_REFRESH_INTERVAL_MS,
  );
});

onBeforeUnmount(() => {
  if (networkRateRefreshTimer !== null) {
    clearInterval(networkRateRefreshTimer);
    networkRateRefreshTimer = null;
  }
});
</script>

<style scoped>
.service-nodes-view {
  min-width: 0;
}

.node-alert {
  margin-bottom: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.span-2 {
  grid-column: span 2;
}

.service-node-network-rate {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #666;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: span 1;
  }
}
</style>
