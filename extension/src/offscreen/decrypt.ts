/**
 * HLS AES-128 分片解密工具（WebCrypto AES-CBC）。
 *
 * 只覆盖 RFC 8216 `#EXT-X-KEY` 的 METHOD=AES-128 / KEYFORMAT=identity 交付：加密参数
 * （key URL + 物化后的 16 字节 IV）由 media playlist 解析层产出，key 的白名单校验、
 * fetch 与缓存归 OffscreenTaskRunner，本模块只做纯解密。offscreen document 持有完整
 * WebCrypto，无需外部依赖。
 */

import { logger } from '@/core/utils/logger'

/** AES-128 key 定长 16 字节（RFC 8216 §5.2）。 */
export const AES_128_KEY_LENGTH = 16

/**
 * AES-128-CBC 解密单个 media segment。
 *
 * key/IV 与分片内容不匹配或分片损坏时 WebCrypto 只抛出无信息量的 OperationError，
 * 先按规范落日志保留原始错误，再换成可定位的业务错误抛给任务失败链。
 *
 * @param key 16 字节原始 AES key（fetchHlsAesKey 的缓存产物）
 * @param iv 16 字节 IV（解析层物化：显式 IV 或 media sequence 构造）
 * @param data 加密分片字节（含 PKCS#7 填充，WebCrypto 解密后自动去除）
 */
export async function decryptAes128Segment(
  key: ArrayBuffer,
  iv: Uint8Array,
  data: ArrayBuffer
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, [
    'decrypt'
  ])
  try {
    return await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data)
  } catch (error) {
    logger.error('[HlsDecrypt] AES-CBC 分片解密失败（key/IV 与分片不匹配或分片损坏）', error)
    throw new Error('[HlsDecrypt] AES-CBC 分片解密失败: stage=segment-decrypt')
  }
}
