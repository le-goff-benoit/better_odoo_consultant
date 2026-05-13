import React, { useEffect, useRef, useState } from 'react'

type Mode =
  | 'idle'       // gentle bob, tail wag
  | 'thinking'   // head tilt, paw up
  | 'excited'    // fast bounce, tail crazy
  | 'searching'  // sniffing forward
  | 'found'      // jump, tail up
  | 'working'    // dig-typing paws
  | 'surprised'  // ear pop, eyes wide
  | 'sleepy'     // droopy ears, slow blink

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

export default function DogThinking({ size = 52, color = '#22D3EE' }: { size?: number; color?: string }) {
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

  const bodyAnim = mode === 'excited' ? 'dt-bounce 0.4s ease-in-out infinite'
    : mode === 'found'    ? 'dt-jump 0.55s ease-in-out infinite'
    : mode === 'working'  ? 'dt-wiggle 0.4s ease-in-out infinite'
    : mode === 'sleepy'   ? 'dt-bob 3.6s ease-in-out infinite'
    : mode === 'surprised' ? 'dt-snap 0.5s ease-out forwards'
    : 'dt-bob 2.2s ease-in-out infinite'

  const headStyle: React.CSSProperties = mode === 'thinking'
    ? { animation: 'dt-tilt 2.4s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '50% 100%' }
    : mode === 'searching'
    ? { animation: 'dt-lean 1.2s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '50% 100%' }
    : mode === 'sleepy'
    ? { animation: 'dt-nod 3s ease-in-out infinite',    transformBox: 'fill-box', transformOrigin: '50% 100%' }
    : {}

  // Floppy ears
  const leftEarStyle: React.CSSProperties = mode === 'excited' || mode === 'found'
    ? { animation: 'dt-ear-flap 0.4s ease-in-out infinite',   transformBox: 'fill-box', transformOrigin: '50% 0%' }
    : mode === 'sleepy'
    ? { animation: 'dt-ear-droop 3s ease-in-out infinite',    transformBox: 'fill-box', transformOrigin: '50% 0%' }
    : mode === 'surprised'
    ? { animation: 'dt-ear-up 0.4s ease-out forwards',        transformBox: 'fill-box', transformOrigin: '50% 0%' }
    : { animation: 'dt-ear-sway 2.4s ease-in-out infinite',   transformBox: 'fill-box', transformOrigin: '50% 0%' }

  const rightEarStyle: React.CSSProperties = mode === 'excited' || mode === 'found'
    ? { animation: 'dt-ear-flap 0.4s 0.1s ease-in-out infinite',  transformBox: 'fill-box', transformOrigin: '50% 0%' }
    : mode === 'sleepy'
    ? { animation: 'dt-ear-droop 3.2s 0.1s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '50% 0%' }
    : mode === 'surprised'
    ? { animation: 'dt-ear-up 0.4s 0.05s ease-out forwards',      transformBox: 'fill-box', transformOrigin: '50% 0%' }
    : { animation: 'dt-ear-sway 2.4s 0.3s ease-in-out infinite',  transformBox: 'fill-box', transformOrigin: '50% 0%' }

  // Tail — dog's tail is very expressive
  const tailStyle: React.CSSProperties = mode === 'excited' || mode === 'found'
    ? { animation: 'dt-tail-wag-fast 0.25s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '0% 100%' }
    : mode === 'sleepy'
    ? { animation: 'dt-tail-droop 3s ease-in-out infinite',       transformBox: 'fill-box', transformOrigin: '0% 100%' }
    : mode === 'searching'
    ? { animation: 'dt-tail-wag 0.5s ease-in-out infinite',       transformBox: 'fill-box', transformOrigin: '0% 100%' }
    : { animation: 'dt-tail-wag 1.2s ease-in-out infinite',       transformBox: 'fill-box', transformOrigin: '0% 100%' }

  // Front paws
  const leftPawStyle: React.CSSProperties = mode === 'thinking'
    ? { animation: 'dt-paw-up 2.4s ease-in-out infinite',     transformBox: 'fill-box', transformOrigin: '100% 0%' }
    : mode === 'working'
    ? { animation: 'dt-paw-dig 0.3s ease-in-out infinite',    transformBox: 'fill-box', transformOrigin: '100% 0%' }
    : mode === 'excited'
    ? { animation: 'dt-paw-jump 0.5s ease-in-out infinite',   transformBox: 'fill-box', transformOrigin: '100% 0%' }
    : {}

  const rightPawStyle: React.CSSProperties = mode === 'idle'
    ? { animation: 'dt-wave 2.2s ease-in-out infinite',              transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : mode === 'working'
    ? { animation: 'dt-paw-dig 0.3s 0.15s ease-in-out infinite',    transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : mode === 'excited'
    ? { animation: 'dt-paw-jump 0.5s 0.1s ease-in-out infinite',    transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : {}

  const eyeAnim = mode === 'sleepy'    ? 'dt-blink-slow 4s ease-in-out infinite'
    : mode === 'surprised' ? 'dt-eyes-wide 0.5s ease-out forwards'
    : 'dt-blink 3.5s ease-in-out infinite'
  const eyeScaleY = mode === 'working' || mode === 'sleepy' ? 0.35 : 1
  const eyeScan = mode === 'searching' ? { animation: 'dt-eye-scan 1.2s ease-in-out infinite' } : {}

  const eyeColor = mode === 'surprised' ? '#F59E0B' : mode === 'working' ? '#34D399' : color

  // Tongue: show when excited/found/panting
  const showTongue = mode === 'excited' || mode === 'found' || mode === 'searching'

  const nosePath = 'M22 22.5 Q26 24 30 22.5 Q32 20 26 19 Q20 20 22 22.5'

  return (
    <svg width={size} height={size} viewBox="0 0 52 56" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-label="Réflexion en cours"
      style={{ flexShrink: 0, overflow: 'visible' }}>
      <style>{`
        @keyframes dt-bob           { 0%,100%{transform:translateY(0)}       50%{transform:translateY(-2.5px)} }
        @keyframes dt-bounce        { 0%,100%{transform:translateY(0)}       40%{transform:translateY(-6px)} 70%{transform:translateY(-2px)} }
        @keyframes dt-jump          { 0%,100%{transform:translateY(0)}       35%{transform:translateY(-8px)} 65%{transform:translateY(-3px)} }
        @keyframes dt-wiggle        { 0%,100%{transform:rotate(0deg)}        25%{transform:rotate(3deg)} 75%{transform:rotate(-3deg)} }
        @keyframes dt-snap          { 0%{transform:translateY(0)} 20%{transform:translateY(-9px)} 55%{transform:translateY(-2px)} 100%{transform:translateY(0)} }
        @keyframes dt-tilt          { 0%,100%{transform:rotate(0deg)}        40%,60%{transform:rotate(-13deg)} }
        @keyframes dt-lean          { 0%,100%{transform:rotate(0deg)}        50%{transform:rotate(8deg)} }
        @keyframes dt-nod           { 0%,100%{transform:rotate(0deg)}        50%{transform:rotate(10deg)} }
        @keyframes dt-ear-sway      { 0%,100%{transform:rotate(0deg)}        30%{transform:rotate(8deg)} 70%{transform:rotate(-5deg)} }
        @keyframes dt-ear-flap      { 0%,100%{transform:rotate(0deg)}        30%{transform:rotate(20deg)} 60%{transform:rotate(-10deg)} }
        @keyframes dt-ear-droop     { 0%,100%{transform:rotate(5deg)}        50%{transform:rotate(15deg)} }
        @keyframes dt-ear-up        { 0%{transform:rotate(0)} 100%{transform:rotate(-25deg)} }
        @keyframes dt-tail-wag      { 0%,100%{transform:rotate(0deg)}        30%{transform:rotate(22deg)} 70%{transform:rotate(-16deg)} }
        @keyframes dt-tail-wag-fast { 0%,100%{transform:rotate(0deg)}        25%{transform:rotate(35deg)} 75%{transform:rotate(-30deg)} }
        @keyframes dt-tail-droop    { 0%,100%{transform:rotate(10deg)}       50%{transform:rotate(25deg)} }
        @keyframes dt-paw-up        { 0%,100%{transform:rotate(-50deg)}      50%{transform:rotate(-35deg)} }
        @keyframes dt-paw-dig       { 0%,100%{transform:translateY(0)}       50%{transform:translateY(-4px)} }
        @keyframes dt-paw-jump      { 0%,100%{transform:rotate(-40deg)}      50%{transform:rotate(-25deg)} }
        @keyframes dt-wave          { 0%,100%{transform:rotate(0deg)}        30%{transform:rotate(30deg)} 60%{transform:rotate(-8deg)} }
        @keyframes dt-blink         { 0%,87%,100%{transform:scaleY(1)}       92%{transform:scaleY(0.08)} }
        @keyframes dt-blink-slow    { 0%,68%,100%{transform:scaleY(1)}       82%{transform:scaleY(0.2)} }
        @keyframes dt-eyes-wide     { 0%{transform:scale(1)} 25%{transform:scale(1.3)} 100%{transform:scale(1)} }
        @keyframes dt-eye-scan      { 0%,100%{transform:translateX(0)}       40%{transform:translateX(2.5px)} 70%{transform:translateX(-2.5px)} }
        @keyframes dt-glow          { 0%,100%{opacity:0.6}                   50%{opacity:1} }
        @keyframes dt-bubble        { 0%,100%{opacity:0.5;transform:scale(0.9)} 50%{opacity:1;transform:scale(1)} }
        @keyframes dt-pant          { 0%,100%{transform:scaleY(1)}           50%{transform:scaleY(1.15)} }
      `}</style>

      {/* Full body */}
      <g style={{ animation: bodyAnim, transformOrigin: '26px 56px' }}>

        {/* Tail */}
        <g style={tailStyle}>
          <path d="M36 48 Q48 42 46 34 Q44 26 39 28" stroke="#C8A87A" strokeWidth="4" strokeLinecap="round" fill="none" />
          {/* Tail tip fluff */}
          <circle cx="39" cy="27.5" r="3.2" fill={color} opacity="0.65" style={{ animation: 'dt-glow 1.5s ease-in-out infinite' }} />
        </g>

        {/* Body */}
        <rect x="14" y="32" width="24" height="20" rx="8" fill="#D4A87A" />
        <rect x="14" y="32" width="24" height="20" rx="8" fill={color} opacity="0.18" />
        {/* Tummy */}
        <ellipse cx="26" cy="42" rx="8" ry="8" fill="#EDD8B8" />
        {/* Spot on tummy */}
        <ellipse cx="26" cy="44" rx="5" ry="4" fill={color} opacity="0.2" />

        {/* Left front paw */}
        <g style={leftPawStyle}>
          <rect x="7" y="33" width="7" height="12" rx="3.5" fill="#C8A87A" />
          <rect x="7" y="33" width="7" height="12" rx="3.5" fill={color} opacity="0.2" />
          <ellipse cx="10.5" cy="46" rx="4" ry="2.4" fill="#B89468" />
          {[-1.2, 0, 1.2].map(dx => <line key={dx} x1={10.5 + dx} y1="44.8" x2={10.5 + dx} y2="47.4" stroke="#A08058" strokeWidth="0.7" strokeLinecap="round" />)}
        </g>

        {/* Right front paw */}
        <g style={rightPawStyle}>
          <rect x="38" y="33" width="7" height="12" rx="3.5" fill="#C8A87A" />
          <rect x="38" y="33" width="7" height="12" rx="3.5" fill={color} opacity="0.2" />
          <ellipse cx="41.5" cy="46" rx="4" ry="2.4" fill="#B89468" />
          {[-1.2, 0, 1.2].map(dx => <line key={dx} x1={41.5 + dx} y1="44.8" x2={41.5 + dx} y2="47.4" stroke="#A08058" strokeWidth="0.7" strokeLinecap="round" />)}
        </g>

        {/* Hind legs */}
        <rect x="17" y="50" width="7" height="5" rx="3" fill="#B89468" />
        <rect x="28" y="50" width="7" height="5" rx="3" fill="#B89468" />
        <ellipse cx="20.5" cy="55.2" rx="4.8" ry="1.8" fill="#A08058" />
        <ellipse cx="31.5" cy="55.2" rx="4.8" ry="1.8" fill="#A08058" />

        {/* Head */}
        <g style={headStyle}>

          {/* Floppy ears */}
          <g style={leftEarStyle}>
            <ellipse cx="13.5" cy="18" rx="5" ry="8" fill="#C8A87A" />
            <ellipse cx="13.5" cy="18" rx="5" ry="8" fill={color} opacity="0.22" />
            <ellipse cx="13.5" cy="18" rx="3" ry="6" fill="#B89468" opacity="0.4" />
          </g>
          <g style={rightEarStyle}>
            <ellipse cx="38.5" cy="18" rx="5" ry="8" fill="#C8A87A" />
            <ellipse cx="38.5" cy="18" rx="5" ry="8" fill={color} opacity="0.22" />
            <ellipse cx="38.5" cy="18" rx="3" ry="6" fill="#B89468" opacity="0.4" />
          </g>

          {/* Head */}
          <circle cx="26" cy="18" r="13" fill="#D4A87A" />
          <circle cx="26" cy="18" r="13" fill={color} opacity="0.16" />

          {/* Snout */}
          <ellipse cx="26" cy="23" rx="8" ry="5.5" fill="#EDD8B8" />

          {/* Nose */}
          <path d={nosePath} fill="#3D2B1A" />
          {/* Nose shine */}
          <ellipse cx="24.5" cy="20.5" rx="1.2" ry="0.8" fill="white" opacity="0.4" />

          {/* Eyes */}
          {[{ cx: 19.5, delay: '0s' }, { cx: 32.5, delay: '0.2s' }].map(({ cx, delay }) => (
            <g key={cx} style={{
              animation: eyeAnim, animationDelay: delay,
              transform: `scaleY(${eyeScaleY})`,
              transformBox: 'fill-box', transformOrigin: '50% 50%',
              ...eyeScan,
            }}>
              <circle cx={cx} cy="15.5" r="4" fill="#3D2B1A" />
              <circle cx={cx} cy="15.5" r="2.8" fill={eyeColor} style={{ animation: 'dt-glow 2s ease-in-out infinite', animationDelay: delay }} />
              <circle cx={cx} cy="15.5" r="1.5" fill="#1a1a2e" />
              <circle cx={cx + 1} cy="14" r="0.9" fill="white" opacity="0.9" />
            </g>
          ))}

          {/* Tongue */}
          {showTongue && (
            <g style={{ animation: 'dt-pant 0.5s ease-in-out infinite' }}>
              <ellipse cx="26" cy="27" rx="3.5" ry="2.8" fill="#F472B6" />
              <line x1="26" y1="25" x2="26" y2="30" stroke="#E879B0" strokeWidth="0.8" />
            </g>
          )}

          {/* Thinking bubbles */}
          {mode === 'thinking' && (
            <g>
              <circle cx="38" cy="8"   r="1.2" fill="#B89468" style={{ animation: 'dt-bubble 1.2s ease-in-out infinite' }} />
              <circle cx="41.5" cy="5.5" r="1.7" fill="#B89468" style={{ animation: 'dt-bubble 1.2s 0.25s ease-in-out infinite' }} />
              <circle cx="45" cy="2.5"  r="2.3" fill="#B89468" style={{ animation: 'dt-bubble 1.2s 0.5s ease-in-out infinite' }} />
            </g>
          )}

          {/* Zzz */}
          {mode === 'sleepy' && (
            <g fill="#B89468" style={{ animation: 'dt-bubble 2s ease-in-out infinite' }}>
              <text x="37" y="9"    fontSize="3.5" fontWeight="bold">z</text>
              <text x="39.5" y="6.5" fontSize="4.5" fontWeight="bold">z</text>
              <text x="42.5" y="3.5" fontSize="5.5" fontWeight="bold">Z</text>
            </g>
          )}

          {/* Stars — surprised */}
          {mode === 'surprised' && (
            <g fill="#F59E0B" style={{ animation: 'dt-glow 0.45s ease-in-out infinite' }}>
              <text x="36" y="8" fontSize="5">✦</text>
              <text x="8"  y="8" fontSize="4">✦</text>
            </g>
          )}

          {/* Scan line — searching */}
          {mode === 'searching' && (
            <rect x="18" y="22" width="16" height="1.5" rx="0.75" fill={color} opacity="0.2"
              style={{ animation: 'dt-eye-scan 1.2s ease-in-out infinite' }} />
          )}
        </g>
      </g>
    </svg>
  )
}
