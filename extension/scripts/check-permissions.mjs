#!/usr/bin/env node

/**
 * Chrome Extension Permissions Checker
 *
 * 验证 manifest 中声明的权限是否在代码中被实际使用。
 * 未使用的权限会违反 Chrome Web Store 的最小权限原则。
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

/**
 * 从 vite.config.ts 中提取 permissions 声明
 */
function extractManifestPermissions() {
  const configPath = join(projectRoot, 'vite.config.ts')
  const content = readFileSync(configPath, 'utf-8')

  const match = content.match(/permissions:\s*\[([^\]]+)\]/)
  if (!match) {
    console.error('❌ 无法在 vite.config.ts 中找到 permissions 声明')
    process.exit(1)
  }

  const permissionsStr = match[1]
  const permissions = permissionsStr
    .split(',')
    .map(p => p.trim().replace(/['"]/g, ''))

  return permissions
}

/**
 * Chrome API 权限到 API 调用模式的映射
 */
const PERMISSION_PATTERNS = {
  storage: 'chrome\\.storage\\.',
  downloads: 'chrome\\.downloads\\.',
  alarms: 'chrome\\.alarms\\.',
  bookmarks: 'chrome\\.bookmarks\\.',
  browserAction: 'chrome\\.action\\.|chrome\\.browserAction\\.',
  clipboardWrite: 'document\\.writeText\\(|navigator\\.clipboard\\.',
  declarativeContent: 'chrome\\.declarativeContent\\.',
  history: 'chrome\\.history\\.',
  identity: 'chrome\\.identity\\.',
  idle: 'chrome\\.idle\\.',
  management: 'chrome\\.management\\.',
  notifications: 'chrome\\.notifications\\.',
  pageCapture: 'chrome\\.pageCapture\\.',
  scripting: 'chrome\\.scripting\\.',
  search: 'chrome\\.search\\.',
  sessions: 'chrome\\.sessions\\.',
  topSites: 'chrome\\.topSites\\.',
  webNavigation: 'chrome\\.webNavigation\\.',
  webRequest: 'chrome\\.webRequest\\.',
}

/**
 * 递归获取目录下所有文件
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = readdirSync(dirPath)

  files.forEach(file => {
    const filePath = join(dirPath, file)
    const stat = statSync(filePath)

    if (stat.isDirectory()) {
      // 跳过 node_modules 和 dist
      if (
        file !== 'node_modules' &&
        file !== 'dist' &&
        file !== '.git' &&
        !file.startsWith('.')
      ) {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles)
      }
    } else {
      // 只检查 .ts, .js, .vue 文件
      if (/\.(ts|js|vue)$/.test(file)) {
        arrayOfFiles.push(filePath)
      }
    }
  })

  return arrayOfFiles
}

/**
 * 检查权限是否在代码中被使用
 */
function checkPermissionUsage(permission, files) {
  const pattern = PERMISSION_PATTERNS[permission]

  if (!pattern) {
    return {
      used: false,
      reason: '未知的权限类型'
    }
  }

  const regex = new RegExp(pattern, 'g')
  let matchCount = 0
  const matchingFiles = []

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8')
      const matches = content.match(regex)

      if (matches) {
        matchCount += matches.length
        matchingFiles.push({ file, count: matches.length })
      }
    } catch (error) {
      // 忽略无法读取的文件
    }
  }

  return {
    used: matchCount > 0,
    matchCount,
    matchingFiles
  }
}

/**
 * 主函数
 */
function main() {
  console.log('🔍 检查 Chrome 扩展权限使用情况...\n')

  const permissions = extractManifestPermissions()
  console.log(`📋 manifest 中声明的权限 (${permissions.length} 个):`)
  console.log(`   ${permissions.join(', ')}\n`)

  const srcPath = join(projectRoot, 'src')
  const files = getAllFiles(srcPath)

  console.log(`🔎 扫描 ${files.length} 个源文件...\n`)

  const unusedPermissions = []
  const usedPermissions = []

  for (const permission of permissions) {
    const result = checkPermissionUsage(permission, files)

    if (result.used) {
      usedPermissions.push({
        permission,
        matchCount: result.matchCount,
        files: result.matchingFiles.length
      })
      console.log(`✅ ${permission.padEnd(20)} - 使用 ${result.matchCount} 次，在 ${result.matchingFiles.length} 个文件中`)
    } else {
      unusedPermissions.push(permission)
      console.log(`⚠️  ${permission.padEnd(20)} - 未使用`)
    }
  }

  console.log('\n' + '='.repeat(60))

  if (unusedPermissions.length > 0) {
    console.log(`\n❌ 发现 ${unusedPermissions.length} 个未使用的权限:`)
    console.log(`   ${unusedPermissions.join(', ')}`)
    console.log('\n💡 请从 vite.config.ts 的 permissions 中移除这些权限。')
    console.log('   这违反了 Chrome Web Store 的最小权限原则。')
    process.exit(1)
  } else {
    console.log('\n✅ 所有声明的权限都在代码中被使用！')
    console.log('   权限配置符合最小权限原则。')
    process.exit(0)
  }
}

main()
