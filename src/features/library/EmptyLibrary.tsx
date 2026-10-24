import { FolderOpenIcon } from '@heroicons/react/16/solid'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Notice } from '../../components/Notice'
import { MUSICS_FOLDER_NAME } from './constants'
import { openMusicsFolder } from './libraryApi'

export const EmptyLibrary = () => {
  const [openFolderError, setOpenFolderError] = useState<string | null>(null)

  const openFolder = async () => {
    try {
      await openMusicsFolder()
      setOpenFolderError(null)
    } catch (error) {
      setOpenFolderError(String(error))
    }
  }

  return (
    <Notice
      title={`Your ${MUSICS_FOLDER_NAME} folder is empty`}
      description="Copy .mp3 files into it, then scan again."
      action={
        <>
          <Button onClick={openFolder}>
            <FolderOpenIcon className="size-4" />
            Open folder
          </Button>
          {openFolderError && (
            <p role="alert" className="mt-3 max-w-prose text-sm text-correction">
              {openFolderError}
            </p>
          )}
        </>
      }
    />
  )
}
