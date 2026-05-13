import React from 'react'
import RobotThinking from './RobotThinking'
import CatThinking from './CatThinking'
import DogThinking from './DogThinking'

export type MascotType = 'robot' | 'cat' | 'dog'

export default function MascotThinking({
  size = 52,
  mascot = 'robot',
  color = '#22D3EE',
}: {
  size?: number
  mascot?: MascotType
  color?: string
}) {
  if (mascot === 'cat') return <CatThinking size={size} color={color} />
  if (mascot === 'dog') return <DogThinking size={size} color={color} />
  return <RobotThinking size={size} color={color} />
}
