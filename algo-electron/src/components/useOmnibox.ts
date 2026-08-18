import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import {
  getBrowserOmniboxSuggestions,
  setBrowserOmniboxOpen,
  subscribeUiCommand,
} from '../hooks/browserShellApi'

const OMNIBOX_DEBOUNCE_MS = 140
export const OMNIBOX_LISTBOX_ID = 'omnibox-suggestions-listbox'

interface UseOmniboxOptions {
  activeUrl: string
  onNavigate: (input: string) => void
}

export interface OmniboxController {
  draft: string
  open: boolean
  loading: boolean
  suggestions: OmniboxSuggestion[]
  activeIndex: number
  activeOptionId: string | undefined
  handleChange: (event: ChangeEvent<HTMLInputElement>) => void
  handleFocus: () => void
  handleBlur: (event: FocusEvent<HTMLInputElement>) => void
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  handleCompositionStart: (event: CompositionEvent<HTMLInputElement>) => void
  handleCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => void
  setActiveIndex: (index: number) => void
  submitSuggestion: (suggestion: OmniboxSuggestion) => void
}

export interface UseOmniboxResult {
  inputRef: RefObject<HTMLInputElement | null>
  controller: OmniboxController
}

function getOptionId(index: number): string {
  return `omnibox-suggestion-${index}`
}

export function useOmnibox({ activeUrl, onNavigate }: UseOmniboxOptions): UseOmniboxResult {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const focusedRef = useRef(false)
  const composingRef = useRef(false)
  const skipBlurRestoreRef = useRef(false)
  const requestSequenceRef = useRef(0)
  const [draft, setDraft] = useState(activeUrl)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<OmniboxSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)

  const close = useCallback(() => {
    requestSequenceRef.current += 1
    setOpen(false)
    setLoading(false)
    setSuggestions([])
    setActiveIndex(-1)
    setBrowserOmniboxOpen(false)
  }, [])

  const submit = useCallback((input: string) => {
    if (!input.trim()) return
    skipBlurRestoreRef.current = true
    setDraft(input)
    onNavigate(input)
    close()
    inputRef.current?.blur()
  }, [close, onNavigate])

  const submitSuggestion = useCallback((suggestion: OmniboxSuggestion) => {
    submit(suggestion.url)
  }, [submit])

  useEffect(() => {
    if (!focusedRef.current) setDraft(activeUrl)
  }, [activeUrl])

  useEffect(() => {
    return subscribeUiCommand((command) => {
      if (command.type !== 'focus-address-bar') return
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const sequence = ++requestSequenceRef.current
    setLoading(true)
    const timer = setTimeout(() => {
      void getBrowserOmniboxSuggestions(draft).then(
        (nextSuggestions) => {
          if (requestSequenceRef.current !== sequence || !focusedRef.current) return
          setSuggestions(nextSuggestions)
          setActiveIndex(-1)
          setLoading(false)
        },
        () => {
          if (requestSequenceRef.current !== sequence || !focusedRef.current) return
          setSuggestions([])
          setActiveIndex(-1)
          setLoading(false)
        },
      )
    }, OMNIBOX_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, open])

  useEffect(() => {
    return () => {
      requestSequenceRef.current += 1
      setBrowserOmniboxOpen(false)
    }
  }, [])

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value)
    setLoading(true)
    setSuggestions([])
    setActiveIndex(-1)
  }, [])

  const handleFocus = useCallback(() => {
    focusedRef.current = true
    setOpen(true)
    setLoading(true)
    setBrowserOmniboxOpen(true)
  }, [])

  const handleBlur = useCallback((_event: FocusEvent<HTMLInputElement>) => {
    focusedRef.current = false
    if (skipBlurRestoreRef.current) {
      skipBlurRestoreRef.current = false
    } else {
      setDraft(activeUrl)
    }
    close()
  }, [activeUrl, close])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (composingRef.current || event.nativeEvent.isComposing) return

    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault()
      setActiveIndex((current) => current < suggestions.length - 1 ? current + 1 : 0)
      return
    }
    if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault()
      setActiveIndex((current) => current > 0 ? current - 1 : suggestions.length - 1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const selected = suggestions[activeIndex]
      if (selected) submitSuggestion(selected)
      else submit(draft)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      skipBlurRestoreRef.current = true
      setDraft(activeUrl)
      close()
      inputRef.current?.blur()
    }
  }, [activeIndex, activeUrl, close, draft, submit, submitSuggestion, suggestions])

  const handleCompositionStart = useCallback((_event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback((_event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false
  }, [])

  return {
    inputRef,
    controller: {
      draft,
      open,
      loading,
      suggestions,
      activeIndex,
      activeOptionId: activeIndex >= 0 ? getOptionId(activeIndex) : undefined,
      handleChange,
      handleFocus,
      handleBlur,
      handleKeyDown,
      handleCompositionStart,
      handleCompositionEnd,
      setActiveIndex,
      submitSuggestion,
    },
  }
}

export function getOmniboxOptionId(index: number): string {
  return getOptionId(index)
}
