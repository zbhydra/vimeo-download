import { createWriteStream } from 'fs'
import { join } from 'path'
import archiver from 'archiver'

async function zipDirectory(source, outPath) {
  const archive = archiver('zip', { zlib: { level: 9 } })
  const stream = createWriteStream(outPath)

  return new Promise((resolve, reject) => {
    archive
      .glob('**/*', {
        cwd: source,
        dot: true,
        ignore: ['.DS_Store', '**/.DS_Store']
      })
      .on('error', err => reject(err))
      .pipe(stream)

    stream.on('close', () => resolve())
    archive.finalize()
  })
}

async function main() {
  try {
    const distPath = join(process.cwd(), 'dist')
    const zipPath = join(process.cwd(), 'dist.zip')

    console.log('正在压缩 dist 目录...')
    await zipDirectory(distPath, zipPath)
    console.log(`✅ 压缩完成: ${zipPath}`)
  } catch (error) {
    console.error('❌ 压缩失败:', error.message)
    process.exit(1)
  }
}

main()
