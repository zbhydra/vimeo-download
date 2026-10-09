<!--
  筛选区容器。

  桌面 / 平板直接平铺内容；手机（< 768）默认收起，展示「筛选」开关按钮，
  点击后展开——避免筛选表单把手机首屏占满、列表内容被推到不可见。
-->
<template>
  <div class="filter-panel">
    <NButton
      v-if="isMobile"
      class="filter-panel-toggle"
      size="small"
      :type="expanded ? 'primary' : 'default'"
      data-testid="filter-panel-toggle"
      @click="expanded = !expanded"
    >
      <template #icon>
        <NIcon><FilterOutlined /></NIcon>
      </template>
      {{ t("common.filter") }}
    </NButton>
    <div v-show="!isMobile || expanded" class="filter-panel-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { NButton, NIcon } from "naive-ui";
import { FilterOutlined } from "@vicons/antd";
import { useViewport } from "@/composables/useViewport";

const { t } = useI18n();
const { isMobile } = useViewport();

const expanded = ref(false);
</script>

<style scoped>
.filter-panel-toggle {
  margin-bottom: 12px;
}
</style>
