/** 网站 OPFS 写入入口：主线程管理文件，Worker 持有写锁，调用方提供明确偏移。 */

import type { OpfsWriterRequest, OpfsWriterResponse } from './opfs-writer.worker'

export interface OpfsWriter {
  write(data: Uint8Array, position: number): Promise<void>
  truncate(size: number): Promise<void>
  flush(): Promise<void>
  close(): Promise<void>
}

let runtime: Worker | undefined
let nextId = 0
const pending = new Map<number, { resolve(): void; reject(error: Error): void }>()

function getRuntime(): Worker {
  if (runtime) return runtime
  const worker = new Worker(new URL('./opfs-writer.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<OpfsWriterResponse>): void => {
    const response = event.data
    const task = pending.get(response.id)!
    pending.delete(response.id)
    if (response.ok === true) task.resolve()
    else {
      const error = new Error(response.message)
      error.name = response.name
      task.reject(error)
    }
  }
  worker.onerror = (event): void => {
    const error = new Error(`opfs-writer: Worker 执行失败，${event.message}`)
    for (const task of pending.values()) task.reject(error)
    pending.clear()
    worker.terminate()
    runtime = undefined
  }
  runtime = worker
  return worker
}

function request(message: OpfsWriterRequest, transfer: Transferable[] = []): Promise<void> {
  const worker = getRuntime()
  return new Promise((resolve, reject) => {
    pending.set(message.id, { resolve, reject })
    try {
      worker.postMessage(message, transfer)
    } catch (error) {
      pending.delete(message.id)
      reject(error)
    }
  })
}

/** 打开一个文件的独占写句柄；close 可重复调用，关闭失败仍释放写锁。 */
export async function createOpfsWriter(handle: FileSystemFileHandle): Promise<OpfsWriter> {
  const fileId = ++nextId
  await request({ id: fileId, fileId, operation: 'open', handle })
  let closed = false
  return {
    write(data, position) {
      const copy = new Uint8Array(data.byteLength)
      copy.set(data)
      return request({ id: ++nextId, fileId, operation: 'write', data: copy, position }, [copy.buffer])
    },
    truncate: size => request({ id: ++nextId, fileId, operation: 'truncate', size }),
    flush: () => request({ id: ++nextId, fileId, operation: 'flush' }),
    async close() {
      if (closed) return
      closed = true
      await request({ id: ++nextId, fileId, operation: 'close' })
    }
  }
}
