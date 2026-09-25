/** HTTP Response 流式读取器的字节与进度契约测试。 */

import { describe, expect, it, vi } from 'vitest'

import { DOWNLOAD_PROGRESS_EVENT, type DownloadProgressDetail } from '@/core/protocol/injected'
import {
  readResponseArrayBufferByChunk,
  readResponseBlobWithProgress
} from '@/core/injected/responseBody'

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
      })
    )
    const received: number[] = []

    const buffer = await readResponseArrayBufferByChunk(response, byteLength => {
      received.push(byteLength)
    })

    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3, 4, 5])
    expect(received).toEqual([3, 2])
  })

  it('已知 Content-Length 时按真实字节上报 0 到 99', async () => {
    const sourceId = 'controlled-source'
    const details: DownloadProgressDetail[] = []
    const listener = vi.fn((event: Event) => {
      details.push((event as CustomEvent<DownloadProgressDetail>).detail)
    })
    document.addEventListener(DOWNLOAD_PROGRESS_EVENT, listener)
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.from([1, 2]))
          controller.enqueue(Uint8Array.from([3, 4]))
          controller.close()
        }
      }),
      {
        headers: {
          'Content-Length': '4',
          'Content-Type': 'video/mp4'
        }
      }
    )

    try {
      const blob = await readResponseBlobWithProgress(response, {
        taskId: 'response-task-1',
        sourceId,
        contentType: 'video/mp4'
      })

      expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([1, 2, 3, 4])
      expect(details).toEqual([
        {
          taskId: 'response-task-1',
          sourceId,
          progress: 0,
          receivedBytes: null,
          totalBytes: null,
          bytesAreEstimated: false
        },
        {
          taskId: 'response-task-1',
          sourceId,
          progress: 50,
          receivedBytes: null,
          totalBytes: null,
          bytesAreEstimated: false
        },
        {
          taskId: 'response-task-1',
          sourceId,
          progress: 99,
          receivedBytes: null,
          totalBytes: null,
          bytesAreEstimated: false
        }
      ])
    } finally {
      document.removeEventListener(DOWNLOAD_PROGRESS_EVENT, listener)
    }
  })
})
