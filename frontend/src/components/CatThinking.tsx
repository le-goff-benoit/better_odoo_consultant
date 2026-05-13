import React, { useEffect, useRef, useState } from 'react'

type Mode =
  | 'idle'       // gentle bob, tail sway
  | 'thinking'   // head tilt, paw on chin
  | 'excited'    // bounce, ears perked
  | 'searching'  // lean forward, eyes scan
  | 'found'      // jump, tail up
  | 'working'    // typing paws, focused
  | 'surprised'  // jump back, fur puffed
  | 'sleepy'     // slow blink, curl

const MODE_DURATION: Record<Mode, number> = {
  idle: 3200, thinking: 3800, excited: 2400, searching: 3400,
  found: 2600, working: 3000, surprised: 2200, sleepy: 4000,
}
const MODE_WEIGHTS: Record<Mode, number> = {
  idle: 3, thinking: 4, excited: 2, searching: 3,
  found: 1, working: 3, surprised: 1, sleepy: 2,
}
function pickMode(current: Mode): Mode {
  const pool: Mode[] = []
  for (const [m, w] of Object.entries(MODE_WEIGHTS) as [Mode, number][])
    if (m !== current) for (let i = 0; i < w; i++) pool.push(m)
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function CatThinking({ size = 52, color = '#22D3EE' }: { size?: number; color?: string }) {
  const [mode, setMode] = useState<Mode>('idle')
  const modeRef = useRef<Mode>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function schedule() {
      timerRef.current = setTimeout(() => {
        const next = pickMode(modeRef.current)
        modeRef.current = next
        setMode(next)
        schedule()
      }, MODE_DURATION[modeRef.current] + Math.random() * 600)
    }
    schedule()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  // Derived per-mode values
  const bodyAnim = mode === 'excited' ? 'ct-bounce 0.45s ease-in-out infinite'
    : mode === 'found'    ? 'ct-jump 0.6s ease-in-out infinite'
    : mode === 'working'  ? 'ct-wiggle 0.4s ease-in-out infinite'
    : mode === 'sleepy'   ? 'ct-bob 3.6s ease-in-out infinite'
    : mode === 'surprised' ? 'ct-snap 0.5s ease-out forwards'
    : 'ct-bob 2.2s ease-in-out infinite'

  const headStyle: React.CSSProperties = mode === 'thinking'
    ? { animation: 'ct-tilt 2.4s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '50% 100%' }
    : mode === 'searching'
    ? { animation: 'ct-scan 1.1s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '50% 100%' }
    : mode === 'sleepy'
    ? { animation: 'ct-nod 3s ease-in-out infinite',    transformBox: 'fill-box', transformOrigin: '50% 100%' }
    : {}

  // Tail style — key feature of a cat
  const tailStyle: React.CSSProperties = mode === 'excited' || mode === 'found'
    ? { animation: 'ct-tail-up 0.4s ease-in-out infinite',   transformBox: 'fill-box', transformOrigin: '0% 100%' }
    : mode === 'sleepy'
    ? { animation: 'ct-tail-droop 3s ease-in-out infinite',  transformBox: 'fill-box', transformOrigin: '0% 100%' }
    : mode === 'working'
    ? { animation: 'ct-tail-twitch 0.6s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '0% 100%' }
    : { animation: 'ct-tail-sway 2.8s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '0% 100%' }

  // Left paw style
  const leftPawStyle: React.CSSProperties = mode === 'thinking'
    ? { animation: 'ct-paw-chin 2.4s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '100% 0%' }
    : mode === 'working'
    ? { animation: 'ct-paw-type 0.3s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '100% 0%' }
    : mode === 'excited' || mode === 'found'
    ? { animation: 'ct-paw-up 0.5s ease-in-out infinite',   transformBox: 'fill-box', transformOrigin: '100% 0%' }
    : {}

  // Right paw
  const rightPawStyle: React.CSSProperties = mode === 'idle'
    ? { animation: 'ct-wave 2.2s ease-in-out infinite',          transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : mode === 'working'
    ? { animation: 'ct-paw-type 0.3s 0.15s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : mode === 'excited' || mode === 'found'
    ? { animation: 'ct-paw-up 0.5s 0.1s ease-in-out infinite',   transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : {}

  // Eye animations
  const eyeAnim = mode === 'sleepy'    ? 'ct-blink-slow 4s ease-in-out infinite'
    : mode === 'surprised' ? 'ct-eyes-wide 0.5s ease-out forwards'
    : 'ct-blink 3.5s ease-in-out infinite'
  const eyeScaleY = mode === 'working' ? 0.3 : mode === 'sleepy' ? 0.3 : 1
  const eyeScanX = mode === 'searching' ? { animation: 'ct-eye-scan 1.1s ease-in-out infinite' } : {}

  // Cat eye color: vertical pupil visible
  const irisColor = mode === 'surprised' ? '#F59E0B'
    : mode === 'working'  ? '#34D399'
    : color
  // Pupil shape: vertical slit (narrow when bright/excited, round when dark/sleepy)
  const pupilRx = (mode === 'excited' || mode === 'found') ? 0.6 : 1.2
  const pupilRy = 2.0

  // Mouth expression
  const mouthPath = (mode === 'excited' || mode === 'found') ? 'M23 24.5 Q26 27 29 24.5'
    : mode === 'sleepy' || mode === 'working' ? 'M24 25.5 Q26 24 28 25.5'
    : 'M23.5 25 Q26 27 28.5 25'

  // Ear alertness
  const earAlert = mode === 'excited' || mode === 'found' || mode === 'surprised'

  return (
    <svg width={size} height={size} viewBox="0 0 52 56" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-label="Réflexion en cours"
      style={{ flexShrink: 0, overflow: 'visible' }}>
      <style>{`
        @keyframes ct-bob        { 0%,100%{transform:translateY(0)}       50%{transform:translateY(-2.5px)} }
        @keyframes ct-bounce     { 0%,100%{transform:translateY(0)}       40%{transform:translateY(-6px)} 70%{transform:translateY(-2px)} }
        @keyframes ct-jump       { 0%,100%{transform:translateY(0)}       35%{transform:translateY(-8px)} 65%{transform:translateY(-3px)} }
        @keyframes ct-wiggle     { 0%,100%{transform:rotate(0deg)}        25%{transform:rotate(3deg)} 75%{transform:rotate(-3deg)} }
        @keyframes ct-snap       { 0%{transform:translateY(0)} 25%{transform:translateY(-10px)} 60%{transform:translateY(-3px)} 100%{transform:translateY(0)} }
        @keyframes ct-tilt       { 0%,100%{transform:rotate(0deg)}        40%,60%{transform:rotate(-11deg)} }
        @keyframes ct-scan       { 0%,100%{transform:rotate(0deg)}        30%{transform:rotate(6deg)} 70%{transform:rotate(-6deg)} }
        @keyframes ct-nod        { 0%,100%{transform:rotate(0deg)}        50%{transform:rotate(8deg)} }
        @keyframes ct-tail-sway  { 0%,100%{transform:rotate(0deg)}        30%{transform:rotate(18deg)} 70%{transform:rotate(-12deg)} }
        @keyframes ct-tail-up    { 0%,100%{transform:rotate(-30deg)}      50%{transform:rotate(-50deg)} }
        @keyframes ct-tail-droop { 0%,100%{transform:rotate(20deg)}       50%{transform:rotate(35deg)} }
        @keyframes ct-tail-twitch{ 0%,100%{transform:rotate(0deg)}        40%{transform:rotate(30deg)} }
        @keyframes ct-paw-chin   { 0%,100%{transform:rotate(-45deg)}      50%{transform:rotate(-35deg)} }
        @keyframes ct-paw-type   { 0%,100%{transform:translateY(0)}       50%{transform:translateY(-3px)} }
        @keyframes ct-paw-up     { 0%,100%{transform:rotate(-55deg)}      50%{transform:rotate(-40deg)} }
        @keyframes ct-wave       { 0%,100%{transform:rotate(0deg)}        30%{transform:rotate(28deg)} 60%{transform:rotate(-8deg)} }
        @keyframes ct-blink      { 0%,87%,100%{transform:scaleY(1)}       92%{transform:scaleY(0.07)} }
        @keyframes ct-blink-slow { 0%,68%,100%{transform:scaleY(1)}       82%{transform:scaleY(0.2)} }
        @keyframes ct-eyes-wide  { 0%{transform:scale(1)} 25%{transform:scale(1.3)} 100%{transform:scale(1)} }
        @keyframes ct-eye-scan   { 0%,100%{transform:translateX(0)}       40%{transform:translateX(2px)} 70%{transform:translateX(-2px)} }
        @keyframes ct-glow       { 0%,100%{opacity:0.6}                   50%{opacity:1} }
        @keyframes ct-bubble     { 0%,100%{opacity:0.5;transform:scale(0.9)} 50%{opacity:1;transform:scale(1)} }
        @keyframes ct-purr       { 0%,100%{transform:scale(1)}            50%{transform:scale(1.08)} }
      `}</style>

      {/* Full body group — animates together */}
      <g style={{ animation: bodyAnim, transformOrigin: '26px 56px' }}>

        {/* Tail — attached to back of body */}
        <g style={tailStyle}>
          <path d="M36 50 Q50 44 48 36 Q46 28 40 30" stroke="#C8B4A0" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          {/* Tail tip */}
          <ellipse cx="40" cy="29.5" rx="3" ry="2" fill={color} style={{ animation: 'ct-glow 2s ease-in-out infinite', opacity: 0.7 }} />
        </g>

        {/* Body */}
        <rect x="15" y="32" width="22" height="20" rx="7" fill="#D4C4B4" />
        <rect x="15" y="32" width="22" height="20" rx="7" fill={color} opacity="0.18" />
        {/* Tummy */}
        <ellipse cx="26" cy="42" rx="7" ry="8" fill="#EDE0D0" />
        {/* Tummy spot */}
        <ellipse cx="26" cy="44" rx="4" ry="4" fill={color} opacity="0.22" />

        {/* Left paw */}
        <g style={leftPawStyle}>
          <rect x="8" y="34" width="7" height="11" rx="3.5" fill="#D4C4B4" />
          <rect x="8" y="34" width="7" height="11" rx="3.5" fill={color} opacity="0.2" />
          <ellipse cx="11.5" cy="45.5" rx="3.8" ry="2.2" fill="#C8B4A0" />
          {/* Toe lines */}
          {[-1.2, 0, 1.2].map(dx => <line key={dx} x1={11.5 + dx} y1="44.5" x2={11.5 + dx} y2="47" stroke="#B09480" strokeWidth="0.7" strokeLinecap="round" />)}
        </g>

        {/* Right paw */}
        <g style={rightPawStyle}>
          <rect x="37" y="34" width="7" height="11" rx="3.5" fill="#D4C4B4" />
          <rect x="37" y="34" width="7" height="11" rx="3.5" fill={color} opacity="0.2" />
          <ellipse cx="40.5" cy="45.5" rx="3.8" ry="2.2" fill="#C8B4A0" />
          {[-1.2, 0, 1.2].map(dx => <line key={dx} x1={40.5 + dx} y1="44.5" x2={40.5 + dx} y2="47" stroke="#B09480" strokeWidth="0.7" strokeLinecap="round" />)}
        </g>

        {/* Hind legs */}
        <rect x="17" y="50" width="6" height="5" rx="3" fill="#C8B4A0" />
        <rect x="29" y="50" width="6" height="5" rx="3" fill="#C8B4A0" />
        <ellipse cx="20" cy="55" rx="4.5" ry="1.8" fill="#B09480" />
        <ellipse cx="32" cy="55" rx="4.5" ry="1.8" fill="#B09480" />

        {/* Head */}
        <g style={headStyle}>
          {/* Ears */}
          {earAlert ? (
            <>
              {/* Perked-up ears */}
              <polygon points="13,14 16,4 21,14" fill="#D4C4B4" />
              <polygon points="14,13 16,6 20,13" fill={color} opacity="0.4" />
              <polygon points="31,14 36,4 39,14" fill="#D4C4B4" />
              <polygon points="32,13 36,6 38,13" fill={color} opacity="0.4" />
            </>
          ) : (
            <>
              {/* Relaxed ears */}
              <polygon points="13,15 15,5 21,14" fill="#D4C4B4" />
              <polygon points="14,14 15.5,7 20,13" fill={color} opacity="0.35" />
              <polygon points="31,14 37,5 39,15" fill="#D4C4B4" />
              <polygon points="32,13 36.5,7 38,14" fill={color} opacity="0.35" />
            </>
          )}

          {/* Head base — round */}
          <circle cx="26" cy="20" r="13" fill="#D4C4B4" />
          <circle cx="26" cy="20" r="13" fill={color} opacity="0.16" />
          {/* Face markings */}
          <ellipse cx="26" cy="23" rx="7" ry="5" fill="#EDE0D0" />

          {/* Eyes */}
          {[{ cx: 20, delay: '0s' }, { cx: 32, delay: '0.2s' }].map(({ cx, delay }) => (
            <g key={cx} style={{
              animation: eyeAnim, animationDelay: delay,
              transform: `scaleY(${eyeScaleY})`,
              transformBox: 'fill-box', transformOrigin: '50% 50%',
              ...eyeScanX,
            }}>
              {/* Iris — large oval */}
              <ellipse cx={cx} cy="19" rx="4" ry="4.2" fill={irisColor} style={{ animation: 'ct-glow 2s ease-in-out infinite', animationDelay: delay }} />
              {/* Vertical slit pupil */}
              <ellipse cx={cx} cy="19" rx={pupilRx} ry={pupilRy} fill="#1a1a2e" />
              {/* Highlight */}
              <circle cx={cx + 1} cy="17.5" r="1" fill="white" opacity="0.9" />
              <circle cx={cx - 1} cy="20.5" r="0.5" fill="white" opacity="0.5" />
            </g>
          ))}

          {/* Nose */}
          <polygon points="25,23.5 27,23.5 26,25" fill={color} opacity="0.8" />

          {/* Mouth */}
          <path d={mouthPath} stroke="#B09480" strokeWidth="1.2" strokeLinecap="round" fill="none" />

          {/* Whiskers */}
          {[
            { x1: 8, y1: 23, x2: 20, y2: 24 }, { x1: 8, y1: 25.5, x2: 20, y2: 25.5 }, { x1: 8, y1: 28, x2: 20, y2: 27 },
            { x1: 44, y1: 23, x2: 32, y2: 24 }, { x1: 44, y1: 25.5, x2: 32, y2: 25.5 }, { x1: 44, y1: 28, x2: 32, y2: 27 },
          ].map((w, i) => (
            <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
              stroke="#B09480" strokeWidth="0.7" strokeLinecap="round" opacity="0.6" />
          ))}

          {/* Thinking bubbles */}
          {mode === 'thinking' && (
            <g>
              <circle cx="38" cy="10" r="1.2" fill="#C8B4A0" style={{ animation: 'ct-bubble 1.2s ease-in-out infinite' }} />
              <circle cx="41.5" cy="7.5" r="1.7" fill="#C8B4A0" style={{ animation: 'ct-bubble 1.2s 0.25s ease-in-out infinite' }} />
              <circle cx="45" cy="4.5" r="2.3" fill="#C8B4A0" style={{ animation: 'ct-bubble 1.2s 0.5s ease-in-out infinite' }} />
            </g>
          )}

          {/* Zzz */}
          {mode === 'sleepy' && (
            <g fill="#C8B4A0" style={{ animation: 'ct-bubble 2s ease-in-out infinite' }}>
              <text x="37" y="10" fontSize="3.5" fontWeight="bold">z</text>
              <text x="39.5" y="7.5" fontSize="4.5" fontWeight="bold">z</text>
              <text x="42.5" y="4.5" fontSize="5.5" fontWeight="bold">Z</text>
            </g>
          )}

          {/* Stars — surprised */}
          {mode === 'surprised' && (
            <g fill="#F59E0B" style={{ animation: 'ct-glow 0.45s ease-in-out infinite' }}>
              <text x="36" y="9" fontSize="5">✦</text>
              <text x="9" y="9" fontSize="4">✦</text>
            </g>
          )}

          {/* Purr lines — working */}
          {mode === 'working' && (
            <g style={{ animation: 'ct-purr 0.8s ease-in-out infinite' }}>
              <text x="37" y="10" fontSize="5" fill={color} opacity="0.7">～</text>
            </g>
          )}
        </g>
      </g>
    </svg>
  )
}
