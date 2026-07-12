/**
 * 评测发行版构建脚本。
 *
 * 用法：
 *   # Windows PowerShell
 *   $env:ARK_DEMO_KEY = "ark-xxxxx"
 *   node scripts/build-demo.js
 *
 *   # Linux / macOS
 *   ARK_DEMO_KEY=ark-xxxxx node scripts/build-demo.js
 *
 * 说明：
 *   - 构建时通过环境变量 ARK_DEMO_KEY 注入演示 API Key
 *   - Key 被编译进 app.asar（非源码硬编码），评测结束后在火山方舟控制台禁用即可
 *   - 不设置 ARK_DEMO_KEY 时正常构建（无演示 Key，用户需自行配置）
 */
const { spawn } = require('node:child_process')
const path = require('node:path')

const demoKey = process.env.ARK_DEMO_KEY

if (!demoKey) {
  console.warn('\n[build-demo] 警告：未设置 ARK_DEMO_KEY 环境变量')
  console.warn('[build-demo] 构建产物将不包含演示 Key，用户需自行配置 API Key\n')
} else {
  const masked = demoKey.length > 8
    ? `${demoKey.slice(0, 4)}****${demoKey.slice(-4)}`
    : '****'
  console.log(`\n[build-demo] 已注入演示 Key: ${masked}`)
  console.log('[build-demo] 评测结束后请在火山方舟控制台禁用该 Key\n')
}

const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const args = ['run', 'build:win']

const child = spawn(cmd, args, {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    ARK_DEMO_KEY: demoKey || '',
  },
})

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`[build-demo] 构建失败，退出码 ${code}`)
    process.exit(code)
  }
  console.log('\n[build-demo] 构建完成')
  if (demoKey) {
    console.log('[build-demo] 提醒：评测结束后请在火山方舟控制台禁用演示 Key')
  }
})
