/**
 * 通用 API 响应类型定义
 *
 * 后端统一响应格式：{ code, data, msg }
 */

/** 后端统一响应结构 */
export interface ApiResponse<T> {
  /** 业务状态码，10000 表示成功 */
  code: number;
  /** 业务数据 */
  data: T;
  /** 状态描述 */
  msg: string;
}

/** 分页数据（预留） */
export interface PaginatedData<T> {
  items: T[];
  total: number;
}
