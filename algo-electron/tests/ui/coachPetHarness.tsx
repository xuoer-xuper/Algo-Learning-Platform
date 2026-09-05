import React from 'react'
import { createRoot } from 'react-dom/client'
import { CoachPet } from '../../src/features/coach/CoachPet'
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
  showBubble: () => showBubble?.({
    id: 'test-hint', title: 'Hint', message: 'Check the boundary cases.',
    source: 'local', level: 1,
  }),
  dismissBubble: () => dismissBubble?.(),
}

const api = {
  coachGetPetState: async () => 'idle',
  coachGetConfig: async () => ({
    enabled: true, sound: false, bubbleFrequency: 'medium', position: null,
    scale: 1, opacity: 1, pinMode: 'follow',
  }),
  onCoachPetStateChanged: () => () => {},
  onCoachConfigChanged: () => () => {},
  onCoachShowBubble: (listener: (payload: CoachBubblePayload) => void) => {
    showBubble = listener
    return () => { showBubble = null }
  },
  onCoachDismissBubble: (listener: () => void) => {
    dismissBubble = listener
    return () => { dismissBubble = null }
  },
  coachToggleIgnoreMouseEvents: async (ignore: boolean) => {
    window.__coachHarness.ignore = ignore
    await window.__applyNativeMouseCapture?.(ignore)
    return true
  },
  coachStartDrag: async () => true,
  coachEndDrag: async () => true,
  coachPetClick: async () => {
    window.__coachHarness.showBubble()
    return { triggered: true, level: 1, llmEnabled: true }
  },
  coachDismissHint: async () => true,
  coachTriggerHint: async () => ({ accepted: true, level: 2 }),
  coachDismissDisclaimer: async () => true,
  coachFeedback: async () => true,
  coachChat: async () => ({ success: true, reply: 'Check the input constraints.' }),
} satisfies Partial<ElectronAPI>

Object.defineProperty(window, 'electronAPI', { value: api, configurable: true })

createRoot(document.getElementById('root')!).render(<CoachPet />)
