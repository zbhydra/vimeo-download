"""后端 cron 定时任务框架包。

对外使用 `app.crons.crons` 中的全局调度器；具体任务放在 `task/` 后由
registry 显式注册。
"""
