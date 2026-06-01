import { use } from 'react'
import { MusicRuntimeContext } from './MusicRuntimeContext'

export function useMusicRuntimeContext() {
  const context = use(MusicRuntimeContext)

  if (!context) {
    throw new Error('useMusicRuntimeContext must be used within MusicRuntimeProvider')
  }

  return context
}
