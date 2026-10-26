'use client'

import { useEffect, useRef, useState } from 'react'

/** Width of an element, kept current with a ResizeObserver. */
export function useWidth<T extends HTMLElement>(fallback = 300) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(120, Math.floor(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}
