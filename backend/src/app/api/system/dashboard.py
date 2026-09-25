"""系统 dashboard HTML API。"""

from html import escape

from fastapi import APIRouter, Query, status
from fastapi.responses import HTMLResponse

from app.services.dashboard_service import (
    DEFAULT_DASHBOARD_DAYS,
    DashboardData,
    dashboard_service,
)
from app.utils.common import md5_hash

router = APIRouter(prefix="/dashboard", tags=["system-dashboard"])

DASHBOARD_PASSWORD_HASH = md5_hash("Hydra123$")


def _render_dashboard_html(data: DashboardData) -> str:
    """渲染 dashboard HTML。"""
    header_cells = "".join(
        f"<th>{escape(mark_type)}</th>" for mark_type in data.mark_types
    )
    body_rows = []
    for row in data.rows:
        cells = "".join(
            (
                "<td>"
                f"{row.metrics[mark_type].event_count}/{row.metrics[mark_type].device_count}"
                "</td>"
            )
            for mark_type in data.mark_types
        )
        body_rows.append(
            "<tr>"
            f"<td>{escape(row.date_label)}</td>"
            f"<td>{row.registered_count}</td>"
            f"{cells}"
            "</tr>"
        )

    table_rows = "".join(body_rows)

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Dashboard</title>
  <style>
    body {{
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f7fb;
      color: #1f2937;
    }}
    .container {{
      max-width: 1600px;
      margin: 0 auto;
    }}
    .card {{
      background: #ffffff;
      border-radius: 16px;
      padding: 20px 24px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      margin-bottom: 20px;
    }}
    .summary-title {{
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }}
    .summary-meta {{
      margin-top: 8px;
      color: #64748b;
      font-size: 14px;
    }}
    .table-wrap {{
      overflow-x: auto;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      min-width: 1200px;
    }}
    th, td {{
      border: 1px solid #e2e8f0;
      padding: 10px 12px;
      text-align: center;
      white-space: nowrap;
      font-size: 14px;
    }}
    th {{
      background: #eef2ff;
      position: sticky;
      top: 0;
      z-index: 1;
    }}
    td:first-child, th:first-child {{
      position: sticky;
      left: 0;
      z-index: 2;
      background: #ffffff;
      text-align: left;
    }}
    th:first-child {{
      background: #e0e7ff;
    }}
  </style>
</head>
<body>
  <div class="container">
    <section class="card">
      <h1 class="summary-title">当前用户数量 {data.summary.total_users}（新增 {data.summary.new_users}）</h1>
      <div class="summary-meta">24H 活跃 {data.summary.active_users_24h}；7D 活跃 {data.summary.active_users_7d}；今日新增按 UTC+8 自然日；活跃人数按用户 updated_at 滚动窗口；表格默认最近 {DEFAULT_DASHBOARD_DAYS} 天，日期倒序。</div>
    </section>

    <section class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期（Y-m-d）</th>
              <th>注册人数</th>
              {header_cells}
            </tr>
          </thead>
          <tbody>
            {table_rows}
          </tbody>
        </table>
      </div>
    </section>
  </div>
</body>
</html>
"""


@router.get("", response_class=HTMLResponse)
async def dashboard(
    password: str | None = Query(default=None, description="Dashboard password hash"),
):
    """返回系统 dashboard HTML 页面。"""
    if password != DASHBOARD_PASSWORD_HASH:
        return HTMLResponse(
            content="<h1>403 Forbidden</h1>",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    dashboard_data = await dashboard_service.get_dashboard_data(
        days=DEFAULT_DASHBOARD_DAYS
    )
    return HTMLResponse(content=_render_dashboard_html(dashboard_data))
