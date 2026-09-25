/**
 * RPC 生成器单元测试。
 *
 * 覆盖 register 解析、矩阵校验、输出生成和 check 模式。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  generateOutputs,
  parseRegisterFile,
  runGenerator
} from '../../../../../../scripts/rpc-generate.mjs'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const extensionRoot = path.resolve(specDir, '../../../../../..')

describe('rpc-generate', () => {
  it('解析 content register 并生成 popup/background client', async () => {
    const register = parseRegisterFile('src/content/content-register.ts', extensionRoot)
    const outputs = await generateOutputs([register], extensionRoot)

    expect(register.channel).toBe('content')
    expect(register.methods.map((method: { name: string }) => method.name)).toEqual([
      'getResources',
      'getDownloadQueue',
      'downloadBatch',
      'cancelDownloadTask',
      'retryDownloadTask'
    ])
    expect(outputs.map(output => output.path).sort()).toEqual([
      'src/background/rpc/content.rpc.ts',
      'src/popup/rpc/content.rpc.ts'
    ])
    expect(outputs[0].source).toContain('export class ContentChannel')
  })

  it('拒绝非法 target/provider 矩阵', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-register-'))
    const invalidRegisterPath = path.join(tempDir, 'invalid-register.ts')

    fs.writeFileSync(
      invalidRegisterPath,
      `
export const CHANNEL = 'background' as const
export const CLASS_NAME = 'InvalidChannel' as const
export const Handler = {
  updateBadge(params: { count: number }): Promise<{ updated: boolean }> {
    throw new Error(String(params.count))
  }
}
export const METHOD_TARGETS = { updateBadge: ['injected'] } as const
export const METHOD_TRANSPORTS = { updateBadge: ['chrome'] } as const
export const METHOD_REQUEST_LIMITS = { updateBadge: 1024 } as const
export const METHOD_RESPONSE_LIMITS = { updateBadge: 1024 } as const
      `
    )

    expect(() => parseRegisterFile(invalidRegisterPath, extensionRoot)).toThrow(
      /invalid target injected->background/
    )
  })

  it('拒绝空 target 或空 transport', () => {
    const tempRoot = createTempRpcProject()
    writeRegister(tempRoot, {
      channel: 'content',
      className: 'ContentChannel',
      targets: '[]',
      transports: "['chrome']"
    })

    expect(() => parseRegisterFile('src/content/content-register.ts', tempRoot)).toThrow(
      /METHOD_TARGETS\.getResources must not be empty/
    )

    writeRegister(tempRoot, {
      channel: 'content',
      className: 'ContentChannel',
      targets: "['popup']",
      transports: '[]'
    })

    expect(() => parseRegisterFile('src/content/content-register.ts', tempRoot)).toThrow(
      /METHOD_TRANSPORTS\.getResources must not be empty/
    )
  })

  it('拒绝 caller 与 transport 不匹配的组合', () => {
    const tempRoot = createTempRpcProject()
    writeRegister(tempRoot, {
      channel: 'content',
      className: 'ContentChannel',
      targets: "['background']",
      transports: "['event']"
    })

    expect(() => parseRegisterFile('src/content/content-register.ts', tempRoot)).toThrow(
      /no legal transport for background->content/
    )
  })

  it('单文件生成会清理同一 register 的旧 caller 产物', async () => {
    const tempRoot = createTempRpcProject()
    writeRegister(tempRoot, {
      channel: 'content',
      className: 'ContentChannel',
      targets: "['popup', 'background']",
      transports: "['chrome']"
    })

    await runGenerator(['src/content/content-register.ts'], tempRoot)

    expect(fs.existsSync(path.join(tempRoot, 'src/popup/rpc/content.rpc.ts'))).toBe(true)
    expect(fs.existsSync(path.join(tempRoot, 'src/background/rpc/content.rpc.ts'))).toBe(true)

    writeRegister(tempRoot, {
      channel: 'content',
      className: 'ContentChannel',
      targets: "['popup']",
      transports: "['chrome']"
    })

    await runGenerator(['src/content/content-register.ts'], tempRoot)

    expect(fs.existsSync(path.join(tempRoot, 'src/popup/rpc/content.rpc.ts'))).toBe(true)
    expect(fs.existsSync(path.join(tempRoot, 'src/background/rpc/content.rpc.ts'))).toBe(false)
  })

  it('check 模式能发现磁盘额外生成文件', async () => {
    const tempRoot = createTempRpcProject()
    writeRegister(tempRoot, {
      channel: 'content',
      className: 'ContentChannel',
      targets: "['popup']",
      transports: "['chrome']"
    })
    await runGenerator([], tempRoot)
    fs.writeFileSync(path.join(tempRoot, 'src/popup/rpc/extra.rpc.ts'), 'export const extra = true\n')

    await expect(runGenerator(['--check'], tempRoot)).rejects.toThrow(
      /extra generated files on disk/
    )
  })

  it('check 模式能发现 manifest 漏项', async () => {
    const tempRoot = createTempRpcProject({
      generatedFiles: ['src/popup/rpc/content.rpc.ts']
    })
    writeRegister(tempRoot, {
      channel: 'content',
      className: 'ContentChannel',
      targets: "['popup', 'background']",
      transports: "['chrome']"
    })

    await expect(runGenerator(['--check'], tempRoot)).rejects.toThrow(
      /manifest missing generated files/
    )
  })

  it('check 模式确认生成文件为最新', async () => {
    const result = await runGenerator(['--check'], extensionRoot)

    expect(result.written).toEqual([])
    expect(result.checked.sort()).toEqual([
      'src/background/rpc/content.rpc.ts',
      'src/content/rpc/background.rpc.ts',
      'src/content/rpc/injected.rpc.ts',
      'src/popup/rpc/background.rpc.ts',
      'src/popup/rpc/content.rpc.ts'
    ])
  })
})

function createTempRpcProject(
  options: { generatedFiles?: string[] } = {}
): string {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-generator-project-'))
  const templateTargetDir = path.join(tempRoot, 'src/core/rpc/generator/templates')
  fs.mkdirSync(templateTargetDir, { recursive: true })
  fs.copyFileSync(
    path.join(extensionRoot, 'src/core/rpc/generator/templates/chrome-client.ts.template'),
    path.join(templateTargetDir, 'chrome-client.ts.template')
  )
  fs.copyFileSync(
    path.join(extensionRoot, 'src/core/rpc/generator/templates/event-client.ts.template'),
    path.join(templateTargetDir, 'event-client.ts.template')
  )
  fs.writeFileSync(
    path.join(tempRoot, '.prettierrc'),
    fs.readFileSync(path.join(extensionRoot, '.prettierrc'), 'utf8')
  )
  fs.mkdirSync(path.join(tempRoot, 'src/core/rpc/generator'), { recursive: true })
  fs.writeFileSync(
    path.join(tempRoot, 'src/core/rpc/generator/manifest.json'),
    JSON.stringify(
      {
        registers: ['src/content/content-register.ts'],
        generatedFiles: options.generatedFiles ?? [
          'src/popup/rpc/content.rpc.ts',
          'src/background/rpc/content.rpc.ts'
        ]
      },
      null,
      2
    )
  )
  return tempRoot
}

function writeRegister(
  root: string,
  options: {
    channel: 'content' | 'background' | 'injected'
    className: string
    targets: string
    transports: string
  }
): void {
  const registerPath = path.join(root, 'src/content/content-register.ts')
  fs.mkdirSync(path.dirname(registerPath), { recursive: true })
  fs.writeFileSync(
    registerPath,
    `
export const CHANNEL = '${options.channel}' as const
export const CLASS_NAME = '${options.className}' as const
export const Handler = {
  getResources(): Promise<{ count: number }> {
    throw new Error('declaration only')
  }
}
export const METHOD_TARGETS = { getResources: ${options.targets} } as const
export const METHOD_TRANSPORTS = { getResources: ${options.transports} } as const
export const METHOD_REQUEST_LIMITS = { getResources: 1024 } as const
export const METHOD_RESPONSE_LIMITS = { getResources: 4096 } as const
    `
  )
}
