/**
 * 旧下载任务状态清理。
 *
 * 本阶段不读取旧 checkpoint / pending 状态做 UI 决策，页面初始化时直接清理已知旧状态。
 */

/** 旧下载 IndexedDB 数据库名。 */
const LEGACY_DOWNLOAD_IDB_DATABASE_NAME = 'tg_homepage_download_checkpoint_v1'

/** 旧下载 localStorage key。 */
const LEGACY_DOWNLOAD_LOCAL_STORAGE_KEYS = [
  'tg_homepage_download_checkpoint_v1',
  'tg_homepage_pending_download_task_v1',
  'homepage:download:pending',
  'download:pending:task'
] as const

/** 清理旧下载任务状态，一次失败不阻断页面加载。 */
export async function clearLegacyDownloadTaskState(): Promise<void> {
  try {
    for (const key of LEGACY_DOWNLOAD_LOCAL_STORAGE_KEYS) {
      window.localStorage.removeItem(key)
    }
    await deleteLegacyIndexedDb()
    await clearLegacyOpfsFiles()
  } catch (error) {
    console.error(error)
  }
}

function deleteLegacyIndexedDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve()
  }

  return new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase(LEGACY_DOWNLOAD_IDB_DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => {
      console.error(request.error || new Error('[download-legacy-state-cleanup] deleteLegacyIndexedDb: delete failed.'))
      resolve()
    }
    request.onblocked = () => {
      console.error(new Error('[download-legacy-state-cleanup] deleteLegacyIndexedDb: delete blocked.'))
      resolve()
    }
  })
}

async function clearLegacyOpfsFiles(): Promise<void> {
  if (typeof navigator === 'undefined' || typeof navigator.storage === 'undefined') {
    return
  }

  const storage = navigator.storage as StorageManager & {
    /** OPFS 根目录读取函数。 */
    getDirectory?: () => Promise<FileSystemDirectoryHandle>
  }
  if (typeof storage.getDirectory !== 'function') {
    return
  }

  const root = await storage.getDirectory()
  await removeLegacyOpfsEntry(root, 'download_tmp')
  await removeLegacyOpfsEntry(root, 'download_status_json')
}

async function removeLegacyOpfsEntry(
  root: FileSystemDirectoryHandle,
  name: string
): Promise<void> {
  try {
    await root.removeEntry(name)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return
    }
    console.error(error)
  }
}
