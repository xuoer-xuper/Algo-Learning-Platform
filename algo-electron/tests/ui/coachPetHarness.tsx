import React from 'react'
import { createRoot } from 'react-dom/client'
import { CoachPet } from '../../src/features/coach/CoachPet'
import type { CoachBubblePayload } from '@shared/types/coach'
import '../../src/index.css'

declare global {
  interface Window {
    __applyNativeMouseCapture?: (ignore: boolean) => Promise<void>
    __coachHarness: {
      ignore: boolean
      showBubble: () => void
      dismissBubble: () => void
    }
  }
}

let showBubble: ((payload: CoachBubblePayload) => void) | null = null
let dismissBubble: (() => void) | null = null

window.__coachHarness = {
  ignore: true,
  showBubble: () =>
    showBubble?.({
      id: 'test-hint',
      title: 'Hint',
      message: 'Check the boundary cases.',
      source: 'local',
      level: 1,
    }),
  dismissBubble: () => dismissBubble?.(),
}

/** 只需要 coach 域的一个子集：域内方法保持完整签名，域对象本身允许缺方法。 */
type DomainStub = { [K in keyof typeof window.api]?: Partial<(typeof window.api)[K]> }

const api: DomainStub = {
  coach: {
    getPetState: async () => 'idle',
    getConfig: async () => ({
      enabled: true,
      sound: false,
      bubbleFrequency: 'medium',
      position: null,
      scale: 1,
      opacity: 1,
      pinMode: 'follow',
    }),
    onPetStateChanged: () => () => {},
    onConfigChanged: () => () => {},
    onShowBubble: (listener: (payload: CoachBubblePayload) => void) => {
      showBubble = listener
      return () => {
        showBubble = null
      }
    },
    onDismissBubble: (listener: () => void) => {
      dismissBubble = listener
      return () => {
        dismissBubble = null
      }
    },
    toggleIgnoreMouseEvents: async (ignore: boolean) => {
      window.__coachHarness.ignore = ignore
      await window.__applyNativeMouseCapture?.(ignore)
      return true
    },
    startDrag: async () => true,
    endDrag: async () => true,
    petClick: async () => {
      window.__coachHarness.showBubble()
      return { triggered: true, level: 1, llmEnabled: true }
    },
    dismissHint: async () => true,
    triggerHint: async () => ({ accepted: true, level: 2 }),
    dismissDisclaimer: async () => true,
    feedback: async () => true,
    chat: async () => ({ success: true, reply: 'Check the input constraints.' }),
  },
}

Object.defineProperty(window, 'api', { value: api, configurable: true })

createRoot(document.getElementById('root')!).render(<CoachPet />)
