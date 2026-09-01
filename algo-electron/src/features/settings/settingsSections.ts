import type { IconName } from '../../components/ui'

/*
 * 设置页分区清单（B5.1）。
 *
 * 单独成文件而不是写在 SettingsPage 里：这份顺序即导航顺序，测试要按它断言，
 * 放在组件内就得从 TSX 里 grep 字面量。
 *
 * 顺序按"改得最频繁的在上"排：外观/Coach/搜索是日常开关，站点与同步是配置期
 * 一次性动作，概览与诊断是只读页面，放最后。
 */

export const SETTINGS_SECTIONS = [
  { id: 'appearance', label: '外观', icon: 'palette' },
  { id: 'coach', label: 'Coach 桌宠', icon: 'bot' },
  { id: 'search', label: '地址栏搜索', icon: 'search' },
  { id: 'llm', label: 'AI 模型', icon: 'lightbulb' },
  { id: 'sites', label: '站点管理', icon: 'globe' },
  { id: 'sync', label: '账户与同步', icon: 'refresh' },
  { id: 'data', label: '数据与备份', icon: 'database' },
  { id: 'overview', label: '学习概览', icon: 'chart' },
  { id: 'diagnostics', label: '运行诊断', icon: 'bolt' },
] as const satisfies readonly { id: string, label: string, icon: IconName }[]

export type SettingsSectionId = typeof SETTINGS_SECTIONS[number]['id']
