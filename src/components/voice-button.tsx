'use client'

import { useRef, useState, useSyncExternalStore } from 'react'

// Minimal Web Speech API types; not in lib.dom for every TS version.
interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: SpeechEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
}
type RecognitionCtor = new () => Recognition

function ctor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}
const noSubscribe = () => () => {}

/**
 * Push-to-talk via the browser's speech recognition (Chrome, Edge, Safari).
 * Hidden where unsupported. Interim text streams into the input; the final
 * transcript is submitted when speech ends.
 */
export function VoiceButton({ disabled, onInterim, onFinal, onListening }: {
  disabled?: boolean
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onListening: (on: boolean) => void
}) {
  const supported = useSyncExternalStore(noSubscribe, () => !!ctor(), () => false)
  const [on, setOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)

  if (!supported) return null

  function set(listening: boolean) {
    setOn(listening)
    onListening(listening)
  }

  function start() {
    const Ctor = ctor()
    if (!Ctor) return
    setError(null)
    const r = new Ctor()
    r.lang = 'en-US'
    r.interimResults = true
    r.continuous = false
    let finalText = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else interim += res[0].transcript
      }
      onInterim((finalText + interim).trim())
    }
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Microphone blocked' : e.error)
    r.onend = () => {
      set(false)
      rec.current = null
      if (finalText.trim()) onFinal(finalText.trim())
    }
    rec.current = r
    r.start()
    set(true)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (on ? rec.current?.stop() : start())}
      aria-pressed={on}
      aria-label={on ? 'Stop listening' : 'Ask by voice'}
      title={error ?? (on ? 'Listening… click to stop' : 'Ask by voice')}
      className={`relative flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40 ${
        on ? 'border-bad bg-bad-soft text-bad' : error ? 'border-warn/50 text-warn' : 'border-line text-muted hover:border-accent hover:text-accent'
      }`}
    >
      {on && <span className="sg-pulse absolute inset-0 rounded-md ring-2 ring-bad/60" aria-hidden />}
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  )
}
