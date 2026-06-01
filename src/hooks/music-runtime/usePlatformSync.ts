import { useEffect } from 'react'
import { getPlatformUI } from '@/lib/music-player'
import { useMusicAppStore } from '@/stores/useMusicAppStore'

export function usePlatformSync() {
  const setPlatformUI = useMusicAppStore((state) => state.setPlatformUI)

  useEffect(() => {
    const coarsePointer = window.matchMedia('(pointer: coarse)')
    const updatePlatformUI = () => {
      setPlatformUI(getPlatformUI())
    }

    updatePlatformUI()
    window.addEventListener('resize', updatePlatformUI, { passive: true })
    coarsePointer.addEventListener?.('change', updatePlatformUI)

    return () => {
      window.removeEventListener('resize', updatePlatformUI)
      coarsePointer.removeEventListener?.('change', updatePlatformUI)
    }
  }, [setPlatformUI])
}
