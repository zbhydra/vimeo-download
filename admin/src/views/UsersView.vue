<!-- 用户管理：字面前缀查询、人工设置订阅、立即撤销本地权益。 -->
<template>
  <div class="users-view">
    <FilterPanel>
      <NForm :label-placement="isMobile ? 'top' : 'left'" :label-width="80" :show-feedback="false">
        <div class="users-filters">
          <NFormItem :label="t('userInfo.userId')">
            <NInputNumber
              v-model:value="filters.userId"
              :min="1"
              :precision="0"
              clearable
              :placeholder="t('orders.userIdPlaceholder')"
              data-testid="users-id"
              @keydown.enter="search"
            />
          </NFormItem>
          <NFormItem :label="t('userInfo.email')">
            <NInput
              v-model:value="filters.email"
              clearable
              :placeholder="t('users.emailPlaceholder')"
              data-testid="users-email"
              @keydown.enter="search"
            />
          </NFormItem>
        </div>
        <NSpace :size="8" class="users-filter-actions">
          <NButton type="primary" :loading="loading" @click="search">
            <template #icon
              ><NIcon><SearchOutlined /></NIcon
            ></template>
            {{ t("orders.search") }}
          </NButton>
          <NButton @click="reset">{{ t("orders.reset") }}</NButton>
          <NTooltip>
            <template #trigger>
              <NButton :loading="loading" :aria-label="t('common.refresh')" @click="loadUsers">
                <template #icon
                  ><NIcon><ReloadOutlined /></NIcon
                ></template>
              </NButton>
            </template>
            {{ t("common.refresh") }}
          </NTooltip>
        </NSpace>
      </NForm>
    </FilterPanel>

    <template v-if="isMobile">
      <RecordCardList
        :columns="columns"
        :data="rows"
        :loading="loading"
        :action-keys="['operation']"
        :row-key="(row: AdminUserListRow) => row.user_id"
      />
      <NPagination
        class="users-pagination"
        :page="pagination.page"
        :page-size="pagination.pageSize"
        :item-count="pagination.itemCount"
        :page-sizes="pagination.pageSizes"
        show-size-picker
        @update:page="changePage"
        @update:page-size="changePageSize"
      />
    </template>
    <NDataTable
      v-else
      :columns="columns"
      :data="rows"
      :loading="loading"
      :pagination="pagination"
      :row-key="(row: AdminUserListRow) => row.user_id"
      :scroll-x="1320"
      :bordered="false"
      striped
      remote
      @update:page="changePage"
      @update:page-size="changePageSize"
    />

    <UserInfoDialog ref="userInfoDialog" />
    <NModal
      v-model:show="showSettings"
      preset="dialog"
      :show-icon="false"
      :title="t('users.setSubscription')"
      :style="{ width: 'calc(100vw - 32px)', maxWidth: '520px' }"
    >
      <p class="users-identity">{{ editingUser?.user_id }} · {{ editingUser?.email ?? "-" }}</p>
      <NSpin :show="settingsLoading">
        <NForm v-if="settings" label-placement="top" :disabled="saving">
          <NAlert v-if="settings.is_auto_renew" type="info" class="users-notice">
            {{ t("users.autoRenewNotice") }}
          </NAlert>
          <NFormItem :label="t('users.product')">
            <NSelect
              v-model:value="productId"
              :options="productOptions"
              :disabled="settings.is_auto_renew"
              :placeholder="t('users.chooseProduct')"
              data-testid="subscription-product"
            />
          </NFormItem>
          <NFormItem
            :label="t('users.expiresAt')"
            :validation-status="timeError ? 'error' : undefined"
            :feedback="timeError"
          >
            <NInput
              v-if="isLifetime"
              :value="lifetimeText"
              readonly
              data-testid="subscription-expires"
            />
            <NInput
              v-else
              v-model:value="timeText"
              :placeholder="t('users.expiresPlaceholder')"
              data-testid="subscription-expires"
            />
          </NFormItem>
        </NForm>
        <NButton v-else-if="!settingsLoading" @click="loadSettings">{{ t("users.retry") }}</NButton>
      </NSpin>
      <template #action>
        <NSpace justify="end">
          <NButton :disabled="saving" @click="showSettings = false">{{
            t("common.cancel")
          }}</NButton>
          <NButton
            type="primary"
            :loading="saving"
            :disabled="!settings || !productId || !!timeError"
            @click="save"
          >
            {{ t("users.save") }}
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
  NAlert,
  NButton,
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
  NTooltip,
  useDialog,
  useMessage,
  type DataTableColumns,
  type PaginationProps,
  type SelectOption,
} from "naive-ui";
import { EditOutlined, ReloadOutlined, SearchOutlined, StopOutlined } from "@vicons/antd";
import {
  cancelAdminSubscription,
  getAdminSubscriptionSettings,
  getAdminUsers,
  setAdminSubscription,
  type AdminSubscriptionSettingsData,
  type AdminUserAccountStatus,
  type AdminUserListRow,
} from "@/api/users";
import FilterPanel from "@/components/FilterPanel.vue";
import RecordCardList from "@/components/RecordCardList.vue";
import StatusPill, { type StatusTone } from "@/components/StatusPill.vue";
import UserInfoDialog from "@/components/UserInfoDialog.vue";
import { useViewport } from "@/composables/useViewport";
import { formatAdminTimeMs } from "@/utils/time";

const { t } = useI18n();
const { isMobile } = useViewport();
const message = useMessage();
const dialog = useDialog();
const rows = ref<AdminUserListRow[]>([]);
const loading = ref(false);
const filters = reactive<{ userId: number | null; email: string }>({ userId: null, email: "" });
const pagination = reactive<PaginationProps>({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  pageSizes: [20, 50, 100],
  showSizePicker: true,
});
const userInfoDialog = ref<{ open: (userId: number) => void } | null>(null);
const showSettings = ref(false);
const settingsLoading = ref(false);
const saving = ref(false);
const editingUser = ref<AdminUserListRow | null>(null);
const settings = ref<AdminSubscriptionSettingsData | null>(null);
const productId = ref<string | null>(null);
const timeText = ref("");

function periodLabel(period: string | null): string {
  const keys: Record<string, string> = {
    month: "periodMonth",
    quarter: "periodQuarter",
    year: "periodYear",
    lifetime: "periodLifetime",
  };
  return period && keys[period] ? t(`users.${keys[period]}`) : (period ?? "-");
}

const productOptions = computed<SelectOption[]>(() => {
  if (!settings.value) return [];
  const options = settings.value.products.map((product) => ({
    label: `${product.name} · ${periodLabel(product.period)}`,
    value: product.product_id,
  }));
  const current = settings.value;
  if (current.product_id && !options.some((option) => option.value === current.product_id)) {
    options.unshift({
      label: `${current.product_id} · ${periodLabel(current.period)}`,
      value: current.product_id,
    });
  }
  return options;
});
const selectedPeriod = computed(() =>
  productId.value === settings.value?.product_id
    ? settings.value?.period
    : settings.value?.products.find((product) => product.product_id === productId.value)?.period,
);
const isLifetime = computed(() => selectedPeriod.value === "lifetime");
const lifetimeText = computed(() =>
  productId.value === settings.value?.product_id && settings.value?.period === "lifetime"
    ? formatAdminTimeMs(settings.value.expires_at)
    : t("users.lifetime"),
);
const parsedTime = computed(() => {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timeText.value)) return null;
  // 显式偏移绕开浏览器当地的 DST 缺口，回格式化拒绝自动调整的非法日期。
  const value = Date.parse(`${timeText.value.replace(" ", "T")}+08:00`);
  return Number.isFinite(value) && formatAdminTimeMs(value) === timeText.value ? value : null;
});
const timeError = computed(() =>
  settings.value && !isLifetime.value && parsedTime.value === null
    ? t("users.invalidTime")
    : undefined,
);

const columns = computed<DataTableColumns<AdminUserListRow>>(() => [
  {
    title: t("userInfo.userId"),
    key: "user_id",
    width: 100,
    render: (row) =>
      h(
        NButton,
        {
          text: true,
          type: "primary",
          class: "user-link",
          onClick: () => userInfoDialog.value?.open(row.user_id),
        },
        { default: () => String(row.user_id) },
      ),
  },
  {
    title: t("userInfo.email"),
    key: "email",
    width: 240,
    render: (row) => h(NEllipsis, { tooltip: true }, { default: () => row.email ?? "-" }),
  },
  {
    title: t("userInfo.accountStatus"),
    key: "account_status",
    width: 100,
    render: (row) => {
      const tones: Record<AdminUserAccountStatus, StatusTone> = {
        normal: "success",
        locked: "warning",
        deleted: "neutral",
      };
      const keys = { normal: "accountNormal", locked: "accountLocked", deleted: "accountDeleted" };
      return h(
        StatusPill,
        { tone: tones[row.account_status] },
        { default: () => t(`userInfo.${keys[row.account_status]}`) },
      );
    },
  },
  {
    title: t("userInfo.createdAt"),
    key: "created_at",
    width: 180,
    render: (row) => formatAdminTimeMs(row.created_at),
  },
  {
    title: t("userInfo.lastLoginAt"),
    key: "last_login_at",
    width: 180,
    render: (row) => formatAdminTimeMs(row.last_login_at),
  },
  {
    title: t("users.subscription"),
    key: "subscription",
    width: 140,
    render: (row) =>
      row.subscription.has_subscription
        ? `${row.subscription.product_id ?? "unlimited"} · ${periodLabel(row.subscription.period ?? "month")}`
        : t("users.noSubscription"),
  },
  {
    title: t("users.expiresAt"),
    key: "expires_at",
    width: 180,
    render: (row) => formatAdminTimeMs(row.subscription.expires_at),
  },
  {
    title: t("orders.operation"),
    key: "operation",
    width: 280,
    render: (row) =>
      h(
        NSpace,
        { size: 8 },
        {
          default: () => [
            h(
              NButton,
              { size: "small", tertiary: true, onClick: () => openSettings(row) },
              {
                icon: () => h(NIcon, null, { default: () => h(EditOutlined) }),
                default: () => t("users.setSubscription"),
              },
            ),
            h(
              NButton,
              {
                size: "small",
                tertiary: true,
                type: "error",
                disabled: !row.subscription.has_subscription,
                onClick: () => confirmCancel(row),
              },
              {
                icon: () => h(NIcon, null, { default: () => h(StopOutlined) }),
                default: () => t("users.cancelSubscription"),
              },
            ),
          ],
        },
      ),
  },
]);

async function loadUsers() {
  loading.value = true;
  try {
    const data = await getAdminUsers({
      page: pagination.page ?? 1,
      page_size: pagination.pageSize ?? 20,
      user_id: filters.userId ?? undefined,
      email: filters.email.trim() || undefined,
    });
    rows.value = data.rows;
    pagination.itemCount = data.total;
  } catch (error) {
    console.error("UsersView.loadUsers", error);
    message.error(t("users.loadFailed"));
  } finally {
    loading.value = false;
  }
}
function search() {
  pagination.page = 1;
  void loadUsers();
}
function reset() {
  filters.userId = null;
  filters.email = "";
  search();
}
function changePage(page: number) {
  pagination.page = page;
  void loadUsers();
}
function changePageSize(size: number) {
  pagination.pageSize = size;
  search();
}
function openSettings(row: AdminUserListRow) {
  editingUser.value = row;
  settings.value = null;
  showSettings.value = true;
  void loadSettings();
}
async function loadSettings() {
  if (!editingUser.value) return;
  settingsLoading.value = true;
  try {
    settings.value = await getAdminSubscriptionSettings(editingUser.value.user_id);
    productId.value = settings.value.product_id;
    timeText.value = formatAdminTimeMs(settings.value.expires_at);
  } catch (error) {
    console.error("UsersView.loadSettings", error);
    message.error(t("users.settingsFailed"));
  } finally {
    settingsLoading.value = false;
  }
}
async function save() {
  if (!settings.value || !editingUser.value || !productId.value || timeError.value) return;
  saving.value = true;
  try {
    await setAdminSubscription(editingUser.value.user_id, {
      product_id: productId.value,
      expires_at: isLifetime.value
        ? null
        : timeText.value === formatAdminTimeMs(settings.value.expires_at)
          ? settings.value.expires_at
          : parsedTime.value,
    });
    message.success(t("users.saved"));
    showSettings.value = false;
    await loadUsers();
  } catch (error) {
    console.error("UsersView.save", error);
    message.error(t("users.saveFailed"));
  } finally {
    saving.value = false;
  }
}
function confirmCancel(row: AdminUserListRow) {
  dialog.warning({
    title: t("users.cancelSubscription"),
    content: t("users.cancelConfirm", { userId: row.user_id, email: row.email ?? "-" }),
    positiveText: t("common.confirm"),
    negativeText: t("common.cancel"),
    onPositiveClick: async () => {
      try {
        await cancelAdminSubscription(row.user_id);
        message.success(t("users.cancelled"));
        await loadUsers();
      } catch (error) {
        console.error("UsersView.cancel", error);
        message.error(t("users.cancelFailed"));
        return false;
      }
    },
  });
}
onMounted(loadUsers);
</script>

<style scoped>
.users-view {
  min-width: 0;
}
.users-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.users-filters :deep(.n-input-number) {
  width: 100%;
}
.users-filter-actions {
  margin: 12px 0 20px;
}
.users-pagination {
  margin-top: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
.users-identity {
  overflow-wrap: anywhere;
  margin: 8px 0 16px;
}
.users-notice {
  margin-bottom: 16px;
}
@media (max-width: 767px) {
  .users-filters {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
}
</style>
