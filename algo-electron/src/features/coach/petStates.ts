/**
 * Coach 桌宠状态配置。
 *
 * 视觉配置已统一移入 styles/tokens.css 与 styles/pet.css；这里仅保留
 * renderer 需要的状态描述，避免 TS/CSS 出现两套配色和动画真相。
 */

export type PetState = 'idle' | 'thinking' | 'alert' | 'celebrate' | 'sleep' | 'focus'

export interface PetStateConfig {
  /** 描述（用于 a11y / 调试面板） */
  description: string
}

export const PET_STATES: Record<PetState, PetStateConfig> = {
  idle: {
    description: '待机中',
  },
  thinking: {
    description: '思考中',
  },
  alert: {
    description: '需要你注意',
  },
  celebrate: {
    description: '做得不错',
  },
  sleep: {
    description: '休眠中',
  },
  focus: {
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
