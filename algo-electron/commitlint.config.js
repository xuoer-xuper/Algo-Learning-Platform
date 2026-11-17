/**
 * commitlint 配置——三道提交门的 commit-msg 一环。
 *
 * 规范来源（两份都要对照，本文件是词表的落地处）：
 * - `.trellis/spec/project/git-workflow.md` §"Commit Message Format"：type 表、scope 词表、
 *   type/scope 用英文小写、描述用中文——本项目层规范，以此为准；
 * - `.trellis/spec/shared/git-conventions.md` §"Commit Message Format"：模板基线，
 *   git-workflow.md 是对它的收窄。
 *
 * scope 词表变更时必须同步 git-workflow.md §"Scope enum"（该节写明了这条双向约定）。
 */

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // git-workflow.md §Types 的九个 type。release / design / tests / renderer 等历史写法一律
    // 非法——它们出现在旧历史里，正是现在要立这道门的原因（见该节表格下方的说明）。
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'style', 'perf', 'ci'],
    ],
    // git-workflow.md §"Scope enum" 的词表块（31 项）+ 该块下方散文点名的层级兜底。
    // 散文列出 main / renderer / preload / shared 四个层级兜底，其中 renderer、preload、shared
    // 已在词表块内，实际需要新增的只有 main。
    'scope-enum': [
      2,
      'always',
      [
        'adapters',
        'ai',
        'app',
        'backup',
        'browser',
        'coach',
        'cookies',
        'credentials',
        'db',
        'diagnostics',
        'downloads',
        'ipc',
        'notes',
        'parsers',
        'preload',
        'rating',
        'scripts',
        'shared',
        'shortcuts',
        'sites',
        'submissions',
        'tracking',
        'windows',
        'renderer',
        'ui',
        'tests',
        'docs',
        'ci',
        'deps',
        'release',
        'trellis',
        'main',
      ],
    ],
    // 描述是中文，大小写类规则没有意义——显式关闭（config-conventional 默认带一组 case 校验）。
    'subject-case': [0],
  },
}
