/** OPFS 同步句柄只在 Dedicated Worker 内持有；各文件共用同一运行时。 */

interface SyncAccessHandle {
  write(data: Uint8Array, options: { at: number }): number
  truncate(size: number): void
  flush(): void
  close(): void
}

export type OpfsWriterRequest = { id: number; fileId: number } & (
  | { operation: 'open'; handle: FileSystemFileHandle }
  | { operation: 'write'; data: Uint8Array; position: number }
  | { operation: 'truncate'; size: number }
  | { operation: 'flush' | 'close' }
)

export type OpfsWriterResponse =
  | { id: number; ok: true }
  | { id: number; ok: false; name: string; message: string }

const handles = new Map<number, SyncAccessHandle>()

self.onmessage = async (event: MessageEvent<OpfsWriterRequest>): Promise<void> => {
  const request = event.data
  try {
    if (request.operation === 'open') {
      const file = request.handle as FileSystemFileHandle & {
        createSyncAccessHandle(): Promise<SyncAccessHandle>
      }
      handles.set(request.fileId, await file.createSyncAccessHandle())
    } else {
      const handle = handles.get(request.fileId)!
      switch (request.operation) {
        case 'write': {
          let written = 0
          while (written < request.data.byteLength) {
            const count = handle.write(request.data.subarray(written), { at: request.position + written })
            if (count === 0) throw new Error(`opfs-writer: 写入未推进，fileId=${request.fileId}, position=${request.position + written}`)
            written += count
          }
          break
        }
        case 'truncate':
          handle.truncate(request.size)
          break
        case 'flush':
          handle.flush()
          break
        case 'close':
          handles.delete(request.fileId)
          try {
            handle.flush()
          } finally {
            handle.close()
          }
      }
    }
    self.postMessage({ id: request.id, ok: true } satisfies OpfsWriterResponse)
  } catch (error) {
    console.error(error)
    const cause = error instanceof Error ? error : new Error(String(error))
    self.postMessage({ id: request.id, ok: false, name: cause.name, message: cause.message } satisfies OpfsWriterResponse)
  }
}
