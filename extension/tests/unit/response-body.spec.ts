/** HTTP Response 流式读取器的逐块字节回调契约测试。 */

import { describe, expect, it } from 'vitest'

import { readResponseArrayBufferByChunk } from '@/core/injected/responseBody'

describe('response body reader', () => {
  it('逐块读取 ArrayBuffer 并按实际块大小回调', async () => {
    const chunks = [Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5])]
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk)
          }
          controller.close()
        }
      }),
      { headers: { 'Content-Type': 'video/mp4' } }
    )

    const observed: number[] = []
    const buffer = await readResponseArrayBufferByChunk(response, byteLength => {
      observed.push(byteLength)
    })

    expect(observed).toEqual([3, 2])
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3, 4, 5])
  })

  it('响应没有流式 body 时按整体字节数回调一次', async () => {
    const response = new Response(Uint8Array.from([7, 8, 9]), {
      headers: { 'Content-Type': 'video/mp4' }
    })

    const observed: number[] = []
    const buffer = await readResponseArrayBufferByChunk(response, byteLength => {
      observed.push(byteLength)
    })

    expect(observed).toEqual([3])
    expect(Array.from(new Uint8Array(buffer))).toEqual([7, 8, 9])
  })
})
