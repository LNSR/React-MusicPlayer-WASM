import type { ReactNode } from 'react'
import {
  MusicRuntimeContext,
  type MusicRuntimeContextValue,
} from './MusicRuntimeContext'

export function MusicRuntimeProvider({
  children,
  value,
}: {
  children: ReactNode
  value: MusicRuntimeContextValue
}) {
  return <MusicRuntimeContext value={value}>{children}</MusicRuntimeContext>
}
