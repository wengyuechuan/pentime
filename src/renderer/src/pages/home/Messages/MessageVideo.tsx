import { loggerService } from '@renderer/services/LoggerService'
import type { VideoMessageBlock } from '@renderer/types/newMessage'
import { Button } from 'antd'
import { Download } from 'lucide-react'
import type { FC } from 'react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import ReactPlayer from 'react-player'
import styled from 'styled-components'

const logger = loggerService.withContext('MessageVideo')

interface Props {
  block: VideoMessageBlock
}

const toFileUrl = (path: string) => {
  if (path.startsWith('file://') || /^https?:\/\//i.test(path)) {
    return path
  }
  return `file://${path}`
}

const MessageVideo: FC<Props> = ({ block }) => {
  const playerRef = useRef<HTMLVideoElement | null>(null)
  const { t } = useTranslation()

  logger.debug(`MessageVideo: ${JSON.stringify(block)}`)

  if (!block.url && !block.filePath) {
    return null
  }

  const renderPlayer = (videoSrc: string) => {
    const handleReady = () => {
      const startTime = Math.floor(block.metadata?.startTime ?? 0)
      if (playerRef.current && startTime > 0) {
        playerRef.current.currentTime = startTime
      }
    }

    return (
      <PlayerWrap>
        <ReactPlayer
          ref={playerRef}
          style={{
            height: '100%',
            width: '100%'
          }}
          src={videoSrc}
          controls
          onReady={handleReady}
        />
        <ActionBar>
          <Button size="small" icon={<Download size={13} />} href={videoSrc} target="_blank" download>
            {t('common.download')}
          </Button>
        </ActionBar>
      </PlayerWrap>
    )
  }

  const renderLocalVideo = () => {
    const localPath = block.filePath || block.metadata?.video?.path

    if (!localPath) {
      logger.warn('Local video was requested but block.filePath is missing.')
      return <ErrorText>{t('message.video.error.local_file_missing')}</ErrorText>
    }

    return renderPlayer(toFileUrl(localPath))
  }

  const renderRemoteVideo = () => {
    if (!block.url) {
      logger.warn('Remote video was requested but block.url is missing.')
      return <ErrorText>{t('message.video.error.unsupported_type')}</ErrorText>
    }

    return renderPlayer(block.url)
  }

  const renderVideo = () => {
    if (block.url) {
      return renderRemoteVideo()
    }

    if (block.filePath || block.metadata?.video?.path) {
      return renderLocalVideo()
    }

    logger.warn(`Unsupported video type: ${block.metadata?.type} or missing necessary data.`)
    return <ErrorText>{t('message.video.error.unsupported_type')}</ErrorText>
  }

  return <Container>{renderVideo()}</Container>
}

export default MessageVideo

const Container = styled.div`
  max-width: 560px;
  width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  background-color: #000;
  border-radius: 8px;
  overflow: hidden;
`

const PlayerWrap = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
`

const ActionBar = styled.div`
  position: absolute;
  right: 8px;
  bottom: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;

  ${PlayerWrap}:hover & {
    opacity: 1;
  }
`

const ErrorText = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 12px;
  color: #fff;
  text-align: center;
`
