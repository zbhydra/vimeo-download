"""媒体下载全局阈值常量。"""

# 业务允许的最大下载资源大小：4 GiB。
MEDIA_DOWNLOAD_MAX_SIZE_BYTES = 4 * 1024 * 1024 * 1024
# TTL 分档阈值：小于等于 100 MiB 的资源给 1 小时 token。
MEDIA_DOWNLOAD_100_MIB = 100 * 1024 * 1024
# TTL 分档阈值：100 MiB 到 500 MiB 的资源给 3 小时 token。
MEDIA_DOWNLOAD_500_MIB = 500 * 1024 * 1024
# 小文件 token 有效期，秒。
MEDIA_DOWNLOAD_TTL_1_HOUR = 60 * 60
# 中等文件 token 有效期，秒。
MEDIA_DOWNLOAD_TTL_3_HOURS = 3 * 60 * 60
# 大文件或未知大小 token 有效期，秒。
MEDIA_DOWNLOAD_TTL_6_HOURS = 6 * 60 * 60
