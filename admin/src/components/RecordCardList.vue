<!--
  手机端记录卡片列表（tech-视觉基线 §3 / §4.2）。

  手机（<768）把 NDataTable 宽表横滚替换为纵向「标签-值」卡片：
  每条记录一张白卡，字段全部保留，操作列（actionKeys）统一渲染到卡片底部操作区。
  列定义直接复用各视图传给 NDataTable 的 DataTableColumns（单一来源）：
  有 render 的单元格原样复用（StatusPill / 用户链接 / NEllipsis / 复制按钮等），
  无 render 的取 row[column.key] 字符串化，null/undefined/空串显示 muted 的 -。
-->
<template>
  <div class="record-card-list">
    <NSpin :show="loading === true">
      <NEmpty
        v-if="loading !== true && cards.length === 0"
        class="record-card-list__empty"
        :description="t('common.noData')"
      />
      <article v-for="card in cards" :key="card.key" class="record-card">
        <div
          v-for="field in card.fields"
          :key="field.key"
          class="record-card__field"
        >
          <span class="record-card__label">
            <NodeOutlet :node="field.label" />
          </span>
          <div
            class="record-card__value"
            :class="{ 'record-card__value--empty': field.isEmpty }"
          >
            <NodeOutlet :node="field.value" />
          </div>
        </div>
        <div v-if="card.actions.length > 0" class="record-card__actions">
          <NodeOutlet
            v-for="(action, actionIndex) in card.actions"
            :key="actionIndex"
            :node="action"
          />
        </div>
      </article>
    </NSpin>
  </div>
</template>

<script setup lang="ts" generic="T extends object">
import { computed, type FunctionalComponent, type VNodeChild } from "vue";
import { useI18n } from "vue-i18n";
import {
  NEmpty,
  NSpin,
  type DataTableBaseColumn,
  type DataTableColumns,
} from "naive-ui";

const props = defineProps<{
  /** 视图现有 NDataTable 列定义（单一来源，直接复用）。 */
  columns: DataTableColumns<T>;
  /** 当前页记录。 */
  data: T[];
  /** 这些列 key 不进入标签-值列表，其 render 输出渲染到卡片底部操作区。 */
  actionKeys?: string[];
  /** 行 key，缺省用数组下标。 */
  rowKey?: (row: T) => string | number;
  /** 加载态。 */
  loading?: boolean;
}>();

const { t } = useI18n();

/** 透传渲染任意 VNodeChild（列 render / 标题渲染函数的输出）。 */
const NodeOutlet: FunctionalComponent<{ node: VNodeChild }> = (slotProps) =>
  slotProps.node;
NodeOutlet.props = ["node"];

/** 单张卡片的字段行。 */
interface RecordCardField {
  /** 字段唯一标识（列 key 字符串化）。 */
  key: string;
  /** 列标题（纯文本或标题渲染函数输出）。 */
  label: VNodeChild;
  /** 单元格内容：render 输出或兜底取值文本。 */
  value: VNodeChild;
  /** 值是否为兜底空占位（-），用于 muted 着色。 */
  isEmpty: boolean;
}

/** 单条记录的卡片数据。 */
interface RecordCard {
  key: string | number;
  fields: RecordCardField[];
  actions: VNodeChild[];
}

/** 无 render 列的兜底取值。泛型行类型无法在编译期用运行时列 key 索引（与 naive-ui
    内部取单元格值的前提相同），此处把行收口为原始字段映射做唯一一次向下转型，
    是本组件唯一的宽松取值点：admin 行字段均为原始值，不引入 any/unknown。
    注意：兜底不感知 naive 的 column.default（当前无列使用；若未来某列使用，
    卡片会显示 "-" 而表格有值，届时需在此补 default 取值）。 */
function readCellText(row: object, key: string | number): string {
  const record = row as Record<
    string,
    string | number | bigint | boolean | null | undefined
  >;
  const value = record[String(key)];
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

/** 列标题纯文本 / 渲染函数求值。标题渲染函数的入参是默认 InternalRowData 泛型，
    与 T 泛型列不变化兼容，故取 key/title 两个与 T 无关的字段重建入参（无转型）。 */
function columnTitle(column: DataTableBaseColumn<T>): VNodeChild {
  const source: Pick<DataTableBaseColumn, "key" | "title"> = {
    key: column.key,
    title: column.title,
  };
  if (typeof source.title === "function") {
    return source.title(source);
  }
  return source.title ?? "";
}

/** 把一列转成卡片字段行：render 输出优先，否则兜底字符串化。 */
function toField(
  column: DataTableBaseColumn<T>,
  row: T,
  rowIndex: number,
): RecordCardField {
  const rendered = column.render?.(row, rowIndex);
  if (rendered !== null && rendered !== undefined && rendered !== false) {
    return {
      key: String(column.key),
      label: columnTitle(column),
      value: rendered,
      isEmpty: false,
    };
  }
  return {
    key: String(column.key),
    label: columnTitle(column),
    value: readCellText(row, column.key),
    isEmpty: true,
  };
}

const cards = computed<RecordCard[]>(() => {
  const actionKeySet = new Set(props.actionKeys ?? []);
  return props.data.map((row, rowIndex) => {
    const fields: RecordCardField[] = [];
    const actions: VNodeChild[] = [];
    for (const column of props.columns) {
      // 多选 / 展开列无业务字段语义，卡片形态直接跳过
      if (column.type === "selection" || column.type === "expand") {
        continue;
      }
      if ("children" in column) {
        // 列分组（表头分组）在卡片形态无意义，拍平子列
        for (const child of column.children) {
          if (actionKeySet.has(String(child.key))) {
            continue;
          }
          fields.push(toField(child, row, rowIndex));
        }
        continue;
      }
      if (actionKeySet.has(String(column.key))) {
        const rendered = column.render?.(row, rowIndex);
        if (rendered !== null && rendered !== undefined && rendered !== false) {
          actions.push(rendered);
        }
        continue;
      }
      fields.push(toField(column, row, rowIndex));
    }
    return { key: props.rowKey?.(row) ?? rowIndex, fields, actions };
  });
});
</script>

<style scoped>
/* 卡片：白底 + 20px 圆角 + 基线 §1.4 多层软阴影（与 .n-card 同规格），内边距 16px */
.record-card {
  background: var(--admin-card);
  border-radius: 20px;
  padding: 12px 16px;
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.06),
    0 3px 3px rgba(0, 0, 0, 0.06),
    0 6px 6px rgba(0, 0, 0, 0.06),
    0 12px 12px rgba(0, 0, 0, 0.04),
    0 24px 24px rgba(0, 0, 0, 0.04);
}

.record-card-list :deep(.n-spin-content) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

/* 字段行：label（基线表单 label 规格 12px/500）在上、value（13px ink）在下，
   行间 --admin-divider 分隔 */
.record-card__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
}

.record-card__field + .record-card__field {
  border-top: 1px solid var(--admin-divider);
}

.record-card__label {
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: var(--admin-text-secondary);
}

.record-card__value {
  font-size: 13px;
  line-height: 20px;
  color: var(--admin-ink);
  min-width: 0;
  /* URL 等长文本换行显示，不撑破卡片横向 */
  overflow-wrap: anywhere;
}

.record-card__value--empty {
  color: var(--admin-muted);
}

.record-card__value :deep(.n-ellipsis) {
  max-width: 100%;
}

/* 操作区：与卡内容用 divider 分隔，按钮左对齐、间距 8px、可换行 */
.record-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--admin-divider);
}

.record-card-list__empty {
  padding: 32px 0;
}
</style>
