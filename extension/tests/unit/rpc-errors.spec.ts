/** RPC 固定错误码与失败响应还原合同测试。 */

import { describe, expect, it } from 'vitest'

import {
  RpcDuplicateChannelError,
  RpcError,
  createRpcErrorFromResponse
} from '../../src/core/rpc/errors'
import type { RpcErrorCode } from '../../src/core/rpc/types'

describe('RPC errors', () => {
  it.each([
    ['TIMEOUT', 'RpcTimeoutError'],
    ['TARGET_NOT_FOUND', 'RpcTargetNotFoundError'],
    ['METHOD_NOT_FOUND', 'RpcMethodNotFoundError'],
    ['TRANSPORT_FORBIDDEN', 'RpcTransportForbiddenError'],
    ['UNAUTHORIZED', 'RpcUnauthorizedError'],
    ['PAYLOAD_TOO_LARGE', 'RpcPayloadTooLargeError'],
    ['SERIALIZATION_ERROR', 'RpcSerializationError'],
    ['TRANSPORT_ERROR', 'RpcTransportError'],
    ['INVALID_REQUEST', 'RpcInvalidRequestError'],
    ['TRANSPORT_DESTROYED', 'RpcTransportDestroyedError'],
    ['SERVER_ERROR', 'RpcServerError']
  ] as const)('restores %s as %s', (code, errorName) => {
    const error = createRpcErrorFromResponse({
      id: 'request-1',
      success: false,
      code,
      error: `failure:${code}`
    })

    expect(error).toMatchObject({
      name: errorName,
      code,
      message: `failure:${code}`
    })
  })

  it('falls back to SERVER_ERROR when a response omits code and message', () => {
    const error = createRpcErrorFromResponse({ id: 'request-2', success: false })

    expect(error).toMatchObject({
      name: 'RpcServerError',
      code: 'SERVER_ERROR',
      message: '[rpc] request failed with code: SERVER_ERROR'
    })
  })

  it('preserves a custom unknown response code in the fallback message', () => {
    const response = {
      id: 'request-3',
      success: false,
      code: 'FUTURE_ERROR' as RpcErrorCode
    }

    expect(createRpcErrorFromResponse(response)).toMatchObject({
      name: 'RpcServerError',
      code: 'SERVER_ERROR',
      message: '[rpc] request failed with code: FUTURE_ERROR'
    })
  })

  it('serializes the base error and reports duplicate channel registration', () => {
    const error = new RpcError('INVALID_REQUEST', 'invalid request')

    expect(error.toResponse('request-4')).toEqual({
      id: 'request-4',
      success: false,
      code: 'INVALID_REQUEST',
      error: 'invalid request'
    })
    expect(new RpcDuplicateChannelError('content')).toMatchObject({
      name: 'RpcDuplicateChannelError',
      message: '[rpc] duplicate channel registration: content'
    })
  })
})
