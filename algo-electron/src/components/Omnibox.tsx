import type { RefObject } from 'react'
import { PLATFORM_NAMES } from '../shared/display'
import { Icon } from './ui'
import {
  getOmniboxOptionId,
  OMNIBOX_LISTBOX_ID,
  type OmniboxController,
} from './useOmnibox'
import './Omnibox.css'

interface OmniboxProps {
  controller: OmniboxController
}

interface OmniboxInputProps extends OmniboxProps {
  inputRef: RefObject<HTMLInputElement | null>
}

export function Omnibox({ controller, inputRef }: OmniboxInputProps) {
  return (
    <div className="omnibox">
      <input
        ref={inputRef}
        className="url-input"
        type="text"
        value={controller.draft}
        onChange={controller.handleChange}
        onFocus={controller.handleFocus}
        onBlur={controller.handleBlur}
        onKeyDown={controller.handleKeyDown}
        onCompositionStart={controller.handleCompositionStart}
        onCompositionEnd={controller.handleCompositionEnd}
        placeholder="输入网址或搜索内容"
        role="combobox"
        aria-label="地址和搜索栏"
        aria-autocomplete="list"
        aria-expanded={controller.open}
        aria-controls={OMNIBOX_LISTBOX_ID}
        aria-activedescendant={controller.activeOptionId}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}

export function OmniboxSuggestionsPanel({ controller }: OmniboxProps) {
  return (
    <section className="omnibox-suggestions-panel" aria-label="地址栏建议">
      <div
        id={OMNIBOX_LISTBOX_ID}
        className="omnibox-suggestions-list"
        role="listbox"
        aria-label="本地浏览建议"
        aria-busy={controller.loading}
      >
        {controller.suggestions.map((suggestion, index) => {
          const title = suggestion.title || suggestion.platformProblemId || suggestion.url
          const selected = controller.activeIndex === index
          return (
            <button
              key={`${suggestion.problemId}:${suggestion.url}`}
              id={getOmniboxOptionId(index)}
              type="button"
              className={`omnibox-suggestion-option${selected ? ' omnibox-suggestion-option-active' : ''}`}
              role="option"
              aria-selected={selected}
              tabIndex={-1}
              onMouseEnter={() => controller.setActiveIndex(index)}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                controller.submitSuggestion(suggestion)
              }}
            >
              <Icon name={suggestion.source === 'history' ? 'globe' : 'code'} size={15} />
              <span className="omnibox-suggestion-copy">
                <span className="omnibox-suggestion-title">{title}</span>
                <span className="omnibox-suggestion-meta">
                  {PLATFORM_NAMES[suggestion.platform] || suggestion.platform}
                  {' · '}
                  {suggestion.platformProblemId}
                  {' · '}
                  {suggestion.source === 'history' ? '最近访问' : '本地题目'}
                </span>
              </span>
              <span className="omnibox-suggestion-url">{suggestion.url}</span>
            </button>
          )
        })}
        {controller.suggestions.length === 0 && (
          <div className="omnibox-suggestions-empty">
            {controller.loading ? '正在加载建议...' : '暂无本地建议'}
          </div>
        )}
      </div>
    </section>
  )
}
