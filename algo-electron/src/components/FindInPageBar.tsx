import { useEffect, useRef, useState } from 'react'
import {
  findBrowserInPage,
  subscribeFindInPageResult,
  subscribeUiCommand,
} from '../hooks/browserShellApi'
import { IconButton } from './ui'

const CLOSED_FIND_STATE: FindInPageViewState = {
  open: false,
  tabId: null,
  query: '',
  requestId: null,
  activeMatchOrdinal: 0,
  matches: 0,
  finalUpdate: true,
}

interface FindInPageBarProps {
  activeTabId: string | null
}

export function FindInPageBar({ activeTabId }: FindInPageBarProps) {
  const [state, setState] = useState<FindInPageViewState>(CLOSED_FIND_STATE)
  const [focusRequest, setFocusRequest] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => subscribeFindInPageResult(setState), [])
  useEffect(() => subscribeUiCommand((command) => {
    if (command.type === 'focus-find-in-page') setFocusRequest((value) => value + 1)
  }), [])

  useEffect(() => {
    if (!state.open || state.tabId !== activeTabId) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [activeTabId, focusRequest, state.open, state.tabId])

  if (!state.open || !activeTabId || state.tabId !== activeTabId) return null

  const send = (command: FindInPageCommand) => {
    void findBrowserInPage(activeTabId, command)
  }
  const matchLabel = state.matches > 0
    ? `${state.activeMatchOrdinal}/${state.matches}`
    : '0/0'

  return (
    <div className="find-in-page-bar" role="search" data-testid="find-in-page-bar">
      <input
        ref={inputRef}
        className="find-in-page-input"
        value={state.query}
        placeholder="在页面中查找"
        aria-label="在页面中查找"
        onChange={(event) => {
          const query = event.currentTarget.value
          setState((current) => ({ ...current, query }))
          send({ type: 'query', query })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            send({ type: 'close' })
          } else if (event.key === 'Enter') {
            event.preventDefault()
            send({ type: event.shiftKey ? 'previous' : 'next' })
          }
        }}
      />
      <span className="find-in-page-count" aria-live="polite">{matchLabel}</span>
      <IconButton
        icon="chevron-left"
        title="上一个匹配项"
        size={14}
        disabled={!state.query}
        onClick={() => send({ type: 'previous' })}
      />
      <IconButton
        icon="chevron-right"
        title="下一个匹配项"
        size={14}
        disabled={!state.query}
        onClick={() => send({ type: 'next' })}
      />
      <IconButton icon="close" title="关闭查找" size={14} onClick={() => send({ type: 'close' })} />
    </div>
  )
}
