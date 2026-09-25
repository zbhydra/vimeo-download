/** Popup 资源类型的统一文案、图标与颜色映射。 */

import { IconName } from '@/core/components/icons'
import { I18N_KEYS } from '@/core/constants/i18n'
import { COMMON_COLORS } from '@/core/constants/style'
import { RESOURCE_TYPES, type ResourceType } from '@/core/types'

/** 单个资源类型在 Popup 中的展示属性。 */
export interface ResourceTypePresentation {
  /** vue-i18n 类型名称键。 */
  labelKey: string
  /** 与现有 Heroicons 风格一致的媒体图标。 */
  icon: IconName
  /** 图标和类型徽章的前景色。 */
  color: string
}

/** 所有可下载资源类型的唯一 Popup 展示映射。 */
const RESOURCE_TYPE_PRESENTATIONS: Record<ResourceType, ResourceTypePresentation> = {
  [RESOURCE_TYPES.IMAGE]: {
    labelKey: I18N_KEYS.RESOURCE_ITEM.TYPE_IMAGE,
    icon: IconName.PHOTO,
    color: COMMON_COLORS.IMAGE_TEXT
  },
  [RESOURCE_TYPES.VIDEO]: {
    labelKey: I18N_KEYS.RESOURCE_ITEM.TYPE_VIDEO,
    icon: IconName.FILM,
    color: COMMON_COLORS.VIDEO_TEXT
  },
  [RESOURCE_TYPES.AUDIO]: {
    labelKey: I18N_KEYS.RESOURCE_ITEM.TYPE_AUDIO,
    icon: IconName.MUSICAL_NOTE,
    color: COMMON_COLORS.AUDIO_TEXT
  },
  [RESOURCE_TYPES.SUBTITLE]: {
    labelKey: I18N_KEYS.RESOURCE_ITEM.TYPE_SUBTITLE,
    icon: IconName.DOCUMENT,
    color: COMMON_COLORS.SUBTITLE_TEXT
  }
}

/** 返回指定资源类型的 Popup 展示属性。 */
export function getResourceTypePresentation(type: ResourceType): ResourceTypePresentation {
  return RESOURCE_TYPE_PRESENTATIONS[type]
}
