import React from 'react'

/**
 * Animated SVG robot displayed while the AI is generating a response.
 * Inspired by the flat robot constructor illustration style
 * (blue-grey body, cyan eyes, dark teal accents).
 */
export default function RobotThinking({ size = 52 }: { size?: number }) {
  const id = 'rt'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Réflexion en cours"
      style={{ flexShrink: 0, overflow: 'visible' }}
    >
      <style>{`
        @keyframes ${id}-bob {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-2.5px); }
        }
        @keyframes ${id}-wave {
          0%,100% { transform: rotate(0deg); }
          30%      { transform: rotate(28deg); }
          60%      { transform: rotate(-8deg); }
        }
        @keyframes ${id}-blink {
          0%,90%,100% { transform: scaleY(1); }
          95%          { transform: scaleY(0.08); }
        }
        @keyframes ${id}-glow {
          0%,100% { opacity: 0.7; }
          50%      { opacity: 1; }
        }
        @keyframes ${id}-antenna {
          0%,100% { transform: rotate(0deg); }
          25%      { transform: rotate(12deg); }
          75%      { transform: rotate(-12deg); }
        }
        @keyframes ${id}-ear-l {
          0%,100% { transform: scaleX(1); }
          50%      { transform: scaleX(1.15); }
        }
        @keyframes ${id}-ear-r {
          0%,100% { transform: scaleX(1); }
          50%      { transform: scaleX(1.15); }
        }

        .${id}-body   { animation: ${id}-bob  2.4s ease-in-out infinite; transform-origin: 26px 52px; }
        .${id}-wave   { animation: ${id}-wave 2.0s ease-in-out infinite; transform-origin: 44px 28px; }
        .${id}-eye    { animation: ${id}-blink 3.5s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
        .${id}-glow   { animation: ${id}-glow 1.8s ease-in-out infinite; }
        .${id}-ant    { animation: ${id}-antenna 2.6s ease-in-out infinite; transform-origin: 26px 7px; }
        .${id}-ear-l  { animation: ${id}-ear-l 2.4s ease-in-out 0.6s infinite; transform-origin: 12px 18px; }
        .${id}-ear-r  { animation: ${id}-ear-r 2.4s ease-in-out 0.6s infinite; transform-origin: 40px 18px; }
      `}</style>

      {/* ── Body group (bobs up/down) ─────────────────────────── */}
      <g className={`${id}-body`}>

        {/* Neck */}
        <rect x="23" y="28" width="6" height="4" rx="1" fill="#B0C4D8" />

        {/* Torso */}
        <rect x="14" y="32" width="24" height="16" rx="4" fill="#C8DAE8" />
        {/* Torso centre panel */}
        <rect x="19" y="35" width="14" height="10" rx="2" fill="#A8BED4" />
        {/* LED dot */}
        <circle cx="26" cy="40" r="2" fill="#22D3EE" className={`${id}-glow`} />
        {/* Side vents */}
        <rect x="16" y="37" width="2" height="6" rx="1" fill="#93AABF" />
        <rect x="34" y="37" width="2" height="6" rx="1" fill="#93AABF" />

        {/* Left arm (static) */}
        <rect x="6" y="32" width="7" height="12" rx="3.5" fill="#B0C4D8" />
        <circle cx="9.5" cy="44.5" r="3" fill="#93AABF" />

        {/* Right arm (waves) */}
        <g className={`${id}-wave`}>
          <rect x="39" y="32" width="7" height="12" rx="3.5" fill="#B0C4D8" />
          {/* Hand open */}
          <ellipse cx="42.5" cy="43" rx="3.5" ry="2.5" fill="#93AABF" />
          {/* Finger bumps */}
          <circle cx="40" cy="41.5" r="1.2" fill="#A8BED4" />
          <circle cx="42.5" cy="40.8" r="1.2" fill="#A8BED4" />
          <circle cx="45" cy="41.5" r="1.2" fill="#A8BED4" />
        </g>

        {/* Legs */}
        <rect x="18" y="47" width="6" height="4" rx="2" fill="#93AABF" />
        <rect x="28" y="47" width="6" height="4" rx="2" fill="#93AABF" />
        {/* Feet */}
        <ellipse cx="21" cy="51" rx="4" ry="1.8" fill="#7A9AB2" />
        <ellipse cx="31" cy="51" rx="4" ry="1.8" fill="#7A9AB2" />

        {/* ── Head ─────────────────────────────────────────────── */}
        {/* Left ear / sensor */}
        <g className={`${id}-ear-l`}>
          <rect x="9" y="13" width="5" height="9" rx="2.5" fill="#B0C4D8" />
          <circle cx="11.5" cy="17.5" r="2" fill="#22D3EE" opacity="0.6" className={`${id}-glow`} />
        </g>
        {/* Right ear / sensor */}
        <g className={`${id}-ear-r`}>
          <rect x="38" y="13" width="5" height="9" rx="2.5" fill="#B0C4D8" />
          <circle cx="40.5" cy="17.5" r="2" fill="#22D3EE" opacity="0.6" className={`${id}-glow`} />
        </g>

        {/* Head shell */}
        <rect x="13" y="7" width="26" height="22" rx="8" fill="#C8DAE8" />
        {/* Head front panel */}
        <rect x="16" y="10" width="20" height="16" rx="5" fill="#0E3A4A" />

        {/* Eyes */}
        <g className={`${id}-eye`}>
          <circle cx="21" cy="18" r="4.5" fill="#0D2B38" />
          <circle cx="21" cy="18" r="3.2" fill="#22D3EE" className={`${id}-glow`} />
          <circle cx="21" cy="18" r="1.6" fill="#67E8F9" />
          <circle cx="22.2" cy="16.8" r="0.8" fill="white" opacity="0.8" />
        </g>
        <g className={`${id}-eye`} style={{ animationDelay: '0.15s' }}>
          <circle cx="31" cy="18" r="4.5" fill="#0D2B38" />
          <circle cx="31" cy="18" r="3.2" fill="#22D3EE" className={`${id}-glow`} />
          <circle cx="31" cy="18" r="1.6" fill="#67E8F9" />
          <circle cx="32.2" cy="16.8" r="0.8" fill="white" opacity="0.8" />
        </g>

        {/* Smile */}
        <path d="M22 23 Q26 26 30 23" stroke="#22D3EE" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.7" />

        {/* Antenna */}
        <g className={`${id}-ant`}>
          <line x1="26" y1="7" x2="26" y2="2" stroke="#93AABF" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="26" cy="1.5" r="1.8" fill="#22D3EE" className={`${id}-glow`} />
        </g>

      </g>
    </svg>
  )
}
