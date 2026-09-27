<template>
  <!-- 评分引导条：footer 上方一次性展示，评分或关闭后永久消失 -->
  <div v-if="ratingPromptPhase !== 'hidden'" class="rating-prompt">
    <template v-if="ratingPromptPhase === 'prompt'">
      <span class="rating-text">{{ t(I18N_KEYS.RATING.PROMPT) }}</span>
      <div class="rating-stars" role="group" :aria-label="t(I18N_KEYS.RATING.PROMPT)">
        <button
          v-for="star in 5"
          :key="star"
          type="button"
          class="rating-star"
          :aria-label="t(I18N_KEYS.RATING.STAR_ARIA, { stars: star })"
          @click="rate(star)"
        >
          <Icon :name="IconName.STAR" :size="IconSize.SM" />
        </button>
      </div>
    </template>

    <p v-else class="rating-text rating-thanks" role="status">
      {{ t(I18N_KEYS.RATING.THANKS) }}
    </p>

    <button
      v-if="ratingPromptPhase === 'prompt'"
      type="button"
      class="rating-close"
      :aria-label="t(I18N_KEYS.APP_ERROR.DISMISS)"
      @click="dismiss"
    >
      <Icon :name="IconName.X_MARK" :size="IconSize.XS" />
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * Popup footer 评分引导条。
 *
 * 触发与状态机在 `core/composables/ratingPrompt.ts`：登录用户首次下载成功后展示一次，
 * 1-3 星致谢收起、4-5 星跳商店占位页，× 与任意评分都写 has_rated 永久消失。
 */

import { useI18n } from 'vue-i18n'
import {
  dismissRatingPrompt,
  ratingPromptPhase,
  submitRating
} from '@/core/composables/ratingPrompt'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { COMMON_COLORS } from '@/core/constants/style'
import { I18N_KEYS } from '@/core/constants/i18n'

const { t } = useI18n()

/** 提交星级；低分走致谢态，高分交由控制器跳转商店。 */
async function rate(stars: number): Promise<void> {
  await submitRating(stars)
}

/** 点 × 永久关闭。 */
async function dismiss(): Promise<void> {
  await dismissRatingPrompt()
}
</script>

<style scoped>
.rating-prompt {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 32px;
  padding: 5px 12px;
  box-sizing: border-box;
  border-top: 1px solid v-bind('COMMON_COLORS.GRAY_200');
  background: v-bind('COMMON_COLORS.GRAY_50');
}

.rating-text {
  min-width: 0;
  margin: 0;
  color: v-bind('COMMON_COLORS.GRAY_600');
  font-size: 12px;
  line-height: 16px;
}

.rating-stars {
  display: flex;
  align-items: center;
  gap: 2px;
}

.rating-star {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: v-bind('COMMON_COLORS.WARNING');
  cursor: pointer;
  transition:
    color 150ms ease,
    transform 150ms ease;
}

.rating-star:hover {
  color: v-bind('COMMON_COLORS.WARNING_HOVER');
  transform: scale(1.15);
}

.rating-star:focus-visible {
  outline: 2px solid #ffffff;
  box-shadow: 0 0 0 4px v-bind('COMMON_COLORS.PRIMARY');
}

.rating-thanks {
  text-align: center;
}

.rating-close {
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

.rating-close:hover {
  background: v-bind('COMMON_COLORS.GRAY_100');
  color: v-bind('COMMON_COLORS.GRAY_800');
}

.rating-close:focus-visible {
  outline: 2px solid #ffffff;
  box-shadow: 0 0 0 4px v-bind('COMMON_COLORS.PRIMARY');
}

@media (prefers-reduced-motion: reduce) {
  .rating-star,
  .rating-close {
    transition: none;
  }
}
</style>
