import React, { useEffect, useRef, useState } from 'react'

// ── Animation modes ───────────────────────────────────────────────
type Mode =
  | 'idle'       // gentle bob
  | 'thinking'   // head tilt + thinking bubble
  | 'excited'    // fast bounce + both arms up
  | 'searching'  // lean forward, eyes scan side-to-side
  | 'found'      // jump + big wave
  | 'working'    // rapid torso wiggle, focused eyes
  | 'surprised'  // head snap back, arms out, stars
  | 'sleepy'     // slow bob, drooping antenna, zzz

const MODES: Mode[] = ['idle', 'thinking', 'excited', 'searching', 'found', 'working', 'surprised', 'sleepy']

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
  for (const [mode, weight] of Object.entries(MODE_WEIGHTS) as [Mode, number][]) {
    if (mode !== current) for (let i = 0; i < weight; i++) pool.push(mode)
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function RobotThinking({ size = 52 }: { size?: number }) {
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

  const bodyAnim = mode === 'excited' ? 'rt-bounce 0.45s ease-in-out infinite'
    : mode === 'found'    ? 'rt-jump 0.6s ease-in-out infinite'
    : mode === 'working'  ? 'rt-wiggle 0.35s ease-in-out infinite'
    : mode === 'sleepy'   ? 'rt-bob 3.6s ease-in-out infinite'
    : 'rt-bob 2.2s ease-in-out infinite'

  const headStyle: React.CSSProperties = mode === 'thinking'
    ? { animation: 'rt-tilt-l 2.4s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '50% 100%' }
    : mode === 'searching'
    ? { animation: 'rt-scan 1.1s ease-in-out infinite',   transformBox: 'fill-box', transformOrigin: '50% 100%' }
    : mode === 'surprised'
    ? { animation: 'rt-snap-back 0.5s ease-out forwards', transformBox: 'fill-box', transformOrigin: '50% 100%' }
    : mode === 'sleepy'
    ? { animation: 'rt-nod 3s ease-in-out infinite',      transformBox: 'fill-box', transformOrigin: '50% 100%' }
    : {}

  const leftArmStyle: React.CSSProperties = mode === 'thinking'
    ? { animation: 'rt-arm-think 2.4s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '100% 0%' }
    : mode === 'excited' || mode === 'found'
    ? { animation: 'rt-arm-up-l 0.5s ease-in-out infinite',  transformBox: 'fill-box', transformOrigin: '100% 0%' }
    : mode === 'surprised'
    ? { animation: 'rt-arm-out-l 0.4s ease-out forwards',    transformBox: 'fill-box', transformOrigin: '100% 0%' }
    : mode === 'sleepy'
    ? { animation: 'rt-arm-droop 3s ease-in-out infinite',   transformBox: 'fill-box', transformOrigin: '100% 0%' }
    : {}

  const rightArmStyle: React.CSSProperties = mode === 'idle'
    ? { animation: 'rt-wave 2.2s ease-in-out infinite',           transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : mode === 'excited'
    ? { animation: 'rt-arm-up-r 0.5s 0.1s ease-in-out infinite',  transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : mode === 'searching'
    ? { animation: 'rt-arm-search 1.1s ease-in-out infinite',     transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : mode === 'found'
    ? { animation: 'rt-wave-big 0.5s ease-in-out infinite',       transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : mode === 'working'
    ? { animation: 'rt-arm-type 0.3s ease-in-out infinite',       transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : mode === 'surprised'
    ? { animation: 'rt-arm-out-r 0.4s ease-out forwards',         transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : mode === 'sleepy'
    ? { animation: 'rt-arm-droop 3.2s 0.2s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '0% 0%' }
    : {}

  const eyeAnim = mode === 'sleepy'    ? 'rt-blink-slow 4s ease-in-out infinite'
    : mode === 'surprised' ? 'rt-eyes-wide 0.5s ease-out forwards'
    : 'rt-blink 3.6s ease-in-out infinite'
  const eyeScaleY = mode === 'working' || mode === 'sleepy' ? 0.45 : 1
  const eyeScan   = mode === 'searching' ? { animation: 'rt-eye-scan 1.1s ease-in-out infinite' } : {}

  const eyeColor   = mode === 'surprised' ? '#F59E0B' : mode === 'working' ? '#34D399' : '#22D3EE'
  const eyeInner   = mode === 'surprised' ? '#FCD34D' : mode === 'working' ? '#6EE7B7' : '#67E8F9'

  const smilePath  = (mode === 'excited' || mode === 'found')  ? 'M21 22.5 Q26 27.5 31 22.5'
    : mode === 'surprised'  ? 'M22.5 24 Q26 27 29.5 24'
    : (mode === 'sleepy' || mode === 'working') ? 'M23 24 Q26 22 29 24'
    : 'M22 23 Q26 26 30 23'

  const antennaGlow = mode === 'excited' || mode === 'found' ? 'rt-glow 0.6s ease-in-out infinite'
    : mode === 'sleepy' ? 'rt-glow 3s ease-in-out infinite'
    : 'rt-glow 1.8s ease-in-out infinite'

  const antennaStyle: React.CSSProperties = mode === 'sleepy'
    ? { animation: 'rt-ant-droop 3s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '26px 7px' }
    : { animation: 'rt-ant-sway 2.6s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '26px 7px' }

  return (
    <svg width={size} height={size} viewBox="0 0 52 56" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-label="Réflexion en cours"
      style={{ flexShrink: 0, overflow: 'visible' }}>
      <style>{`
        @keyframes rt-bob        { 0%,100%{transform:translateY(0)}      50%{transform:translateY(-2.5px)} }
        @keyframes rt-bounce     { 0%,100%{transform:translateY(0)}      40%{transform:translateY(-6px)} 70%{transform:translateY(-2px)} }
        @keyframes rt-jump       { 0%,100%{transform:translateY(0)}      35%{transform:translateY(-8px)} 65%{transform:translateY(-3px)} }
        @keyframes rt-wiggle     { 0%,100%{transform:rotate(0deg)}       25%{transform:rotate(3.5deg)} 75%{transform:rotate(-3.5deg)} }
        @keyframes rt-tilt-l     { 0%,100%{transform:rotate(0deg)}       40%,60%{transform:rotate(-11deg)} }
        @keyframes rt-scan       { 0%,100%{transform:rotate(0deg)}       30%{transform:rotate(6deg)} 70%{transform:rotate(-6deg)} }
        @keyframes rt-snap-back  { 0%{transform:rotate(0)} 20%{transform:rotate(-20deg)} 60%{transform:rotate(7deg)} 100%{transform:rotate(0)} }
        @keyframes rt-nod        { 0%,100%{transform:rotate(0deg)}       50%{transform:rotate(9deg)} }
        @keyframes rt-wave       { 0%,100%{transform:rotate(0deg)}       30%{transform:rotate(26deg)} 60%{transform:rotate(-6deg)} }
        @keyframes rt-wave-big   { 0%,100%{transform:rotate(0deg)}       30%{transform:rotate(38deg)} 60%{transform:rotate(-10deg)} }
        @keyframes rt-arm-think  { 0%,100%{transform:rotate(-62deg)}     50%{transform:rotate(-50deg)} }
        @keyframes rt-arm-up-l   { 0%,100%{transform:rotate(-72deg)}     50%{transform:rotate(-56deg)} }
        @keyframes rt-arm-up-r   { 0%,100%{transform:rotate(72deg)}      50%{transform:rotate(56deg)} }
        @keyframes rt-arm-search { 0%,100%{transform:rotate(20deg)}      50%{transform:rotate(-5deg)} }
        @keyframes rt-arm-type   { 0%,100%{transform:translateY(0)}      50%{transform:translateY(-3px)} }
        @keyframes rt-arm-out-l  { 0%{transform:rotate(0)} 100%{transform:rotate(-48deg)} }
        @keyframes rt-arm-out-r  { 0%{transform:rotate(0)} 100%{transform:rotate(48deg)} }
        @keyframes rt-arm-droop  { 0%,100%{transform:rotate(16deg)}      50%{transform:rotate(24deg)} }
        @keyframes rt-blink      { 0%,88%,100%{transform:scaleY(1)}      93%{transform:scaleY(0.07)} }
        @keyframes rt-blink-slow { 0%,70%,100%{transform:scaleY(1)}      85%{transform:scaleY(0.22)} }
        @keyframes rt-eyes-wide  { 0%{transform:scale(1)} 25%{transform:scale(1.28)} 100%{transform:scale(1)} }
        @keyframes rt-eye-scan   { 0%,100%{transform:translateX(0)}      40%{transform:translateX(2.2px)} 70%{transform:translateX(-2.2px)} }
        @keyframes rt-glow       { 0%,100%{opacity:0.65}                 50%{opacity:1} }
        @keyframes rt-ant-sway   { 0%,100%{transform:rotate(0deg)}       25%{transform:rotate(10deg)} 75%{transform:rotate(-10deg)} }
        @keyframes rt-ant-droop  { 0%,100%{transform:rotate(0deg)}       50%{transform:rotate(24deg)} }
        @keyframes rt-ear-pulse  { 0%,100%{transform:scale(1)}           50%{transform:scale(1.18)} }
        @keyframes rt-bubble     { 0%,100%{opacity:0.5;transform:scale(0.9)} 50%{opacity:1;transform:scale(1)} }
      `}</style>

      {/* Body */}
      <g style={{ animation: bodyAnim, transformOrigin: '26px 56px' }}>

        {/* Neck */}
        <rect x="23" y="30" width="6" height="4" rx="1.5" fill="#B0C4D8" />

        {/* Torso */}
        <rect x="14" y="34" width="24" height="17" rx="4" fill="#C8DAE8" />
        <rect x="19" y="37" width="14" height="11" rx="2" fill="#A8BED4" />
        {/* LED row */}
        {[23, 26, 29].map((cx, i) => (
          <circle key={cx} cx={cx} cy="42" r="1.5" fill={i === 1 ? eyeColor : '#22D3EE'}
            style={{ animation: antennaGlow, animationDelay: `${i * 0.22}s` }} />
        ))}
        <rect x="16" y="38" width="2" height="7" rx="1" fill="#93AABF" />
        <rect x="34" y="38" width="2" height="7" rx="1" fill="#93AABF" />

        {/* Left arm */}
        <g style={leftArmStyle}>
          <rect x="6" y="34" width="7" height="12" rx="3.5" fill="#B0C4D8" />
          <ellipse cx="9.5" cy="46.5" rx="3.5" ry="2.5" fill="#93AABF" />
        </g>

        {/* Right arm */}
        <g style={rightArmStyle}>
          <rect x="39" y="34" width="7" height="12" rx="3.5" fill="#B0C4D8" />
          <ellipse cx="42.5" cy="46.5" rx="3.5" ry="2.5" fill="#93AABF" />
          <circle cx="40"   cy="44.8" r="1.2" fill="#A8BED4" />
          <circle cx="42.5" cy="44.2" r="1.2" fill="#A8BED4" />
          <circle cx="45"   cy="44.8" r="1.2" fill="#A8BED4" />
        </g>

        {/* Legs + feet */}
        <rect x="18" y="50" width="6" height="4" rx="2" fill="#93AABF" />
        <rect x="28" y="50" width="6" height="4" rx="2" fill="#93AABF" />
        <ellipse cx="21" cy="54.5" rx="4.2" ry="1.8" fill="#7A9AB2" />
        <ellipse cx="31" cy="54.5" rx="4.2" ry="1.8" fill="#7A9AB2" />

        {/* Head */}
        <g style={headStyle}>

          {/* Ears */}
          {[{ x: 9, cx: 11.5, delay: '0.5s' }, { x: 38, cx: 40.5, delay: '1.1s' }].map(({ x, cx, delay }) => (
            <g key={x} style={{ animation: 'rt-ear-pulse 2.2s ease-in-out infinite', animationDelay: delay, transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
              <rect x={x} y="13" width="5" height="9" rx="2.5" fill="#B0C4D8" />
              <circle cx={cx} cy="17.5" r="2.2" fill={eyeColor} style={{ animation: 'rt-glow 2s ease-in-out infinite', opacity: 0.65, animationDelay: delay }} />
            </g>
          ))}

          {/* Head shell */}
          <rect x="13" y="7" width="26" height="22" rx="8" fill="#C8DAE8" />
          <rect x="16" y="10" width="20" height="16" rx="5" fill="#0E3A4A" />

          {/* Eyes */}
          {[{ cx: 21, delay: '0s' }, { cx: 31, delay: '0.18s' }].map(({ cx, delay }) => (
            <g key={cx} style={{
              animation: eyeAnim, animationDelay: delay,
              transform: `scaleY(${eyeScaleY})`,
              transformBox: 'fill-box', transformOrigin: '50% 50%',
              ...eyeScan,
            }}>
              <circle cx={cx} cy="18" r="4.5" fill="#0D2B38" />
              <circle cx={cx} cy="18" r="3.2" fill={eyeColor} style={{ animation: 'rt-glow 1.8s ease-in-out infinite', animationDelay: delay }} />
              <circle cx={cx} cy="18" r="1.7" fill={eyeInner} />
              <circle cx={cx + 1.2} cy="16.8" r="0.8" fill="white" opacity="0.85" />
            </g>
          ))}

          {/* Mouth */}
          <path d={smilePath} stroke={eyeColor} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8" />

          {/* Antenna */}
          <g style={antennaStyle}>
            <line x1="26" y1="7" x2="26" y2="2" stroke="#93AABF" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="26" cy="1.5" r="2" fill={eyeColor} style={{ animation: antennaGlow }} />
          </g>

          {/* Thinking bubbles */}
          {mode === 'thinking' && (
            <g>
              <circle cx="35" cy="6.5" r="1.2" fill="#93AABF" style={{ animation: 'rt-bubble 1.2s ease-in-out infinite' }} />
              <circle cx="38.5" cy="4"   r="1.6" fill="#93AABF" style={{ animation: 'rt-bubble 1.2s 0.25s ease-in-out infinite' }} />
              <circle cx="42" cy="1.5"   r="2.2" fill="#93AABF" style={{ animation: 'rt-bubble 1.2s 0.5s ease-in-out infinite' }} />
            </g>
          )}

          {/* Zzz */}
          {mode === 'sleepy' && (
            <g fill="#93AABF" style={{ animation: 'rt-bubble 2s ease-in-out infinite' }}>
              <text x="37" y="8"    fontSize="3.5" fontWeight="bold">z</text>
              <text x="39.5" y="5.5" fontSize="4.5" fontWeight="bold">z</text>
              <text x="42.5" y="3"  fontSize="5.5" fontWeight="bold">Z</text>
            </g>
          )}

          {/* Stars — surprised */}
          {mode === 'surprised' && (
            <g fill="#F59E0B" style={{ animation: 'rt-glow 0.45s ease-in-out infinite' }}>
              <text x="35.5" y="7.5" fontSize="5">✦</text>
              <text x="8.5"  y="7.5" fontSize="4">✦</text>
            </g>
          )}

          {/* Search scan line — searching */}
          {mode === 'searching' && (
            <rect x="17" y="17" width="18" height="2" rx="1" fill={eyeColor} opacity="0.25"
              style={{ animation: 'rt-eye-scan 1.1s ease-in-out infinite' }} />
          )}
        </g>
      </g>
    </svg>
  )
}
