import { useState } from 'react'
import { openSongsFolder } from './libraryApi'

export const useOpenSongsFolder = () => {
  const [openFolderError, setOpenFolderError] = useState<string | null>(null)

  const openFolder = async () => {
    try {
      await openSongsFolder()
      setOpenFolderError(null)
    } catch (error) {
      setOpenFolderError(String(error))
    }
  }

  return { openFolder, openFolderError }
}
