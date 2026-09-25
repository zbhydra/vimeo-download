#!/usr/bin/env node
/**
 * RPC v2 client 生成器。
 *
 * 从上下文级 register 解析能力声明，校验调用矩阵，并生成调用方可见的 typed client。
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import prettier from 'prettier'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')

const validChannels = ['content', 'injected', 'background']
const validCallers = ['content', 'injected', 'background', 'popup']
const validTransports = ['chrome', 'event']
const generatedOutputDirs = ['src/popup/rpc', 'src/content/rpc', 'src/background/rpc']
const transportMatrix = new Map([
  ['popup->content', ['chrome']],
  ['background->content', ['chrome']],
  ['content->background', ['chrome']],
  ['popup->background', ['chrome']],
  ['content->injected', ['event']]
])

/** 读取生成器 manifest。 */
export function readManifest(root = projectRoot) {
  const text = fs.readFileSync(path.join(root, 'src/core/rpc/generator/manifest.json'), 'utf8')
  return JSON.parse(text)
}

/** 读取 Prettier 配置，生成文件必须跟项目格式一致。 */
function readPrettierConfig(root) {
  const configPath = path.join(root, '.prettierrc')
  if (!fs.existsSync(configPath)) {
    return {}
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

/** 解析 register 文件。 */
export function parseRegisterFile(registerFile, root = projectRoot) {
  const absolutePath = path.isAbsolute(registerFile) ? registerFile : path.join(root, registerFile)
  const sourceText = fs.readFileSync(absolutePath, 'utf8')
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true)
  const exportedConsts = collectExportedConsts(sourceFile)
  const handlerObject = getObjectLiteral(exportedConsts, 'Handler')
  const methods = parseHandlerMethods(handlerObject)
  const channel = getStringConst(exportedConsts, 'CHANNEL')
  const className = getStringConst(exportedConsts, 'CLASS_NAME')
  const methodTargets = parseStringArrayRecord(exportedConsts, 'METHOD_TARGETS')
  const methodTransports = parseStringArrayRecord(exportedConsts, 'METHOD_TRANSPORTS')
  const requestLimits = parseNumberRecord(exportedConsts, 'METHOD_REQUEST_LIMITS')
  const responseLimits = parseNumberRecord(exportedConsts, 'METHOD_RESPONSE_LIMITS')
  const methodTimeouts = parseOptionalNumberRecord(exportedConsts, 'METHOD_TIMEOUTS')
  const relativePath = normalizePath(path.relative(root, absolutePath))

  const register = {
    filePath: absolutePath,
    relativePath,
    channel,
    className,
    handlerType: `${capitalize(channel)}Handler`,
    methods,
    methodTargets,
    methodTransports,
    requestLimits,
    responseLimits,
    methodTimeouts
  }

  validateRegister(register)
  return register
}

/** 校验 register 完整性。 */
export function validateRegister(register) {
  if (!validChannels.includes(register.channel)) {
    throw new Error(`[rpc-generate] invalid CHANNEL in ${register.relativePath}: ${register.channel}`)
  }

  if (!/^[A-Z][A-Za-z0-9]*$/.test(register.className)) {
    throw new Error(`[rpc-generate] invalid CLASS_NAME in ${register.relativePath}: ${register.className}`)
  }

  const methodNames = register.methods.map(method => method.name)
  assertCoveredKeys(register.relativePath, 'METHOD_TARGETS', methodNames, register.methodTargets)
  assertCoveredKeys(register.relativePath, 'METHOD_TRANSPORTS', methodNames, register.methodTransports)
  assertCoveredKeys(register.relativePath, 'METHOD_REQUEST_LIMITS', methodNames, register.requestLimits)
  assertCoveredKeys(register.relativePath, 'METHOD_RESPONSE_LIMITS', methodNames, register.responseLimits)
  assertSubsetKeys(register.relativePath, 'METHOD_TIMEOUTS', methodNames, register.methodTimeouts)

  for (const method of register.methods) {
    const targets = register.methodTargets[method.name]
    const transports = register.methodTransports[method.name]
    const requestLimit = register.requestLimits[method.name]
    const responseLimit = register.responseLimits[method.name]
    const timeout = register.methodTimeouts[method.name]

    validateStringUnion(register.relativePath, `METHOD_TARGETS.${method.name}`, targets, validCallers)
    validateStringUnion(register.relativePath, `METHOD_TRANSPORTS.${method.name}`, transports, validTransports)

    if (targets.length === 0) {
      throw new Error(`[rpc-generate] METHOD_TARGETS.${method.name} must not be empty in ${register.relativePath}`)
    }

    if (transports.length === 0) {
      throw new Error(`[rpc-generate] METHOD_TRANSPORTS.${method.name} must not be empty in ${register.relativePath}`)
    }

    if (!Number.isInteger(requestLimit) || requestLimit <= 0) {
      throw new Error(`[rpc-generate] invalid request limit for ${register.relativePath}:${method.name}`)
    }

    if (!Number.isInteger(responseLimit) || responseLimit <= 0) {
      throw new Error(`[rpc-generate] invalid response limit for ${register.relativePath}:${method.name}`)
    }

    if (timeout !== undefined && (!Number.isInteger(timeout) || timeout <= 0)) {
      throw new Error(`[rpc-generate] invalid timeout for ${register.relativePath}:${method.name}`)
    }

    for (const caller of targets) {
      const matrixKey = `${caller}->${register.channel}`
      const allowedTransports = transportMatrix.get(matrixKey)
      if (!allowedTransports) {
        throw new Error(`[rpc-generate] invalid target ${matrixKey} for ${register.relativePath}:${method.name}`)
      }

      const legalTransports = transports.filter(transport => allowedTransports.includes(transport))
      if (legalTransports.length === 0) {
        throw new Error(
          `[rpc-generate] no legal transport for ${matrixKey} at ${register.relativePath}:${method.name}`
        )
      }

      for (const transport of transports) {
        if (!allowedTransports.includes(transport)) {
          throw new Error(
            `[rpc-generate] invalid transport ${transport} for ${matrixKey} at ${register.relativePath}:${method.name}`
          )
        }
      }
    }

  }
}

/** 为 register 生成输出文件。 */
export async function generateOutputs(registers, root = projectRoot) {
  const chromeTemplate = fs.readFileSync(path.join(root, 'src/core/rpc/generator/templates/chrome-client.ts.template'), 'utf8')
  const eventTemplate = fs.readFileSync(path.join(root, 'src/core/rpc/generator/templates/event-client.ts.template'), 'utf8')
  const prettierConfig = readPrettierConfig(root)
  const outputs = []

  for (const register of registers) {
    const callers = collectCallers(register)

    for (const caller of callers) {
      const targetPath = getOutputPath(caller, register.channel)
      if (!targetPath) {
        continue
      }

      const transport = getTransportForCaller(register, caller)
      const methods = register.methods.filter(method => register.methodTargets[method.name].includes(caller))
      const template = transport === 'event' ? eventTemplate : chromeTemplate
      const rawSource = renderClient(template, register, caller, transport, methods)
      const source = await prettier.format(rawSource, {
        ...prettierConfig,
        parser: 'typescript'
      })
      outputs.push({ path: targetPath, source })
    }
  }

  return outputs
}

/** 执行生成或检查。 */
export async function runGenerator(args, root = projectRoot) {
  const check = args.includes('--check')
  const registerArgs = args.filter(arg => arg !== '--check')
  const manifest = readManifest(root)
  const registerPaths = check ? manifest.registers : registerArgs.length > 0 ? registerArgs : manifest.registers
  const registers = registerPaths.map(registerPath => parseRegisterFile(registerPath, root))
  const outputs = await generateOutputs(registers, root)

  if (check) {
    checkGeneratedFiles(root, manifest, outputs)

    return { checked: outputs.map(output => output.path), written: [] }
  }

  if (registerArgs.length === 0) {
    for (const generatedFile of manifest.generatedFiles) {
      const absolutePath = path.join(root, generatedFile)
      if (fs.existsSync(absolutePath)) {
        fs.rmSync(absolutePath)
      }
    }
  } else {
    const cleanupTargets = new Set(registers.flatMap(register => getPossibleOutputPathsForRegister(register)))
    for (const generatedFile of cleanupTargets) {
      const absolutePath = path.join(root, generatedFile)
      if (fs.existsSync(absolutePath)) {
        fs.rmSync(absolutePath)
      }
    }
  }

  const written = []
  for (const output of outputs) {
    const absolutePath = path.join(root, output.path)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, output.source)
    written.push(output.path)
  }

  return { checked: [], written }
}

/** 校验期望输出、manifest 与磁盘生成文件集合完全一致。 */
function checkGeneratedFiles(root, manifest, outputs) {
  const expectedFiles = outputs.map(output => output.path)
  const manifestFiles = manifest.generatedFiles.map(normalizePath)
  const diskFiles = scanGeneratedFiles(root)
  const expectedSet = new Set(expectedFiles)
  const manifestSet = new Set(manifestFiles)
  const diskSet = new Set(diskFiles)
  const errors = []

  const missingFromManifest = difference(expectedSet, manifestSet)
  if (missingFromManifest.length > 0) {
    errors.push(`[rpc-generate] manifest missing generated files:\n${missingFromManifest.join('\n')}`)
  }

  const extraInManifest = difference(manifestSet, expectedSet)
  if (extraInManifest.length > 0) {
    errors.push(`[rpc-generate] manifest has extra generated files:\n${extraInManifest.join('\n')}`)
  }

  const missingOnDisk = difference(expectedSet, diskSet)
  if (missingOnDisk.length > 0) {
    errors.push(`[rpc-generate] generated files missing on disk:\n${missingOnDisk.join('\n')}`)
  }

  const extraOnDisk = difference(diskSet, expectedSet)
  if (extraOnDisk.length > 0) {
    errors.push(`[rpc-generate] extra generated files on disk:\n${extraOnDisk.join('\n')}`)
  }

  const staleFiles = []
  for (const output of outputs) {
    const absolutePath = path.join(root, output.path)
    const current = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : ''
    if (current !== output.source) {
      staleFiles.push(output.path)
    }
  }

  if (staleFiles.length > 0) {
    errors.push(`[rpc-generate] generated files are stale:\n${staleFiles.join('\n')}`)
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
}

/** 扫描磁盘上的生成 RPC 文件。 */
function scanGeneratedFiles(root) {
  const files = []
  for (const generatedDir of generatedOutputDirs) {
    const absoluteDir = path.join(root, generatedDir)
    if (!fs.existsSync(absoluteDir)) {
      continue
    }
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.rpc.ts')) {
        files.push(normalizePath(path.join(generatedDir, entry.name)))
      }
    }
  }
  return files.sort()
}

/** 解析导出 const。 */
function collectExportedConsts(sourceFile) {
  const exportedConsts = new Map()

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) {
      continue
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue
      }
      exportedConsts.set(declaration.name.text, declaration.initializer)
    }
  }

  return exportedConsts
}

/** 判断语句是否 export。 */
function hasExportModifier(statement) {
  return Boolean(statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
}

/** 获取字符串 const。 */
function getStringConst(exportedConsts, name) {
  const expression = unwrapExpression(exportedConsts.get(name))
  if (!expression || !ts.isStringLiteral(expression)) {
    throw new Error(`[rpc-generate] ${name} must be a string literal`)
  }
  return expression.text
}

/** 获取对象字面量。 */
function getObjectLiteral(exportedConsts, name) {
  const expression = unwrapExpression(exportedConsts.get(name))
  if (!expression || !ts.isObjectLiteralExpression(expression)) {
    throw new Error(`[rpc-generate] ${name} must be an object literal`)
  }
  return expression
}

/** 解析 Handler 方法。 */
function parseHandlerMethods(handlerObject) {
  return handlerObject.properties.map(property => {
    const name = getPropertyName(property.name)
    const hasParams = Boolean(property.parameters && property.parameters.length > 0)
    if (!name) {
      throw new Error('[rpc-generate] Handler method name must be an identifier or string literal')
    }
    return { name, hasParams }
  })
}

/** 解析字符串数组 record。 */
function parseStringArrayRecord(exportedConsts, name) {
  const objectLiteral = getObjectLiteral(exportedConsts, name)
  const record = {}

  for (const property of objectLiteral.properties) {
    const propertyName = getPropertyName(property.name)
    if (!propertyName || !ts.isPropertyAssignment(property)) {
      throw new Error(`[rpc-generate] ${name} keys must be property assignments`)
    }

    const arrayLiteral = unwrapExpression(property.initializer)
    if (!arrayLiteral || !ts.isArrayLiteralExpression(arrayLiteral)) {
      throw new Error(`[rpc-generate] ${name}.${propertyName} must be a string array`)
    }

    record[propertyName] = arrayLiteral.elements.map(element => {
      const valueExpression = unwrapExpression(element)
      if (!valueExpression || !ts.isStringLiteral(valueExpression)) {
        throw new Error(`[rpc-generate] ${name}.${propertyName} values must be string literals`)
      }
      return valueExpression.text
    })
  }

  return record
}

/** 解析数字 record。 */
function parseNumberRecord(exportedConsts, name) {
  const objectLiteral = getObjectLiteral(exportedConsts, name)
  return parseNumericProperties(objectLiteral, name)
}

/** 解析可选数字 record。 */
function parseOptionalNumberRecord(exportedConsts, name) {
  const expression = exportedConsts.get(name)
  if (!expression) {
    return {}
  }
  return parseNumericProperties(getObjectLiteral(exportedConsts, name), name)
}

/** 解析数字对象属性。 */
function parseNumericProperties(objectLiteral, name) {
  const record = {}

  for (const property of objectLiteral.properties) {
    const propertyName = getPropertyName(property.name)
    if (!propertyName || !ts.isPropertyAssignment(property)) {
      throw new Error(`[rpc-generate] ${name} keys must be property assignments`)
    }

    const valueExpression = unwrapExpression(property.initializer)
    if (!valueExpression || !ts.isNumericLiteral(valueExpression)) {
      throw new Error(`[rpc-generate] ${name}.${propertyName} must be a numeric literal`)
    }

    record[propertyName] = Number(valueExpression.text)
  }

  return record
}

/** 去掉 as const / satisfies / 括号包装。 */
function unwrapExpression(expression) {
  let current = expression
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current))
  ) {
    current = current.expression
  }
  return current
}

/** 获取属性名。 */
function getPropertyName(nameNode) {
  if (!nameNode) {
    return null
  }

  if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) {
    return nameNode.text
  }

  return null
}

/** 断言 record 覆盖所有方法且无额外 key。 */
function assertCoveredKeys(filePath, recordName, methodNames, record) {
  assertSubsetKeys(filePath, recordName, methodNames, record)

  for (const methodName of methodNames) {
    if (record[methodName] === undefined) {
      throw new Error(`[rpc-generate] ${recordName} missing method ${filePath}:${methodName}`)
    }
  }
}

/** 断言 record key 都来自 Handler。 */
function assertSubsetKeys(filePath, recordName, methodNames, record) {
  const methodSet = new Set(methodNames)
  for (const key of Object.keys(record)) {
    if (!methodSet.has(key)) {
      throw new Error(`[rpc-generate] ${recordName} has extra method ${filePath}:${key}`)
    }
  }
}

/** 校验字符串数组枚举值。 */
function validateStringUnion(filePath, fieldName, values, allowedValues) {
  for (const value of values) {
    if (!allowedValues.includes(value)) {
      throw new Error(`[rpc-generate] invalid ${fieldName} value in ${filePath}: ${value}`)
    }
  }
}

/** 收集 register 所有调用方。 */
function collectCallers(register) {
  const callers = new Set()
  for (const method of register.methods) {
    for (const caller of register.methodTargets[method.name]) {
      callers.add(caller)
    }
  }
  return Array.from(callers)
}

/** 获取某个 register 可能生成过的全部输出路径。 */
function getPossibleOutputPathsForRegister(register) {
  const outputPaths = []
  for (const caller of validCallers) {
    if (!transportMatrix.has(`${caller}->${register.channel}`)) {
      continue
    }

    const outputPath = getOutputPath(caller, register.channel)
    if (outputPath) {
      outputPaths.push(outputPath)
    }
  }
  return outputPaths
}

/** 获取生成文件输出路径。 */
function getOutputPath(caller, channel) {
  if (caller === 'popup') {
    return `src/popup/rpc/${channel}.rpc.ts`
  }

  if (caller === 'background') {
    return `src/background/rpc/${channel}.rpc.ts`
  }

  if (caller === 'content') {
    return `src/content/rpc/${channel}.rpc.ts`
  }

  return null
}

/** 获取 caller 到 provider 的 transport。 */
function getTransportForCaller(register, caller) {
  const matrixKey = `${caller}->${register.channel}`
  const allowedTransports = transportMatrix.get(matrixKey)
  if (!allowedTransports) {
    throw new Error(`[rpc-generate] output transport missing for ${matrixKey}`)
  }
  return allowedTransports[0]
}

/** 渲染客户端。 */
function renderClient(template, register, caller, transport, methods) {
  const methodSource = methods
    .map(method => renderMethod(register, method, transport))
    .join('\n\n')
  const hasParamMethod = methods.some(method => method.hasParams)

  return template
    .replaceAll('{{channel}}', register.channel)
    .replaceAll('{{source}}', register.relativePath)
    .replaceAll('{{caller}}', caller)
    .replaceAll('{{className}}', register.className)
    .replaceAll('{{handlerType}}', register.handlerType)
    .replaceAll('{{methodParamsImportLine}}', hasParamMethod ? '  RpcMethodParams,\n' : '')
    .replaceAll('{{registerImport}}', `@/${register.relativePath.replace(/^src\//, '').replace(/\.ts$/, '')}`)
    .replaceAll('{{methods}}', methodSource)
}

/** 渲染单个方法。 */
function renderMethod(register, method, _transport) {
  const transportAccessor = 'this.transport'
  const timeout = register.methodTimeouts[method.name]
  const optionsExpression = timeout === undefined ? 'options' : `{ ...options, timeout: options?.timeout ?? ${timeout} }`

  if (!method.hasParams) {
    return `  /** 调用 ${method.name} 能力。 */
  ${method.name}(options?: RpcCallOptions): Promise<RpcMethodResult<${register.handlerType}, '${method.name}'>> {
    return ${transportAccessor}.call<RpcMethodResult<${register.handlerType}, '${method.name}'>>(
      '${method.name}',
      undefined,
      ${optionsExpression}
    )
  }`
  }

  return `  /** 调用 ${method.name} 能力。 */
  ${method.name}(
    params: RpcMethodParams<${register.handlerType}, '${method.name}'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<${register.handlerType}, '${method.name}'>> {
    return ${transportAccessor}.call<
      RpcMethodResult<${register.handlerType}, '${method.name}'>,
      RpcMethodParams<${register.handlerType}, '${method.name}'>
    >('${method.name}', params, ${optionsExpression})
  }`
}

/** 首字母大写。 */
function capitalize(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
}

/** 统一 path 分隔符。 */
function normalizePath(value) {
  return value.split(path.sep).join('/')
}

/** 计算集合差集。 */
function difference(left, right) {
  return Array.from(left)
    .filter(value => !right.has(value))
    .sort()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await runGenerator(process.argv.slice(2))
    for (const filePath of result.written) {
      console.log(`[rpc-generate] wrote ${filePath}`)
    }
    for (const filePath of result.checked) {
      console.log(`[rpc-generate] checked ${filePath}`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
