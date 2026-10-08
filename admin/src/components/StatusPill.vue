<!--
  状态 pill（tech-视觉基线 §3）。

  自绘 span，浅底深字，替代各视图 NTag 状态用法；只承载状态文案，无交互。
  色值消费 styles/tokens.css 的 --admin-* 语义变量（底 = *-bg，字 = 语义色），
  与 theme.ts 的 common.*Color 同源（基线 §1.1）。
-->
<template>
  <span class="status-pill" :class="`status-pill--${tone}`">
    <slot />
  </span>
</template>

<script lang="ts">
/** 语义色调，对应基线 §1.1 五组语义色（success/info/warning/danger/neutral）。 */
export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral";
</script>

<script setup lang="ts">
defineProps<{
  /** 语义色调，决定底色与字色。 */
  tone: StatusTone;
}>();
</script>

<style scoped>
/* 规格固定（基线 §1.2/§1.3）：高 18px、padding 2px 8px、圆角 100px、11px/400。
   white-space: nowrap——状态列窄表内 pill 不换行，只随表格横滚 */
.status-pill {
  display: inline-block;
  box-sizing: border-box;
  height: 18px;
  padding: 2px 8px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 400;
  line-height: 14px;
  white-space: nowrap;
  vertical-align: middle;
}

.status-pill--success {
  background: var(--admin-success-bg);
  color: var(--admin-success);
}

.status-pill--info {
  background: var(--admin-info-bg);
  color: var(--admin-info);
}

.status-pill--warning {
  background: var(--admin-warning-bg);
  color: var(--admin-warning);
}

.status-pill--danger {
  background: var(--admin-danger-bg);
  color: var(--admin-danger);
}

.status-pill--neutral {
  background: var(--admin-neutral-bg);
  color: var(--admin-neutral);
}
</style>
