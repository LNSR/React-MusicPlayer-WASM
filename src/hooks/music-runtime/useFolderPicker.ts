import { toast } from 'sonner'
import { useMusicAppStore } from '@/stores/useMusicAppStore'
import { useShallow } from 'zustand/react/shallow'
import type { PostToMetadataWorker } from '@/types/audio'

interface UseFolderPickerOptions
{
  isSupported: boolean
  postToMetadataWorker: PostToMetadataWorker
  revokeAllCoverUrls: () => void
}

export function useFolderPicker({
  isSupported,
  postToMetadataWorker,
  revokeAllCoverUrls,
}: UseFolderPickerOptions)
{
  const { resetLibrary, updatePlayer } = useMusicAppStore(useShallow((state) => ({
    resetLibrary: state.resetLibrary,
    updatePlayer: state.updatePlayer,
  })))

  return async function pickFolder()
  {
    if (!isSupported)
    {
      toast.error('This browser is missing required secure audio features.')
      return
    }

    try
    {
      const directoryHandle = await window.showDirectoryPicker({
        id: 'music-library',
        mode: 'read',
        startIn: 'music',
      })
      const permission = await directoryHandle.requestPermission({ mode: 'read' })

      if (permission !== 'granted')
      {
        toast.error('Folder permission was not granted.')
        return
      }

      revokeAllCoverUrls()
      resetLibrary(directoryHandle.name)
      updatePlayer((state) => ({ ...state, status: 'paused' }))
      postToMetadataWorker({ type: 'scanDirectory', directoryHandle })
    } catch (error)
    {
      if (error instanceof DOMException && error.name === 'AbortError')
      {
        return
      }
      toast.error(
        error instanceof Error ? error.message : 'Unable to open this folder',
      )
    }
  }
}
