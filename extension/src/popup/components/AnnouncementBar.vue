<template>
  <!-- 公告条：文本/开关/链接全部来自远端配置，无 i18n 文案；空配置或已关闭时整条不渲染 -->
  <div v-if="visible" class="announcement-bar">
    <a
      v-if="announcement.url"
      class="announcement-viewport announcement-link"
      :href="announcement.url"
      :title="announcement.text"
      @click.prevent="openAnnouncement"
    >
      <span class="announcement-text" :style="marqueeStyle">{{ announcement.text }}</span>
    </a>
    <div v-else class="announcement-viewport" :title="announcement.text">
      <span class="announcement-text" :style="marqueeStyle">{{ announcement.text }}</span>
    </div>

    <button
      type="button"
      class="announcement-close"
      :aria-label="t(I18N_KEYS.APP_ERROR.DISMISS)"
      @click="dismiss"
    >
      <Icon :name="IconName.X_MARK" :size="IconSize.XS" />
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * Popup footer 公告跑马灯。
 *
 * 数据源是远端配置（background 统一代读 → createRemoteConfigStore 稀疏覆盖）：每个 popup
 * 只读一次远端，读取失败沿用包内默认值（无公告）。× 本期只关闭当前 popup 会话，不写存储。
 * 跑马灯用单段 CSS 平移动画（右进左出循环），reduced-motion 时退化为静态省略文本。
 */

import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { BackgroundChannel } from '@/popup/rpc/background.rpc'
import {
  ANNOUNCEMENT_GROUP,
  announcementConfig,
  hasAnnouncementContent,
  pickAnnouncementConfig,
  type AnnouncementConfig
} from '@/core/api/remote-config'
import { createRemoteConfigStore } from '@/core/remoteConfig/createRemoteConfigStore'
import { openExternalPage } from '@/core/utils/navigation'
import { COMMON_COLORS } from '@/core/constants/style'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { I18N_KEYS } from '@/core/constants/i18n'

const { t } = useI18n()

/** 公告配置 store：远端分组稀疏覆盖经字段校验后合并到包内默认值。 */
const announcementStore = createRemoteConfigStore({
  defaults: { [ANNOUNCEMENT_GROUP]: announcementConfig },
  groups: [ANNOUNCEMENT_GROUP],
  pick: override => pickAnnouncementConfig(override),
  label: 'AnnouncementConfig',
  loadRemote: () => new BackgroundChannel().getRemoteConfig()
})

/** 当前生效的公告；初始为包内默认（无公告），远端读取完成前不渲染内容。 */
const announcement = ref<AnnouncementConfig>({ ...announcementConfig })

/** 本次 popup 会话内的关闭状态；不持久化，重开 popup 会重新展示有效公告。 */
const dismissed = ref(false)

const visible = computed(() => !dismissed.value && hasAnnouncementContent(announcement.value))

onMounted(async () => {
  await announcementStore.load()
  // store 原地覆盖默认组对象，这里必须克隆：保持 ref 引用变化才能触发渲染。
  announcement.value = { ...announcementStore.get()[ANNOUNCEMENT_GROUP] }
})

/** 滚动时长按文本长度线性放大：短文本保底 10s，长文本放慢到可读完。 */
const marqueeStyle = computed(() => ({
  animationDuration: `${Math.max(10, Math.round(announcement.value.text.length * 0.28))}s`
}))

/** 公告可点击时在新标签页打开运营页；打开失败已由 openExternalPage 记录日志。 */
async function openAnnouncement(): Promise<void> {
  const url = announcement.value.url
  if (url) {
    await openExternalPage(url, 'announcement')
  }
}

/** 关闭本次会话的公告。 */
function dismiss(): void {
  dismissed.value = true
}
</script>

<style scoped>
.announcement-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 4px 6px 4px 12px;
  box-sizing: border-box;
  border-top: 1px solid v-bind('COMMON_COLORS.GRAY_200');
  background: v-bind('COMMON_COLORS.GRAY_50');
}

.announcement-viewport {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.announcement-link {
  text-decoration: none;
}

.announcement-text {
  display: inline-block;
  white-space: nowrap;
  color: v-bind('COMMON_COLORS.GRAY_600');
  font-size: 12px;
  line-height: 20px;
  animation: announcement-marquee 12s linear infinite;
}

.announcement-link:hover .announcement-text {
  color: v-bind('COMMON_COLORS.PRIMARY');
  text-decoration: underline;
  text-underline-offset: 2px;
}

@keyframes announcement-marquee {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(-100%);
  }
}

.announcement-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: v-bind('COMMON_COLORS.GRAY_500');
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.announcement-close:hover {
  background: v-bind('COMMON_COLORS.GRAY_100');
  color: v-bind('COMMON_COLORS.GRAY_800');
}

.announcement-close:focus-visible {
  outline: 2px solid #ffffff;
  box-shadow: 0 0 0 4px v-bind('COMMON_COLORS.PRIMARY');
}

@media (prefers-reduced-motion: reduce) {
  .announcement-text {
    animation: none;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .announcement-close {
    transition: none;
  }
}
</style>
