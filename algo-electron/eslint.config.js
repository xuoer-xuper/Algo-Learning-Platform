import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// 类型感知的 typescript-eslint 取代了原先的 @babel/eslint-parser。旧配置用 Babel parser 并关掉
// no-undef / no-unused-vars，理由是"TS 7 领先于 typescript-eslint 的类型感知解析器"；阶段 0.3
// 把 TypeScript 降到 6.0.3 之后这个理由不再成立。
//
// 作用范围（分阶段开门的决定，见 .trellis/tasks/09-17-phase-0-tooling-gates/design.md §4）：
//   - 生产代码 src/** + electron/**：跑 recommended + recommendedTypeChecked；
//   - tests/** 与根级 *.config.ts：维持 0.4 之前的规则面（js recommended + react-hooks + promise 守卫）。
//     原因有二：typed lint 需要文件属于某个 tsconfig 项目，而 tests/ 只被 tsconfig.tests.json 收录，
//     上游文档明确 allowDefaultProject 只适合少量配置文件（默认上限 8 个文件、glob 不允许 **），
//     192 个测试文件属于误用；且把 tests 一起升级会新引入 104 条违规（其中 94 条 no-explicit-any），
//     那是阶段 5（测试体系对齐）该做的事，不是本节。
const productionFiles = ['src/**/*.{ts,tsx}', 'electron/**/*.{ts,tsx}']

// 显式暂缓的类型债：三组共 279 处（2026-09-17 实测），不是"忘了开"，而是需要逐点判断类型流或
// 改动代码形状，已单独立项偿还：.trellis/tasks/09-30-typed-lint-debt。只有列在这里的规则是关的。
const deferredTypedDebt = {
  // 需要给导出函数/回调补返回类型，128 处（renderer 66 / main 62）。
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  // any 传播：JSON.parse、数据库行、IPC 载荷，121 处（集中在约 20 个文件）。
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  // async 函数传给 void 位置，30 处（renderer 29），修法是 void 包装或改签名。
  '@typescript-eslint/no-misused-promises': 'off',
}

const withFiles = (files) => (config) => ({ ...config, files })

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'release/**',
      'tmp/**',
      'node_modules/**',
      '*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  // 类型感知规则只能作用于进入了 tsconfig 项目的文件：不加 files 限制会连
  // eslint.config.js / tests/*.mjs 一起套用，直接以 "You have used a rule which requires
  // type information" 中止整个 lint（不是逐条报错）。
  ...tseslint.configs.recommended.map(withFiles(productionFiles)),
  ...tseslint.configs.recommendedTypeChecked.map(withFiles(productionFiles)),
  {
    // tests/** 与根级 *.config.ts 维持 0.4 之前的规则面：旧配置的 TypeScript 解析能力来自
    // @babel/eslint-parser，它随本阶段移除，所以这里只补回解析器（不引入 TS 规则、不取类型信息）。
    // 不补会退化成"用 espree 解析 TS"，166 个测试文件全部报 Parsing error。
    files: ['tests/**/*.{ts,tsx}', '*.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // 类型信息已经覆盖这两个基础规则；对 .ts/.tsx 关掉，避免与 TS 的判定打架。
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    files: productionFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        // projectService 用每个文件最近的 tsconfig.json 生成类型信息。src/**、electron/** 都在
        // tsconfig.json 的 include 里，所以只有这两个目录需要它。根的 *.config.ts 不在任何项目里，
        // 但走下面的 parser-only 分支（不取类型信息），因此不需要往 tsconfig.node.json 里塞它们——
        // 塞进去会让引用了 tsconfig.node.json 的 tsconfig.tests.json 在干净检出处报 TS6305。
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      // 下划线前缀是仓库既有约定：解构丢弃与未使用形参一样，用 ^_ 表达"刻意不用"。
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      ...deferredTypedDebt,
    },
  },
  {
    // 用户脚本执行体必须动态构造：执行的代码是用户数据（脚本源码 + 运行时拼装的胶水），
    // 编译期不存在对应函数，GM API 靠形参名注入，且脚本要跑在页面主世界而不是 preload 沙箱。
    // 这不是可绕过的写法，也不是"顺手关规则"：范围仅限这两个真正做动态编译的文件。
    files: [
      'electron/scripts/userScriptMainWorldRuntime.ts',
      'electron/scripts/userScriptCompiledCatalog.ts',
    ],
    rules: {
      '@typescript-eslint/no-implied-eval': 'off',
    },
  },
  {
    // main 进程不允许直接写 console（走 appLogger）。渲染层的 4 处不在父任务 AC
    // "console.* 在 main 中 0" 的承诺内，不为凑绿去改渲染层日志。
    files: ['electron/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: ['electron/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    rules: {
      'no-async-promise-executor': 'error',
      'no-promise-executor-return': 'error',
      'require-atomic-updates': 'error',
    },
  },
  {
    // 冒烟脚本与 preload 是唯一允许直接写 console 的两处：它们要在日志系统就绪之前出声，
    // 这一条在 PRD R4 与 spec/project/domain-rules.md 里都是显式例外。
    files: [
      'electron/app/startupSmoke.ts',
      'electron/scripts/userscriptBootstrapPreload.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
)
