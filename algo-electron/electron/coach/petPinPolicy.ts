/**
 * 桌宠置顶策略（B5.5，决策 D30）。
 *
 * 纯逻辑，不 import electron：输入「模式 + 是否有最近活跃壳 + 该壳是否聚焦」，
 * 输出「alwaysOnTop / level / 是否绑定 parent」。CoachPetWindow 只负责把决策
 * 落到 BrowserWindow 上，判定本身在这里，可以在 node 环境直接测。
 *
 * 三种模式的语义与它们各自要解决的问题：
 *
 * - `follow`（默认）：绑到最近活跃壳作为子窗口，`alwaysOnTop = false`。
 *   桌宠因此只浮在它所属的那个壳之上，不再压在别的应用和别的壳之上。
 *   **该壳失焦时主动解绑 parent**——原生右键菜单（B2.8 之后应用内菜单全是
 *   `Menu.popup()`）和原生文件/消息对话框都会把焦点从壳上拿走，解绑后桌宠退回
 *   普通 z 序，盖不住它们。这条是本模式解除「alwaysOnTop 盖住应用内一切」的实际手段。
 * - `always`：全局置顶（B3.5 之前的旧行为），只有用户显式选择才有。level 用
 *   `floating`，不绑 parent——全局置顶本来就不需要父子关系来抬升。
 * - `dock`：停靠。不置顶、不绑 parent，桌宠停在普通 z 序里，应用内任何窗口
 *   （连同壳内的 DOM 对话框）都能盖住它。壳内 DOM 浮层不是独立 OS 窗口，
 *   整窗 z 序切不出「盖住壳但不盖住壳内对话框」这一档，所以 dock 是那一类
 *   遮挡的兜底出口。
 */

/** 桌宠置顶模式。持久化在 `CoachConfig.pinMode`。 */
export type CoachPinMode = 'follow' | 'always' | 'dock'

export const COACH_PIN_MODES: readonly CoachPinMode[] = ['follow', 'always', 'dock'] as const

export const DEFAULT_COACH_PIN_MODE: CoachPinMode = 'follow'

export interface PetPinInput {
  mode: CoachPinMode
  /** 是否存在存活的最近活跃完整壳 */
  hasActiveShell: boolean
  /** 该最近活跃壳当前是否聚焦。原生菜单/模态弹出时壳会失焦，此值转 false */
  activeShellFocused: boolean
}

export interface PetPinDecision {
  alwaysOnTop: boolean
  /** 仅在 alwaysOnTop 为 true 时有意义；Windows 上 Electron 会把它映射到系统层级 */
  level: 'normal' | 'floating'
  /** true = parent 设为最近活跃壳；false = parent 置 null */
  attachToActiveShell: boolean
}

/**
 * 把任意来源的值收成合法模式。config.json 是用户可编辑的纯文本，
 * `loadConfig` 对 coach 字段只做浅合并不做校验，非法值必须在进入策略前落到默认档。
 */
export function normalizeCoachPinMode(value: unknown): CoachPinMode {
  return COACH_PIN_MODES.includes(value as CoachPinMode)
    ? value as CoachPinMode
    : DEFAULT_COACH_PIN_MODE
}

/**
 * 解析当前应该把桌宠窗口设成什么样。
 *
 * `follow` 是唯一会读 `hasActiveShell` / `activeShellFocused` 的模式：
 * 没有活跃壳可绑，或者那个壳已经不是焦点，都退回「不绑、不置顶」。
 */
export function resolvePetPinDecision(input: PetPinInput): PetPinDecision {
  switch (input.mode) {
    case 'always':
      return { alwaysOnTop: true, level: 'floating', attachToActiveShell: false }
    case 'dock':
      return { alwaysOnTop: false, level: 'normal', attachToActiveShell: false }
    case 'follow':
    default:
      return {
        alwaysOnTop: false,
        level: 'normal',
        attachToActiveShell: input.hasActiveShell && input.activeShellFocused,
      }
  }
}
