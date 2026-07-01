export const OJ_SUBMISSION_BRIDGE_CHANNEL = '__algo_submission_v1'
export const OJ_SUBMISSION_IPC_CHANNEL = 'oj-submission:detected'

export interface OjSubmissionBridge {
  reportSubmission(payload: unknown): void
}

export function createOjSubmissionBridge(reportSubmission: (payload: unknown) => void): OjSubmissionBridge {
  return { reportSubmission }
}

function isMessageFromWindowOrChild(
  targetWindow: Pick<Window, 'addEventListener'>,
  source: MessageEventSource | null,
  depth = 0,
): boolean {
  if (source === targetWindow) return true
  if (depth > 6) return false

  try {
    const frames = (targetWindow as Window).frames
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index]
      if (frame === source) return true
      if (isMessageFromWindowOrChild(frame, source, depth + 1)) return true
    }
  } catch { /* ignore */ }

  return false
}

export function installOjSubmissionMessageForwarder(
  targetWindow: Pick<Window, 'addEventListener'>,
  reportSubmission: (payload: unknown) => void,
): void {
  targetWindow.addEventListener('message', (event) => {
    if (!isMessageFromWindowOrChild(targetWindow, event.source)) return
    const data = event.data
    if (!data || typeof data !== 'object') return
    const message = data as { channel?: string; payload?: unknown }
    if (message.channel !== OJ_SUBMISSION_BRIDGE_CHANNEL) return
    reportSubmission(message.payload)
  })
}
