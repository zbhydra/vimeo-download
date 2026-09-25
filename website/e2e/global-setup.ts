/**
 * Playwright globalSetup：真实 smoke 跑前注入 e2e 登录态。
 *
 * 仅当 process.env.E2E_REAL_API_BASE_URL 存在时执行（即跑真实 smoke 时）；
 * 否则直接 return，对 mock/UI 跑零影响。
 *
 * 职责：
 * - spawn 后端 seed 脚本（backend/scripts/e2e_seed_user.py --action seed），
 *   并用 E2E_SEED_SCENARIO 显式选择账号业务状态；未指定时保持 parse-download。
 *   脚本会建对应 e2e 用户、签 token 并 store 进 Redis，
 *   把 {token, user_id, email, device_id} 单行 JSON 打到 stdout。
 * - 解析 stdout 最后一行 JSON，写入 process.env.E2E_ACCESS_TOKEN /
 *   E2E_DEVICE_ID，供 parse-download-smoke.spec.ts 注入 localStorage。
 *
 * 设计取舍：
 * - website→backend 的路径耦合集中在此处一个常量，便于维护。
 * - 用 execFileSync 同步执行：globalSetup 本就是串行前置，且失败要立刻中断整轮。
 * - seed 失败（DB/Redis 不可用、脚本异常）时抛带 stdout/stderr 的详细错误，
 *   而非泛化错误，便于定位（遵守项目错误定位规范）。
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// package.json 为 ESM（type:module），无 __dirname，从 import.meta.url 还原。
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 后端项目根目录：website/e2e/ 与 backend/ 同级父目录下。 */
const BACKEND_DIR = path.resolve(__dirname, '../../backend');
/** 后端 python，用于跑 seed 脚本；runner 可用 E2E_BACKEND_PYTHON 显式覆盖。 */
const BACKEND_PYTHON = process.env.E2E_BACKEND_PYTHON || path.join(BACKEND_DIR, '.venv/bin/python');
/** seed 脚本相对 backend 根目录路径。 */
const SEED_SCRIPT = 'scripts/e2e_seed_user.py';
/** 后端 seed 场景；Pricing smoke 必须显式选择其专用领取前状态。 */
const SEED_SCENARIO = process.env.E2E_SEED_SCENARIO || 'parse-download';

/** seed 脚本 stdout 的结果结构。 */
interface SeedResult {
  /** 后端实际执行的 seed 场景。 */
  scenario: string;
  /** 后端签发并已 store 进 Redis 的 access token。 */
  token: string;
  /** e2e 用户 ID。 */
  user_id: number;
  /** e2e 用户邮箱。 */
  email: string;
  /** 注入前端 localStorage 的 device_id。 */
  device_id: string;
}

/**
 * 调 seed 脚本拿登录态。
 *
 * @returns 解析后的 SeedResult
 * @throws 详细错误（含命令、退出码、stdout/stderr），便于定位
 */
function runSeed(): SeedResult {
  let stdout: string;
  try {
    stdout = execFileSync(
      BACKEND_PYTHON,
      [SEED_SCRIPT, '--action', 'seed', '--scenario', SEED_SCENARIO],
      { cwd: BACKEND_DIR, encoding: 'utf-8' }
    );
  } catch (error) {
    // execFileSync 抛错时 error 上挂着 stdout/stderr/status，全量带出便于定位。
    const err = error as { status?: number; stdout?: string; stderr?: string };
    console.error(error);
    throw new Error(
      `[global-setup] seed 脚本执行失败：${BACKEND_PYTHON} ${SEED_SCRIPT} --action seed ` +
        `--scenario ${SEED_SCENARIO}` +
        `（cwd=${BACKEND_DIR}）退出码=${err.status ?? 'unknown'}；` +
        `stdout=${err.stdout ?? ''}；stderr=${err.stderr ?? ''}。` +
        `请确认本地后端 MySQL/Redis 已启动且 backend/.venv 可用。`
    );
  }

  // 脚本约定 stdout 末行才是结果 JSON（前面可能有库打的零散行）。
  const lastLine = stdout.trim().split('\n').filter(Boolean).pop() ?? '';
  let parsed: SeedResult;
  try {
    parsed = JSON.parse(lastLine) as SeedResult;
  } catch (error) {
    console.error(error);
    throw new Error(
      `[global-setup] 无法解析 seed 脚本输出为 JSON。末行=「${lastLine}」；完整 stdout=「${stdout}」`
    );
  }

  if (!parsed.token || !parsed.device_id || parsed.scenario !== SEED_SCENARIO) {
    throw new Error(
      `[global-setup] seed 结果无效或场景不匹配：` +
        `expected=${SEED_SCENARIO} actual=${parsed.scenario ?? 'missing'} ` +
        `result=${JSON.stringify(parsed)}`
    );
  }
  return parsed;
}

/**
 * globalSetup 入口。
 *
 * 未设 E2E_REAL_API_BASE_URL 时 no-op（保护 mock 跑）；设了则注入登录态 env。
 */
async function globalSetup(): Promise<void> {
  if (!process.env.E2E_REAL_API_BASE_URL) {
    return;
  }

  const seed = runSeed();
  process.env.E2E_ACCESS_TOKEN = seed.token;
  process.env.E2E_DEVICE_ID = seed.device_id;
  console.log(
    `[global-setup] e2e 登录态已就绪：scenario=${seed.scenario} ` +
      `user_id=${seed.user_id} email=${seed.email}`
  );
}

export default globalSetup;
