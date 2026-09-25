/**
 * 管理后台时间展示工具。
 *
 * 后台所有展示时间固定按 UTC+8 输出 YYYY-MM-DD HH:mm:ss，避免浏览器 locale
 * 或操作系统时区不同导致同一时间在管理页显示不一致。
 */

const ADMIN_UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const ADMIN_DATE_LABEL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ADMIN_WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

/** Naive UI DatePicker 展示格式。 */
export const ADMIN_DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss";

/** 数字补零到两位。 */
function padDateUnit(value: number): string {
  return String(value).padStart(2, "0");
}

/** 格式化后端按 UTC+8 聚合好的日期标签，补充周几便于人工对账。 */
export function formatAdminDateWithWeekday(value: string): string {
  const matched = ADMIN_DATE_LABEL_PATTERN.exec(value);
  if (!matched) return value;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }

  return `${value}(${ADMIN_WEEKDAY_LABELS[date.getUTCDay()]})`;
}

/** 格式化毫秒时间戳为 UTC+8 管理后台时间。 */
export function formatAdminTimeMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return "-";
  }

  const date = new Date(value + ADMIN_UTC8_OFFSET_MS);
  return [
    `${date.getUTCFullYear()}-${padDateUnit(date.getUTCMonth() + 1)}-${padDateUnit(date.getUTCDate())}`,
    `${padDateUnit(date.getUTCHours())}:${padDateUnit(date.getUTCMinutes())}:${padDateUnit(date.getUTCSeconds())}`,
  ].join(" ");
}

/** 格式化 Unix 秒时间戳为 UTC+8 管理后台时间。 */
export function formatAdminTimeSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return "-";
  }
  return formatAdminTimeMs(value * 1000);
}
