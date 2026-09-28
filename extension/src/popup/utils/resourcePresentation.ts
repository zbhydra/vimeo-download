/** Popup 资源类型的统一文案、图标与颜色映射。 */

import { IconName } from '@/core/components/icons'
import { I18N_KEYS } from '@/core/constants/i18n'
import { DESIGN_TOKENS } from '@/core/constants/design'
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

/**
 * 所有可下载资源类型的唯一 Popup 展示映射。
 *
 * 颜色统一走 design token（docs/references/specs/design.md Geist 色阶）；design.md 未定义
 * 资源类型语义色，映射取舍见 DESIGN_TOKENS 内各组注释。
 */
const RESOURCE_TYPE_PRESENTATIONS: Record<ResourceType, ResourceTypePresentation> = {
  [RESOURCE_TYPES.IMAGE]: {
    labelKey: I18N_KEYS.RESOURCE_ITEM.TYPE_IMAGE,
    icon: IconName.PHOTO,
    color: DESIGN_TOKENS.PURPLE_700
  },
  [RESOURCE_TYPES.VIDEO]: {
    labelKey: I18N_KEYS.RESOURCE_ITEM.TYPE_VIDEO,
    icon: IconName.FILM,
    color: DESIGN_TOKENS.BLUE_800
  },
  [RESOURCE_TYPES.AUDIO]: {
    labelKey: I18N_KEYS.RESOURCE_ITEM.TYPE_AUDIO,
    icon: IconName.MUSICAL_NOTE,
    color: DESIGN_TOKENS.GREEN_900
  },
  [RESOURCE_TYPES.SUBTITLE]: {
    labelKey: I18N_KEYS.RESOURCE_ITEM.TYPE_SUBTITLE,
    icon: IconName.DOCUMENT,
    color: DESIGN_TOKENS.AMBER_900
  }
}

/** 返回指定资源类型的 Popup 展示属性。 */
export function getResourceTypePresentation(type: ResourceType): ResourceTypePresentation {
  return RESOURCE_TYPE_PRESENTATIONS[type]
}
