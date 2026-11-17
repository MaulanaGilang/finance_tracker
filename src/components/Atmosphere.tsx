/**
 * Raycast-style atmosphere: the canvas stays near-black, with one faint glow of the active tool's hue
 * leaking in from the top (coral in the lobby), like light from a display. No grain, no drifting blobs.
 */
export function Atmosphere() {
  return (
    <div className="ambient" aria-hidden>
      <div className="orb" style={{ width: 900, height: 520, left: '50%', top: -330, marginLeft: -450, backgroundColor: 'var(--color-accent)', opacity: 0.13 }} />
      <div className="orb drift-slow" style={{ width: 520, height: 420, right: '-14%', top: -200, backgroundColor: '#63a1ff', opacity: 0.05 }} />
    </div>
  )
}
