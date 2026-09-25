/** 统一 HTTP 客户端的请求、响应、重试与异常合同测试。 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HttpClient } from '../../src/core/api/client/HttpClient'
import { ApiError } from '../../src/core/api/client/types'

vi.mock('../../src/core/api/config', () => ({
  API_CONFIG: {
    TIMEOUT: 25,
    RETRY_COUNT: 2,
    RETRY_DELAY: 0
  }
}))

describe('HttpClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('builds query parameters and runs request and response interceptors in order', async () => {
    const client = new HttpClient('https://api.example.test')
    const order: string[] = []

    client.useRequest(context => {
      order.push('request-one')
      context.options.headers = { ...context.options.headers, 'X-First': '1' }
      return context
    })
    client.useRequest(async context => {
      order.push('request-two')
      context.options.headers = { ...context.options.headers, 'X-Second': '2' }
      return context
    })
    client.useResponse((response, context) => {
      order.push('response')
      expect(context.method).toBe('GET')
      response.data = { result: 'intercepted' }
      return response
    })
    fetchMock.mockResolvedValue(jsonResponse({ result: 'server' }))

    await expect(
      client.get<{ result: string }>('/items', {
        params: { query: 'a b', page: 2 },
        headers: { Existing: 'yes' }
      })
    ).resolves.toEqual({ result: 'intercepted' })

    expect(order).toEqual(['request-one', 'request-two', 'response'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/items?query=a+b&page=2',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Existing: 'yes',
          'X-First': '1',
          'X-Second': '2'
        }
      })
    )
  })

  it.each([
    ['POST', 'post'],
    ['PUT', 'put'],
    ['PATCH', 'patch']
  ] as const)('serializes the body for %s', async (method, helper) => {
    const client = new HttpClient('https://api.example.test')
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

    const result = await client[helper]<{ ok: boolean }>('/items', { value: method }, {
      headers: { 'X-Test': method }
    })

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/items',
      expect.objectContaining({
        method,
        body: JSON.stringify({ value: method }),
        headers: { 'X-Test': method }
      })
    )
  })

  it('uses the DELETE helper without adding a body', async () => {
    const client = new HttpClient('https://api.example.test')
    fetchMock.mockResolvedValue(jsonResponse({ deleted: true }))

    await expect(client.delete('/items/1')).resolves.toEqual({ deleted: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/items/1',
      expect.objectContaining({ method: 'DELETE' })
    )
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('body')
  })

  it('returns text directly and maps invalid non-text bodies to null', async () => {
    const client = new HttpClient('https://api.example.test')
    fetchMock
      .mockResolvedValueOnce(
        new Response('plain response', {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
      )
      .mockResolvedValueOnce(
        new Response('not-json', {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' }
        })
      )

    await expect(client.get('/plain')).resolves.toBe('plain response')
    await expect(client.get('/invalid')).resolves.toBeNull()
  })

  it.each([
    [{ code: 50001, msg: 'backend msg' }, 'backend msg', 50001],
    [{ message: 'backend message' }, 'backend message', undefined],
    [{}, 'HTTP 400', undefined]
  ])('maps an HTTP error envelope to ApiError', async (body, message, backendCode) => {
    const client = new HttpClient('https://api.example.test')
    const intercepted = vi.fn()
    client.useError(intercepted)
    fetchMock.mockResolvedValue(jsonResponse(body, 400))

    const request = client.get('/failure', { skipRetry: true })

    await expect(request).rejects.toMatchObject({
      name: 'ApiError',
      message,
      status: 400,
      backendCode
    })
    expect(intercepted).toHaveBeenCalledOnce()
  })

  it('uses a stable fallback when an HTTP error body is not JSON', async () => {
    const client = new HttpClient('https://api.example.test')
    fetchMock.mockResolvedValue(
      new Response('broken', {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      })
    )

    await expect(client.get('/failure', { skipRetry: true })).rejects.toMatchObject({
      message: 'Unknown error',
      status: 502
    })
  })

  it('retries only while an error interceptor requests another attempt', async () => {
    const client = new HttpClient('https://api.example.test')
    let retries = 0
    client.useError((_error, context) => {
      if (retries < 2) {
        retries += 1
        context._shouldRetry = true
      }
    })
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ msg: 'temporary' }, 503))
      .mockResolvedValueOnce(jsonResponse({ msg: 'temporary' }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    await expect(client.get('/retry')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('runs error interceptors for ApiError from a response interceptor', async () => {
    const client = new HttpClient('https://api.example.test')
    const intercepted = vi.fn()
    const apiError = new ApiError('business failure', 200, 50002)
    client.useResponse(() => {
      throw apiError
    })
    client.useError(intercepted)
    fetchMock.mockResolvedValue(jsonResponse({ ok: false }))

    await expect(client.get('/business')).rejects.toBe(apiError)
    expect(intercepted).toHaveBeenCalledWith(apiError, expect.objectContaining({ method: 'GET' }))
  })

  it('propagates a non-ApiError from a response interceptor', async () => {
    const client = new HttpClient('https://api.example.test')
    client.useResponse(() => {
      throw new TypeError('invalid response contract')
    })
    fetchMock.mockResolvedValue(jsonResponse({ ok: false }))

    await expect(client.get('/business')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'invalid response contract',
      backendCode: 'NETWORK_ERROR'
    })
  })

  it('wraps a fetch failure as ApiError and sends the same error to interceptors', async () => {
    const client = new HttpClient('https://api.example.test')
    const intercepted = vi.fn()
    client.useError(intercepted)
    fetchMock.mockRejectedValue(new TypeError('offline'))

    const request = client.get('/offline')

    await expect(request).rejects.toMatchObject({
      name: 'ApiError',
      message: 'offline',
      backendCode: 'NETWORK_ERROR'
    })
    expect(intercepted).toHaveBeenCalledOnce()
    expect(intercepted.mock.calls[0]?.[0]).toMatchObject({ backendCode: 'NETWORK_ERROR' })
  })

  it('turns an aborted fetch into a timeout ApiError', async () => {
    vi.useFakeTimers()
    const client = new HttpClient('https://api.example.test')
    const pendingFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    fetchMock.mockImplementation(pendingFetch)

    const request = client.get('/slow', { timeout: 5 })
    const assertion = expect(request).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Request timeout',
      backendCode: 'TIMEOUT'
    })
    await vi.advanceTimersByTimeAsync(5)

    await assertion
  })

  it('honors a caller supplied abort signal', async () => {
    const client = new HttpClient('https://api.example.test')
    const controller = new AbortController()
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

    await client.get('/signal', { signal: controller.signal })

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal })
  })
})

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
