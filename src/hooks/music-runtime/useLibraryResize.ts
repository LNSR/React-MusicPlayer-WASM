import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MAX_LIBRARY_WIDTH, MIN_LIBRARY_WIDTH } from '@/lib/music-player'
import { useMusicAppStore } from '@/stores/useMusicAppStore'

export function useLibraryResize() {
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const { isResizingLibrary, setIsResizingLibrary, setLibraryWidth } =
    useMusicAppStore(
      useShallow((state) => ({
        isResizingLibrary: state.isResizingLibrary,
        setIsResizingLibrary: state.setIsResizingLibrary,
        setLibraryWidth: state.setLibraryWidth,
      })),
    )

  useEffect(() => {
    if (!isResizingLibrary) {
      return undefined
    }

    const handlePointerMove = (event: PointerEvent) => {
      const layoutBounds = layoutRef.current?.getBoundingClientRect()
      const leftEdge = layoutBounds?.left ?? 0
      const maxWidth = Math.min(MAX_LIBRARY_WIDTH, window.innerWidth * 0.42)
      const nextWidth = Math.max(
        MIN_LIBRARY_WIDTH,
        Math.min(maxWidth, event.clientX - leftEdge),
      )

      setLibraryWidth(nextWidth)
    }

    const stopResizing = () => {
      setIsResizingLibrary(false)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing, { once: true })

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
    }
  }, [isResizingLibrary, setIsResizingLibrary, setLibraryWidth])

  return layoutRef
}
