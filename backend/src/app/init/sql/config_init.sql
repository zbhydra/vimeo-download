-- 全新环境首次部署的配置初始化数据；已有环境配置不覆盖（INSERT IGNORE 幂等）。
-- 表结构由 sync_database_schema 先行创建，本文件只补数据，不含任何建表语句。
-- 支付渠道的商户凭据与密钥必须由部署方按本产品自己的支付账号在部署时单独配置，
-- 禁止写入仓库（本文件与渠道凭据表无关）。
-- 手写维护：新增或调整公共配置时同步改这里，保证全新环境一次导入即可用。

-- ===== config_public =====

-- 公共策略与开关：下载额度、首日免费、设备校验、注册与签到活动、支持邮箱
INSERT IGNORE INTO config_public (c_key, g_value) VALUES
('dl_active_download_limit', '3'),
('dl_anonymous_immediate_count', '2'),
('dl_anonymous_total_count', '3'),
('dl_anonymous_max_size_bytes', '314572800'),
('dl_anonymous_wait_seconds', '300'),
('dl_anonymous_dedup_seconds', '10800'),
('extension_first_day_free_enabled', 'true'),
('device_trust', '{"verify_device_id":true}'),
('registration_ip_benefit_guard', '{"window_seconds":86400,"max_registrations":4}'),
('subscription_review_reward', 'true'),
('website_checkin_campaign', '{"reward_rules": [{"credits": 6, "end_day": 7, "start_day": 1}, {"credits": 3, "end_day": 14, "start_day": 8}], "campaign_days": 14}'),
-- 支付等待页展示的支持邮箱；占位值，上线前替换为本产品真实邮箱。
('support_mail', 'support@vimeo-video-downloader.example');

-- ===== config_subscription_product =====

INSERT IGNORE INTO config_subscription_product (
    product_id, name, period, duration_days, auto_renew,
    display_currency, display_amount, enabled, sort_order, metadata,
    created_at, updated_at
) VALUES
('free', 'Free', 'none', 0, 0, 'USD', 0, 1, 10,
 '{"one_time": false, "daily_limit": 5, "web_daily_play_limit": 0, "web_daily_download_limit": 0, "extension_daily_download_limit": 9999, "proxy_user_rate_limit_mb_per_second": 0}',
 1781485045667, 1782803363272),
('unlimited', 'Unlimited', 'month', 0, 0, 'USD', 9900000, 1, 20,
 '{"one_time": false, "daily_limit": -1, "web_daily_play_limit": 0, "web_daily_download_limit": 0, "extension_daily_download_limit": -1, "proxy_user_rate_limit_mb_per_second": 0}',
 1782783136922, 1789096698979),
('unlimited_quarter', 'Unlimited', 'quarter', 0, 0, 'USD', 18900000, 1, 25,
 '{"one_time": false, "daily_limit": -1, "web_daily_play_limit": 0, "web_daily_download_limit": 0, "extension_daily_download_limit": -1, "proxy_user_rate_limit_mb_per_second": 0}',
 1789096726872, 1789096726872),
('unlimited_year', 'Unlimited', 'year', 0, 0, 'USD', 99990000, 1, 30,
 '{"one_time": false, "daily_limit": -1, "web_daily_play_limit": 0, "web_daily_download_limit": 0, "extension_daily_download_limit": -1, "proxy_user_rate_limit_mb_per_second": 0}',
 1789020615142, 1789020615142),
('unlimited_lifetime', 'Unlimited', 'lifetime', 0, 0, 'USD', 99900000, 1, 40,
 '{"one_time": false, "daily_limit": -1, "web_daily_play_limit": 0, "web_daily_download_limit": 0, "extension_daily_download_limit": -1, "proxy_user_rate_limit_mb_per_second": 0}',
 1789096726872, 1789096726872);

-- ===== config_subscription_product_price =====
-- provider_sku 只在渠道自动续费下单时使用（PayPal 计划 ID / Clink `<productId>:<priceId>`）。
-- 本表不预置任何渠道侧标识：开启自动续费前必须填入本产品自己申请的渠道商品标识。

INSERT IGNORE INTO config_subscription_product_price (
    product_id, channel_code, auto_renew_supported, currency, amount,
    provider_sku, enabled, created_at, updated_at
) VALUES
('unlimited', 'paypal', 0, 'USD', 9900000, NULL, 1, 1782783137038, 1789096699172),
('unlimited', 'clink', 0, 'USD', 9900000, NULL, 1, 1788236052431, 1789096699172),
('unlimited_quarter', 'paypal', 0, 'USD', 18900000, NULL, 1, 1789096737988, 1789096737988),
('unlimited_quarter', 'clink', 0, 'USD', 18900000, NULL, 1, 1789096737988, 1789096737988),
('unlimited_lifetime', 'paypal', 0, 'USD', 99900000, NULL, 1, 1789096737988, 1789096737988),
('unlimited_lifetime', 'clink', 0, 'USD', 99900000, NULL, 1, 1789096737988, 1789096737988),
('unlimited_year', 'paypal', 0, 'USD', 99990000, NULL, 0, 1789020615152, 1789096738182),
('unlimited_year', 'clink', 0, 'USD', 99990000, NULL, 0, 1789020615152, 1789096738182);

-- ===== config_credit_product =====

INSERT IGNORE INTO config_credit_product (
    product_id, name, credits_amount, display_currency, display_amount,
    enabled, sort_order, metadata, created_at, updated_at
) VALUES
('credit_mini', '10 Credits', 10, 'USD', 990000, 0, 100, '{}', 1781860480112, 1782803413859),
('credit_small', '75 Credits', 75, 'USD', 5990000, 1, 10, '{}', 1781860480112, 1782803413859),
('credit_medium', '300 Credits', 300, 'USD', 12990000, 1, 20, '{}', 1781860480112, 1782803413859),
('credit_large', '1500 Credits', 1500, 'USD', 49990000, 1, 30, '{}', 1781860480112, 1782803413859);

-- ===== config_credit_product_price =====

INSERT IGNORE INTO config_credit_product_price (
    product_id, channel_code, currency, amount, provider_sku,
    enabled, created_at, updated_at
) VALUES
('credit_mini', 'paypal', 'USD', 990000, 'credit-50-paypal', 0, 1782354098732, 1782803429295),
('credit_small', 'paypal', 'USD', 5990000, 'credit-50-paypal', 1, 1782354098732, 1782803429295),
('credit_medium', 'paypal', 'USD', 12990000, 'credit-200-paypal', 1, 1782354098732, 1782803429298),
('credit_large', 'paypal', 'USD', 49990000, 'credit-1000-paypal', 1, 1782354098732, 1782803429295),
('credit_mini', 'clink', 'USD', 990000, NULL, 0, 1788236052429, 1788236052429),
('credit_small', 'clink', 'USD', 5990000, NULL, 1, 1788236052429, 1788236052429),
('credit_medium', 'clink', 'USD', 12990000, NULL, 1, 1788236052429, 1788236052429),
('credit_large', 'clink', 'USD', 49990000, NULL, 1, 1788236052429, 1788236052429);
