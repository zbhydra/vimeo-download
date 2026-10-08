<!--
  系统设置页面。

  功能：
  1. 刷新当前业务进程内配置读取缓存，并展示刷新时间和服务列表。
  2. 查询、生成和重新生成当前管理员外部 API Key；完整 key 仅在弹窗中一次性展示。
  3. 读取和保存远端稀疏配置（顶层分组覆盖，如 vimeo）。
-->
<template>
  <div class="system-settings-view">
    <NCard>
      <!-- 移动端 segment 选项卡会溢出裁切，切换为可横向滚动的 line 类型 -->
      <NTabs v-model:value="activeTab" :type="isMobile ? 'line' : 'segment'" animated>
        <NTabPane
          name="config-cache"
          :tab="t('systemSettings.tabConfigCache')"
        >
          <section>
            <div class="tab-actions">
              <NButton
                type="primary"
                :loading="refreshingCache"
                @click="handleRefreshConfigCache"
              >
                {{ t("systemSettings.refreshConfigCache") }}
              </NButton>
            </div>

          <NAlert
            v-if="cacheRefreshResult"
            class="result-alert"
            type="success"
            :title="t('systemSettings.cacheRefreshSuccess')"
          >
            <NSpace vertical size="small">
              <NText>
                {{ t("systemSettings.refreshedAt") }}:
                {{ formatTime(cacheRefreshResult.refreshed_at) }}
              </NText>
              <NText>
                {{ t("systemSettings.refreshedServiceCount", {
                  count: cacheRefreshResult.refreshed_services.length,
                }) }}
              </NText>
              <NList
                v-if="cacheRefreshResult.refreshed_services.length > 0"
                size="small"
                bordered
              >
                <NListItem
                  v-for="service in cacheRefreshResult.refreshed_services"
                  :key="service"
                >
                  <code>{{ service }}</code>
                </NListItem>
              </NList>
            </NSpace>
          </NAlert>
          </section>
        </NTabPane>

        <NTabPane
          name="api-key"
          :tab="t('systemSettings.tabApiKey')"
        >
          <section>
            <div class="tab-actions">
              <NButton
                type="primary"
                ghost
                :loading="generatingApiKey"
                :disabled="!canGenerateApiKey"
                @click="handleGenerateApiKey"
              >
                {{ apiKeyMeta && apiKeyMeta.has_api_key
                  ? t("systemSettings.regenerateApiKey")
                  : t("systemSettings.generateApiKey") }}
              </NButton>
            </div>

          <NAlert
            v-if="showApiKeyUnknownAlert"
            class="unknown-alert"
            type="warning"
            :title="t('systemSettings.apiKeyUnknownTitle')"
          >
            <NSpace vertical size="small">
              <NText>{{ t("systemSettings.apiKeyUnknownDescription") }}</NText>
              <NButton size="small" :loading="apiKeyLoading" @click="loadApiKeyMeta">
                {{ t("common.refresh") }}
              </NButton>
            </NSpace>
          </NAlert>

          <NSpin :show="apiKeyLoading">
            <NDescriptions
              label-placement="left"
              :column="1"
              bordered
              size="small"
            >
              <NDescriptionsItem :label="t('systemSettings.apiKeyStatus')">
                <StatusPill :tone="apiKeyMeta?.has_api_key ? 'success' : 'neutral'">
                  {{ apiKeyMeta?.has_api_key
                    ? t("systemSettings.generated")
                    : t("systemSettings.notGenerated") }}
                </StatusPill>
              </NDescriptionsItem>
              <NDescriptionsItem :label="t('systemSettings.apiKeyPrefix')">
                <code>{{ apiKeyMeta?.api_key_prefix || "-" }}</code>
              </NDescriptionsItem>
              <NDescriptionsItem :label="t('systemSettings.apiKeyCreatedAt')">
                {{ formatTime(apiKeyMeta?.api_key_created_at ?? null) }}
              </NDescriptionsItem>
            </NDescriptions>
          </NSpin>
          </section>
        </NTabPane>


        <NTabPane
          name="remote-config"
          :tab="t('systemSettings.tabRemoteConfig')"
        >
          <section>
            <NAlert
              v-if="remoteConfigLoadError"
              class="unknown-alert"
              type="error"
              :title="t('systemSettings.remoteConfigLoadFailedTitle')"
            >
              <NSpace vertical size="small">
                <NText>{{ remoteConfigLoadError }}</NText>
                <NButton
                  size="small"
                  :loading="remoteConfigLoading"
                  @click="loadRemoteConfig"
                >
                  {{ t("systemSettings.remoteConfigRetry") }}
                </NButton>
              </NSpace>
            </NAlert>

            <NSpin :show="remoteConfigLoading">
              <NForm :disabled="remoteConfigSaving">
                <NFormItem
                  :label="t('systemSettings.remoteConfigJsonLabel')"
                  :validation-status="remoteConfigValidationError ? 'error' : undefined"
                  :feedback="remoteConfigValidationError"
                >
                  <NInput
                    v-model:value="remoteConfigText"
                    class="remote-config-input"
                    type="textarea"
                    :rows="18"
                    placeholder="{}"
                  />
                </NFormItem>
                <NText depth="3" class="remote-config-hint">
                  {{ t("systemSettings.remoteConfigHint") }}
                </NText>
                <div class="form-actions">
                  <NButton
                    type="primary"
                    :loading="remoteConfigSaving"
                    :disabled="!remoteConfigLoaded"
                    @click="handleSaveRemoteConfig"
                  >
                    {{ t("systemSettings.saveRemoteConfig") }}
                  </NButton>
                </div>
              </NForm>
            </NSpin>
          </section>
        </NTabPane>
      </NTabs>
    </NCard>

    <NModal
      :show="showGeneratedApiKeyModal"
      preset="card"
      class="generated-api-key-modal"
      :title="t('systemSettings.generatedApiKeyTitle')"
      @update:show="handleGeneratedApiKeyModalUpdate"
    >
      <NSpace vertical size="small">
        <NAlert type="warning">
          {{ t("systemSettings.generatedApiKeyNotice") }}
        </NAlert>
        <div class="api-key-box">
          <code>{{ generatedApiKey }}</code>
          <NButton size="small" @click="handleCopyGeneratedApiKey">
            {{ t("systemSettings.copyApiKey") }}
          </NButton>
        </div>
      </NSpace>
    </NModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  NAlert,
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NForm,
  NFormItem,
  NInput,
  NList,
  NListItem,
  NModal,
  NSpace,
  NSpin,
  NTabPane,
  NTabs,
  NText,
  useDialog,
  useMessage,
} from "naive-ui";
import {
  generateAdminApiKey,
  getAdminApiKeyMeta,
  getRemoteConfig,
  refreshConfigCache,
  saveRemoteConfig,
  type AdminApiKeyMeta,
  type ConfigCacheRefreshResult,
  type JsonValue,
  type RemoteConfig,
} from "@/api/system-settings";
import { formatAdminTimeMs } from "@/utils/time";
import StatusPill from "@/components/StatusPill.vue";
import { useViewport } from "@/composables/useViewport";

const { t } = useI18n();
const dialog = useDialog();
const message = useMessage();
const { isMobile } = useViewport();

const refreshingCache = ref(false);
const apiKeyLoading = ref(false);
const generatingApiKey = ref(false);
const remoteConfigLoading = ref(false);
const remoteConfigSaving = ref(false);
const remoteConfigLoaded = ref(false);
const remoteConfigLoadAttempted = ref(false);
const activeTab = ref("config-cache");
const cacheRefreshResult = ref<ConfigCacheRefreshResult | null>(null);
const apiKeyMeta = ref<AdminApiKeyMeta | null>(null);
const generatedApiKey = ref("");
const showGeneratedApiKeyModal = ref(false);
const remoteConfigText = ref("{}");
const remoteConfigLoadError = ref("");
const remoteConfigValidationError = ref("");

/** 只有已知 API Key 状态时才允许生成，避免加载失败时绕过重新生成确认。 */
const canGenerateApiKey = computed(
  () => !apiKeyLoading.value && !generatingApiKey.value && apiKeyMeta.value !== null,
);

/** API Key 状态未知时给管理员明确重试入口。 */
const showApiKeyUnknownAlert = computed(
  () => !apiKeyLoading.value && apiKeyMeta.value === null,
);

/** 格式化毫秒时间戳。 */
function formatTime(value: number | null) {
  return formatAdminTimeMs(value);
}

/** 初始加载 API Key 元信息。 */
async function loadApiKeyMeta() {
  apiKeyLoading.value = true;
  try {
    apiKeyMeta.value = null;
    apiKeyMeta.value = await getAdminApiKeyMeta();
  } catch (error) {
    console.error("SystemSettingsView.loadApiKeyMeta() 加载失败:", error);
    message.error(
      getErrorMessage(
        error instanceof Error ? error : null,
        t("systemSettings.apiKeyLoadFailed"),
      ),
    );
    apiKeyMeta.value = null;
  } finally {
    apiKeyLoading.value = false;
  }
}

/** 刷新配置读取缓存。 */
async function handleRefreshConfigCache() {
  refreshingCache.value = true;
  try {
    cacheRefreshResult.value = await refreshConfigCache();
    message.success(t("systemSettings.cacheRefreshSuccess"));
  } catch (error) {
    console.error("SystemSettingsView.handleRefreshConfigCache() 刷新失败:", error);
    message.error(
      getErrorMessage(
        error instanceof Error ? error : null,
        t("systemSettings.cacheRefreshFailed"),
      ),
    );
  } finally {
    refreshingCache.value = false;
  }
}

/** 优先展示后端返回的业务错误 msg，避免丢失可定位原因。 */
function getErrorMessage(error: Error | null, fallback: string) {
  return error?.message || fallback;
}

/** 首次进入远端配置 tab 时读取当前稀疏对象。 */
async function loadRemoteConfig() {
  remoteConfigLoadAttempted.value = true;
  remoteConfigLoading.value = true;
  remoteConfigLoadError.value = "";
  try {
    const config = await getRemoteConfig();
    remoteConfigText.value = JSON.stringify(config, null, 2);
    remoteConfigLoaded.value = true;
  } catch (error) {
    console.error("SystemSettingsView.loadRemoteConfig() 加载失败:", error);
    remoteConfigLoaded.value = false;
    remoteConfigLoadError.value = getErrorMessage(
      error instanceof Error ? error : null,
      t("systemSettings.remoteConfigLoadFailed"),
    );
    message.error(remoteConfigLoadError.value);
  } finally {
    remoteConfigLoading.value = false;
  }
}

/** 只校验合法 JSON 和顶层对象，分组内的字段由客户端消费。 */
function parseRemoteConfig(): RemoteConfig | null {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(remoteConfigText.value) as JsonValue;
  } catch (error) {
    console.error("SystemSettingsView.parseRemoteConfig() JSON 解析失败:", error);
    remoteConfigValidationError.value = t(
      "systemSettings.remoteConfigJsonInvalid",
    );
    return null;
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    remoteConfigValidationError.value = t(
      "systemSettings.remoteConfigTopObjectInvalid",
    );
    return null;
  }

  return parsed as RemoteConfig;
}

/** 原样保存当前文本解析出的远端稀疏配置对象。 */
async function handleSaveRemoteConfig() {
  const config = parseRemoteConfig();
  if (config === null) return;

  remoteConfigSaving.value = true;
  try {
    await saveRemoteConfig(config);
    message.success(t("systemSettings.remoteConfigSaveSuccess"));
  } catch (error) {
    console.error("SystemSettingsView.handleSaveRemoteConfig() 保存失败:", error);
    message.error(
      getErrorMessage(
        error instanceof Error ? error : null,
        t("systemSettings.remoteConfigSaveFailed"),
      ),
    );
  } finally {
    remoteConfigSaving.value = false;
  }
}

/** 根据当前状态决定直接生成或先确认重新生成。 */
function handleGenerateApiKey() {
  if (apiKeyMeta.value === null) {
    message.warning(t("systemSettings.apiKeyUnknownDescription"));
    return;
  }

  if (!apiKeyMeta.value.has_api_key) {
    void generateApiKeyAfterConfirm();
    return;
  }

  dialog.warning({
    title: t("systemSettings.regenerateApiKey"),
    content: t("systemSettings.regenerateConfirm"),
    positiveText: t("common.confirm"),
    negativeText: t("common.cancel"),
    onPositiveClick: () => {
      void generateApiKeyAfterConfirm();
    },
  });
}

/** 生成 API Key，并将完整 key 仅保存到当前页面状态中。 */
async function generateApiKeyAfterConfirm() {
  generatingApiKey.value = true;
  try {
    const data = await generateAdminApiKey();
    apiKeyMeta.value = {
      has_api_key: true,
      api_key_prefix: data.api_key_prefix,
      api_key_created_at: data.api_key_created_at,
    };
    generatedApiKey.value = data.api_key;
    showGeneratedApiKeyModal.value = true;
    message.success(t("systemSettings.apiKeyGenerateSuccess"));
  } catch (error) {
    console.error("SystemSettingsView.generateApiKeyAfterConfirm() 生成失败:", error);
    message.error(
      getErrorMessage(
        error instanceof Error ? error : null,
        t("systemSettings.apiKeyGenerateFailed"),
      ),
    );
  } finally {
    generatingApiKey.value = false;
  }
}

/** 关闭一次性 API Key 弹窗时立即清空完整 key。 */
function handleGeneratedApiKeyModalUpdate(show: boolean) {
  showGeneratedApiKeyModal.value = show;
  if (!show) {
    generatedApiKey.value = "";
  }
}

/** 复制本次生成的完整 API Key。 */
async function handleCopyGeneratedApiKey() {
  if (!generatedApiKey.value) return;

  try {
    await navigator.clipboard.writeText(generatedApiKey.value);
    message.success(t("systemSettings.copySuccess"));
  } catch (error) {
    console.error("SystemSettingsView.handleCopyGeneratedApiKey() 复制失败:", error);
    message.error(t("systemSettings.copyFailed"));
  }
}

onMounted(() => {
  void loadApiKeyMeta();
});

watch(activeTab, (tab) => {
  if (
    tab === "remote-config" &&
    !remoteConfigLoadAttempted.value &&
    !remoteConfigLoading.value
  ) {
    void loadRemoteConfig();
  }
});

watch(remoteConfigText, () => {
  remoteConfigValidationError.value = "";
});
</script>

<style scoped>
.system-settings-view {
  max-width: 960px;
}

.tab-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.result-alert {
  margin-top: 16px;
}

.unknown-alert {
  margin-bottom: 16px;
}


:deep(.remote-config-input textarea) {
  min-height: 360px;
  font-family: "Geist Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

.remote-config-hint {
  display: block;
  margin-bottom: 16px;
  font-size: 12px;
  line-height: 1.6;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

.api-key-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  background: var(--n-color);
}

.api-key-box code {
  flex: 1;
  min-width: 0;
  word-break: break-all;
}

:deep(.generated-api-key-modal) {
  max-width: 720px;
}

@media (max-width: 640px) {
  .api-key-box {
    align-items: stretch;
    flex-direction: column;
  }

  .tab-actions,
  .form-actions {
    justify-content: stretch;
  }
}
</style>
