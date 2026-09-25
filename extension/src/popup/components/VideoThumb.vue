<!--
  视频封面缩略图。
  信息卡大封面与选择器小封面共用：尺寸、圆角由外层通过 class 控制（作用于本组件根元素），
  这里只负责「图片 ↔ 占位」的兜底切换——加载失败或缺失时渲染占位图标，不破布局、不出现
  broken image。
-->
<template>
  <span class="video-thumb">
    <img v-if="src && !failed" :key="src" :src="src" alt="" @error="failed = true" />
    <span v-else class="thumb-placeholder" aria-hidden="true">
      <Icon :name="IconName.FILM" :size="placeholderSize" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DESIGN_TOKENS } from '@/core/constants/design'
import { Icon, IconName, IconSize } from '@/core/components/icons'

const props = defineProps<{
  /** 封面地址；缺省即渲染占位块。 */
  src?: string
  /** 占位图标的尺寸档位，随外层缩略图大小取用。 */
  placeholderSize?: IconSize
}>()

/** 当前 src 加载失败后置位；换封面（切换视频）时重新尝试加载。 */
const failed = ref(false)

watch(
  () => props.src,
  () => {
    failed.value = false
  }
)

const placeholderSize = computed(() => props.placeholderSize ?? IconSize.LG)
</script>

<style scoped>
.video-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  background: v-bind('DESIGN_TOKENS.GRAY_100');
}

.video-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: v-bind('DESIGN_TOKENS.GRAY_700');
}
</style>
