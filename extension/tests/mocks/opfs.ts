/**
 * 最小 OPFS mock（happy-dom 未实现 navigator.storage.getDirectory）。
 *
 * 覆盖 mux 产物链实际用到的面：目录/文件句柄、createWritable 的 write({type,data,position})
 * 定位写语义（与 FileSystemWritableFileStream 对齐，可被 Mediabunny StreamTarget 直接消费）、
 * getFile、removeEntry（含目录递归删除）。定位写按调用顺序应用到线性缓冲，getFile 据此
 * 物化 File，供与旧 BufferTarget 路径做字节级对比。
 */

/** 与 Mediabunny StreamTargetChunk 对齐的写入块。 */
interface MockOpfsWriteChunk {
  type: 'write'
  data: Uint8Array
  position: number
}

/** mock 文件内容：按写入顺序应用的定位写序列。 */
class MockOpfsFileContent {
  private readonly writes: MockOpfsWriteChunk[] = []

  /** 应用一次定位写。 */
  write(chunk: MockOpfsWriteChunk): void {
    this.writes.push({ type: 'write', data: chunk.data.slice(), position: chunk.position })
  }

  /** createWritable({ keepExistingData: false }) 语义：清空内容。 */
  reset(): void {
    this.writes.length = 0
  }

  /** 按当前内容物化字节。 */
  toBytes(): Uint8Array {
    const size = this.writes.reduce(
      (max, chunk) => Math.max(max, chunk.position + chunk.data.byteLength),
      0
    )
    const bytes = new Uint8Array(size)
    for (const chunk of this.writes) {
      bytes.set(chunk.data, chunk.position)
    }
    return bytes
  }
}

/** mock 文件句柄；createWritable 返回真 WritableStream，StreamTarget 的 instanceof 校验可通过。 */
class MockOpfsFileHandle {
  readonly kind = 'file' as const
  private readonly content = new MockOpfsFileContent()

  constructor(readonly name: string) {}

  async createWritable(): Promise<WritableStream<MockOpfsWriteChunk>> {
    this.content.reset()
    return new WritableStream<MockOpfsWriteChunk>({
      write: chunk => {
        this.content.write(chunk)
      }
    })
  }

  async getFile(): Promise<File> {
    return new File([this.content.toBytes()], this.name)
  }
}

/** mock 目录句柄；支持测试断言的条目查询。 */
export class MockOpfsDirectoryHandle {
  readonly kind = 'directory' as const
  private readonly files = new Map<string, MockOpfsFileHandle>()
  private readonly directories = new Map<string, MockOpfsDirectoryHandle>()

  constructor(readonly name: string) {}

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<MockOpfsDirectoryHandle> {
    const existing = this.directories.get(name)
    if (existing) {
      return existing
    }
    if (!options?.create) {
      throw notFound(name)
    }
    const created = new MockOpfsDirectoryHandle(name)
    this.directories.set(name, created)
    return created
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockOpfsFileHandle> {
    const existing = this.files.get(name)
    if (existing) {
      return existing
    }
    if (!options?.create) {
      throw notFound(name)
    }
    const created = new MockOpfsFileHandle(name)
    this.files.set(name, created)
    return created
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.files.delete(name)) {
      return
    }
    if (this.directories.has(name)) {
      if (!options?.recursive) {
        throw new DOMException(`目录非空: ${name}`, 'InvalidModificationError')
      }
      this.directories.delete(name)
      return
    }
    throw notFound(name)
  }

  /** 测试断言用：直接子条目是否存在。 */
  hasEntry(name: string): boolean {
    return this.files.has(name) || this.directories.has(name)
  }
}

/** 安装 OPFS mock 到 navigator.storage；返回根目录句柄供断言。 */
export function installOpfsMock(): MockOpfsDirectoryHandle {
  const root = new MockOpfsDirectoryHandle('')
  Object.defineProperty(navigator, 'storage', {
    value: { getDirectory: (): Promise<MockOpfsDirectoryHandle> => Promise.resolve(root) },
    configurable: true
  })
  return root
}

/** 还原 navigator.storage。 */
export function restoreOpfsMock(): void {
  Reflect.deleteProperty(navigator, 'storage')
}

function notFound(name: string): DOMException {
  return new DOMException(`条目不存在: ${name}`, 'NotFoundError')
}
