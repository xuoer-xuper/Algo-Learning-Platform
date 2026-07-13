import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './styles/bubble.css'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CoachChatPanelProps {
  onClose: () => void
}

export function CoachChatPanel({ onClose }: CoachChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleMouseEnter = () => {
    void window.electronAPI.coachToggleIgnoreMouseEvents(false)
  }
  const handleMouseLeave = () => {
    void window.electronAPI.coachToggleIgnoreMouseEvents(true)
  }

  const handleSend = async () => {
    const userMessage = input.trim()
    if (!userMessage || loading) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const result = await window.electronAPI.coachChat({
        message: userMessage,
        history: messages,
      })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.success ? result.reply : (result.error ?? '调用失败') },
      ])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: '调用失败' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div
      className="coach-chat-panel"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="coach-chat-header">
        <span className="coach-chat-title">AI 教练对话</span>
        <span className="coach-chat-source" data-source="llm">LLM</span>
        <button type="button" className="coach-bubble-close" onClick={onClose} aria-label="关闭对话">✕</button>
      </div>

      <div className="coach-chat-messages">
        {messages.length === 0 && !loading && (
          <div className="coach-chat-empty">
            直接输入问题与教练自由对话。{'\n'}需要分层提示请关闭面板，点击桌宠获取。
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`coach-chat-msg coach-chat-msg-${msg.role}`}>
            <span className="coach-chat-msg-role">{msg.role === 'user' ? '我' : '教练'}</span>
            <div className="coach-chat-msg-content">
              {msg.role === 'assistant'
                ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                : msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="coach-chat-msg coach-chat-msg-assistant">
            <span className="coach-chat-msg-role">教练</span>
            <div className="coach-chat-msg-content coach-chat-loading">思考中...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="coach-chat-input-area">
        <input
          type="text"
          className="coach-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题..."
          disabled={loading}
        />
        <button
          type="button"
          className="coach-action-btn coach-action-primary"
          onClick={() => void handleSend()}
          disabled={loading || !input.trim()}
        >
          发送
        </button>
      </div>
    </div>
  )
}
