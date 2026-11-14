import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { EASE_OUT } from '../../lib/motion'

const W = 168 // preview width; covers are about 3:4, so roughly 168 x 240
const GAP = 14

/**
 * Shows the series cover beside its title while the mouse is over it.
 * The preview floats above everything (rows clip their contents), and only for a mouse pointer.
 */
export function CoverHover({ src, title, children }: { src: string | null; title: string; children: ReactNode }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [broken, setBroken] = useState(false)
  const show = !!src && !broken

  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    // Right of the title, or left of it when there's no room; kept inside the window vertically
    const x = r.right + GAP + W < window.innerWidth ? r.right + GAP : Math.max(8, r.left - GAP - W)
    const y = Math.min(Math.max(8, r.top + r.height / 2 - 120), window.innerHeight - 248)
    setAt({ x, y })
  }

  return (
    <span
      className="min-w-0"
      // A real mouse only (pen and touch taps open the row instead); judged per event, not by what the
      // device says its main pointer is, since touchscreen laptops often report "touch"
      onPointerEnter={(e) => show && e.pointerType === 'mouse' && place(e.currentTarget)}
      onPointerLeave={() => setAt(null)}
    >
      {children}
      {show &&
        createPortal(
          <AnimatePresence>
            {at && (
              <motion.span
                key="cover"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                className="pointer-events-none fixed z-50 overflow-hidden rounded-[12px] bg-card shadow-[0_18px_40px_-12px_rgb(0_0_0/0.35)] ring-1 ring-line"
                style={{ left: at.x, top: at.y, width: W }}
              >
                <img src={src!} alt={`Cover of ${title}`} referrerPolicy="no-referrer" onError={() => setBroken(true)} className="block h-auto w-full" />
              </motion.span>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </span>
  )
}

/** A small cover for the edit sheet */
export function CoverThumb({ src, title }: { src: string | null; title: string }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) return null
  return (
    <img
      src={src}
      alt={`Cover of ${title}`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-24 w-[68px] shrink-0 rounded-[8px] object-cover ring-1 ring-line"
    />
  )
}
