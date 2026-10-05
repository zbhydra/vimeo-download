/** CWS 身份选择和 ZIP 内容的纯本地检查，不连接浏览器。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCwsPageUrl, selectCwsPage } from './cdp-helper.mjs';
import { checkUploadPackage } from './package-check.mjs';

assert.equal(typeof WebSocket, 'function');
const target = `https://chrome.google.com/webstore/devconsole/publisher/${'a'.repeat(32)}/edit/listing`;
const packageUrl = getCwsPageUrl(target, 'package');
const correct = { id: 'target', type: 'page', url: `${packageUrl}?hl=zh-TW` };
const other = { id: 'other', type: 'page', url: packageUrl.replace('a'.repeat(32), 'b'.repeat(32)) };
assert.equal(selectCwsPage([other, correct], packageUrl), correct);
assert.throws(() => selectCwsPage([other], packageUrl), /匹配 0 个/);
assert.throws(() => selectCwsPage([correct, { ...correct, id: 'duplicate' }], packageUrl), /匹配 2 个/);
assert.throws(() => getCwsPageUrl(undefined, 'package'), /目标 URL 无效/);
assert.throws(() => getCwsPageUrl(target.replace('chrome.google.com', 'example.com'), 'package'), /目标 URL 无效/);

const tempDir = mkdtempSync(join(tmpdir(), 'cws-package-check-'));
try {
  const dist = join(tempDir, 'dist');
  const zip = join(tempDir, 'package.zip');
  mkdirSync(dist);
  const manifest = { manifest_version: 3, name: '本地检查', version: '1.0.0' };
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(dist, 'main.js'), 'console.log(1)');
  execFileSync('zip', ['-qr', zip, '.'], { cwd: dist });
  writeFileSync(join(dist, '.DS_Store'), 'Finder metadata');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', '.DS_Store'), 'Finder metadata');
  assert.deepEqual(checkUploadPackage(zip, dist), manifest);
  writeFileSync(join(dist, 'main.js'), 'console.log(2)');
  assert.throws(() => checkUploadPackage(zip, dist), /entry=main.js/);
  writeFileSync(join(dist, 'main.js'), 'console.log(1)');
  writeFileSync(join(dist, 'missing.js'), 'console.log(3)');
  assert.throws(() => checkUploadPackage(zip, dist), /文件清单/);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
console.log('CWS 本地检查通过：目标页精确选择、缺失/歧义拒绝、ZIP manifest 与当前文件一致性。');
