<!--
  通用时间范围选择器组件。

  封装 Naive UI <NDatePicker type="datetimerange">，对外暴露受控 v-model：
    - 值类型 [number, number] | null（毫秒时间戳二元组），与 OrdersView 的 datetimerange 一致。
    - 默认窗口由父组件挂载时初始化，组件本身受控、无副作用、不自动滚动。

  快捷按钮（每次打开面板点击时取当时的 Date.now() 计算）：
    - 最近 24 小时
    - 最近 7 天

  后续其它需要时间范围的 admin 页面可复用本组件。
-->
<template>
  <NDatePicker
    :value="modelValue"
    type="datetimerange"
    clearable
    :format="ADMIN_DATETIME_FORMAT"
    :shortcuts="shortcuts"
    style="width: min(400px, 100%)"
    @update:value="handleUpdate"
  />
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { NDatePicker } from "naive-ui";
import { ADMIN_DATETIME_FORMAT } from "@/utils/time";

/** 毫秒时间戳二元组或空。 */
type RangeValue = [number, number] | null;

defineProps<{ modelValue: RangeValue }>();
const emit = defineEmits<{ "update:modelValue": [value: RangeValue] }>();

const { t } = useI18n();

/**
 * 面板内快捷按钮，按 Naive UI datetimerange 的 shortcuts 约定：
 * 每个 key 为快捷项文案，value 为返回 [number, number] 的工厂函数。
 * 点击时取当时的 Date.now() 计算，保证窗口起点随点击时刻更新。
 */
const shortcuts: Record<string, () => [number, number]> = {
  [t("analytics.shortcut24h")]: () => {
    const now = Date.now();
    return [now - 24 * 3600 * 1000, now];
  },
  [t("analytics.shortcut7d")]: () => {
    const now = Date.now();
    return [now - 7 * 24 * 3600 * 1000, now];
  },
};

/** 值变更时透传给父组件。 */
function handleUpdate(value: RangeValue) {
  emit("update:modelValue", value);
}
</script>
