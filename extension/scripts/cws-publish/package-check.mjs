/** 读取上传 ZIP 的 manifest，并核对其内容与当前 dist 一致。 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** 返回已核对 ZIP 的 manifest；不一致时要求重新构建打包。 */
export function checkUploadPackage(zipPath, distDir) {
  const readEntry = entry => execFileSync('unzip', ['-p', zipPath, entry], { maxBuffer: 128 * 1024 * 1024 });
  const manifest = JSON.parse(readEntry('manifest.json').toString('utf8'));
  if (typeof manifest.version !== 'string' || typeof manifest.name !== 'string') {
    throw new Error(`上传 ZIP manifest 缺少 name/version: ${zipPath}，请重新构建打包`);
  }
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
    .trim().split('\n').filter(entry => !entry.endsWith('/')).sort();
  const files = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name !== '.DS_Store')
    .map(entry => relative(distDir, join(entry.parentPath, entry.name)).split(sep).join('/')).sort();
  if (JSON.stringify(entries) !== JSON.stringify(files)) {
    throw new Error(`上传 ZIP 文件清单与当前 dist 不一致: ${zipPath}, dist=${distDir}，请重新构建打包`);
  }
  for (const entry of entries) {
    if (!readEntry(entry).equals(readFileSync(join(distDir, entry)))) {
      throw new Error(`上传 ZIP 文件与当前 dist 不一致: ${zipPath}, entry=${entry}，请重新构建打包`);
    }
  }
  return manifest;
}
