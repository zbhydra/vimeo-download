/**
 * Injected RPC 迁移契约测试。
 *
 * 固定站点能力边界与共享 ready 信号。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  INJECTED_READY_EVENT,
  INJECTED_READY_MARK,
  markInjectedReady,
  waitForInjectedReady
} from '@/core/rpc/injectedReady'
import {
  METHOD_REQUEST_LIMITS,
  METHOD_RESPONSE_LIMITS,
  METHOD_TARGETS,
  METHOD_TRANSPORTS
} from '@/injected/injected-register'

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Vimeo injected provider 真实实现的 handler。 */
const VIMEO_INJECTED_HANDLERS = [
  'applyRuntimeConfig',
  'applySiteConfig',
  'getCapturedVimeoConfig',
  'listCapturedVimeoConfigs',
  'downloadMedia'
]

afterEach(() => {
  document.documentElement.removeAttribute(INJECTED_READY_MARK)
})

describe('injected ready', () => {
  it('provider 发布 marker 与 event 后 content 立即就绪', async () => {
    const eventListener = vi.fn()
    document.addEventListener(INJECTED_READY_EVENT, eventListener)

    try {
      markInjectedReady()
      await expect(waitForInjectedReady('Unit')).resolves.toBeUndefined()
      expect(document.documentElement.hasAttribute(INJECTED_READY_MARK)).toBe(true)
      expect(eventListener).toHaveBeenCalledOnce()
    } finally {
      document.removeEventListener(INJECTED_READY_EVENT, eventListener)
    }
  })

  it('先等待时由同一个 event 完成就绪', async () => {
    const pending = waitForInjectedReady('Unit', 1000)
    markInjectedReady()
    await expect(pending).resolves.toBeUndefined()
  })
})

describe('site injected capabilities', () => {
  it('Vimeo provider 只注册自身真实 handler', () => {
    const sourcePath = path.join(extensionRoot, 'src/sites/vimeo/injected/index.ts')
    expect(readHandlerKeys(sourcePath)).toEqual(VIMEO_INJECTED_HANDLERS)
  })

  it('injected register 与 Vimeo provider 的方法集合完全一致', () => {
    expect(Object.keys(METHOD_TARGETS)).toEqual(VIMEO_INJECTED_HANDLERS)
    expect(Object.keys(METHOD_TRANSPORTS)).toEqual(VIMEO_INJECTED_HANDLERS)
    expect(Object.keys(METHOD_REQUEST_LIMITS)).toEqual(VIMEO_INJECTED_HANDLERS)
    expect(Object.keys(METHOD_RESPONSE_LIMITS)).toEqual(VIMEO_INJECTED_HANDLERS)
  })

  it('Vimeo provider 下载终态只包含成功标记', () => {
    const sourcePath = path.join(extensionRoot, 'src/sites/vimeo/injected/index.ts')
    const sourceText = fs.readFileSync(sourcePath, 'utf8')
    expect(sourceText).toContain('return { success: true }')
    expect(sourceText).not.toContain('cancelled')
  })
})

/** 读取站点 createInjectedRpcHandlers 返回对象的直接属性名。 */
function readHandlerKeys(sourcePath: string): string[] {
  const sourceText = fs.readFileSync(sourcePath, 'utf8')
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true)
  const handlerFunction = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'createInjectedRpcHandlers'
  )
  if (!handlerFunction || !ts.isFunctionDeclaration(handlerFunction) || !handlerFunction.body) {
    throw new Error(`[injected-rpc-migration] handler factory 不存在: ${sourcePath}`)
  }

  const returnStatement = handlerFunction.body.statements.find(ts.isReturnStatement)
  if (!returnStatement?.expression || !ts.isObjectLiteralExpression(returnStatement.expression)) {
    throw new Error(`[injected-rpc-migration] handler factory 未直接返回对象: ${sourcePath}`)
  }

  return returnStatement.expression.properties.map(property => {
    if (!property.name) {
      throw new Error(`[injected-rpc-migration] handler 属性缺少名称: ${sourcePath}`)
    }
    return property.name.getText(sourceFile).replaceAll(/['"]/g, '')
  })
}
