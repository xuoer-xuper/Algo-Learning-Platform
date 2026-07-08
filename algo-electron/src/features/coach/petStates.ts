/**
 * Coach 桌宠状态配置。
 *
 * 6 种状态，每状态对应：
 * - 主色（青蓝/紫冷感系，非萌系，参考 Codex / TRON / Cyberpunk 风格）
 * - 辅色（高亮/粒子）
 * - 动画名（在 pet.css 中定义）
 * - 描述（debug / a11y 用）
 *
 * 配色刻意避开暖色与饱和度过高的颜色，保持"科技感"而非"卡通萌系"。
 */

export type PetState = 'idle' | 'thinking' | 'alert' | 'celebrate' | 'sleep' | 'focus'

export interface PetStateConfig {
  /** 主色（描边与主体填充） */
  primary: string
  /** 辅色（粒子环、高亮） */
  accent: string
  /** 光晕色（box-shadow / filter glow） */
  glow: string
  /** 动画名（对应 pet.css 中的 keyframes） */
  animation: string
  /** 粒子环动画速度（秒） */
  particleDuration: number
  /** 描述（用于 a11y / 调试面板） */
  description: string
}

export const PET_STATES: Record<PetState, PetStateConfig> = {
  idle: {
    primary: '#22d3ee', // cyan-400
    accent: '#67e8f9', // cyan-300
    glow: 'rgba(34, 211, 238, 0.45)',
    animation: 'pet-idle-breathe',
    particleDuration: 12,
    description: '待机中',
  },
  thinking: {
    primary: '#818cf8', // indigo-400
    accent: '#a5b4fc', // indigo-300
    glow: 'rgba(129, 140, 248, 0.5)',
    animation: 'pet-thinking-pulse',
    particleDuration: 6,
    description: '思考中',
  },
  alert: {
    primary: '#f472b6', // pink-400（保留冷感但偏暖以示警告）
    accent: '#f9a8d4', // pink-300
    glow: 'rgba(244, 114, 182, 0.55)',
    animation: 'pet-alert-shake',
    particleDuration: 3,
    description: '需要你注意',
  },
  celebrate: {
    primary: '#34d399', // emerald-400（成功色，唯一偏暖绿）
    accent: '#6ee7b7', // emerald-300
    glow: 'rgba(52, 211, 153, 0.55)',
    animation: 'pet-celebrate-bounce',
    particleDuration: 4,
    description: '做得不错',
  },
  sleep: {
    primary: '#6366f1', // indigo-500（深紫，低饱和）
    accent: '#818cf8', // indigo-400
    glow: 'rgba(99, 102, 241, 0.35)',
    animation: 'pet-sleep-drift',
    particleDuration: 18,
    description: '休眠中',
  },
  focus: {
    primary: '#06b6d4', // cyan-500（更深，专注）
    accent: '#22d3ee', // cyan-400
    glow: 'rgba(6, 182, 212, 0.5)',
    animation: 'pet-focus-hold',
    particleDuration: 8,
    description: '专注模式',
  },
}

/**
 * 状态切换的合理转换提示（仅用于 a11y / 调试，不强制约束）。
 */
export const PET_STATE_LABEL: Record<PetState, string> = {
  idle: '待机',
  thinking: '思考',
  alert: '提醒',
  celebrate: '庆祝',
  sleep: '休眠',
  focus: '专注',
}

/**
 * 6 状态枚举数组（设置面板 / 测试用）。
 */
export const PET_STATE_LIST: PetState[] = ['idle', 'thinking', 'alert', 'celebrate', 'sleep', 'focus']
