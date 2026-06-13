import {
  CopyOutlined,
  DownloadOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  SwapOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined
} from '@ant-design/icons'
import { loggerService } from '@logger'
import type { FileMetadata } from '@renderer/types'
import { getFileStorageName } from '@renderer/utils'
import { convertImageToPng } from '@renderer/utils/image'
import { parseDataUrl } from '@shared/utils'
import type { ImageProps as AntImageProps } from 'antd'
import { Dropdown, Image as AntImage, Space } from 'antd'
import { Base64 } from 'js-base64'
import { DownloadIcon } from 'lucide-react'
import mime from 'mime'
import React from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { CopyIcon } from './Icons'

interface ImageViewerProps extends AntImageProps {
  src: string
}

const logger = loggerService.withContext('ImageViewer')

type ResolvedImageSource = {
  blob: Blob
  filename?: string
}

const IMAGE_MIME_FALLBACK = 'image/png'

const sanitizeFilename = (filename?: string) => filename?.replace(/[\\/:*?"<>|]+/g, '_')

const normalizeImageMimeType = (mimeType?: string | null, fallbackName?: string) => {
  const normalized = mimeType?.split(';')[0]?.trim().toLowerCase()

  if (normalized?.startsWith('image/')) return normalized

  if (normalized?.startsWith('application/')) {
    const subtype = normalized.slice('application/'.length)
    if (['png', 'jpeg', 'jpg', 'webp', 'gif', 'bmp'].includes(subtype)) {
      return subtype === 'jpg' ? 'image/jpeg' : `image/${subtype}`
    }
    if (subtype === 'svg+xml') return 'image/svg+xml'
  }

  const inferredMimeType = fallbackName ? mime.getType(fallbackName) : undefined
  return inferredMimeType?.startsWith('image/') ? inferredMimeType : IMAGE_MIME_FALLBACK
}

const getImageExtension = (mimeType?: string) => {
  if (!mimeType) return 'png'
  if (mimeType === 'image/jpeg') return 'jpg'
  return mime.getExtension(mimeType) || 'png'
}

const getFilenameFromUrl = (src: string) => {
  try {
    const url = new URL(src)
    const filename = decodeURIComponent(url.pathname.split('/').pop() || '')
    return sanitizeFilename(filename)
  } catch {
    const filename = src.split('/').pop()?.split('?')[0]
    return sanitizeFilename(filename)
  }
}

const createDownloadFilename = (src: string, blob: Blob, filename?: string) => {
  const resolvedFilename = sanitizeFilename(filename) || getFilenameFromUrl(src)
  if (resolvedFilename?.includes('.')) return resolvedFilename
  return `${Date.now()}_image.${getImageExtension(blob.type)}`
}

const readDownloadedImage = async (file: FileMetadata): Promise<ResolvedImageSource> => {
  const base64File = await window.api.file.base64File(getFileStorageName(file))
  const mimeType = normalizeImageMimeType(base64File.mime, file.origin_name || file.name || file.path)
  const bytes = Base64.toUint8Array(base64File.data)

  return {
    blob: new Blob([bytes.slice()], { type: mimeType }),
    filename: sanitizeFilename(file.origin_name || file.name)
  }
}

const resolveImageSource = async (src: string): Promise<ResolvedImageSource> => {
  if (src.startsWith('data:')) {
    const parseResult = parseDataUrl(src)
    if (!parseResult || !parseResult.mediaType || !parseResult.isBase64) {
      throw new Error('Invalid base64 image format')
    }

    const byteArray = Base64.toUint8Array(parseResult.data)
    return { blob: new Blob([byteArray.slice()], { type: normalizeImageMimeType(parseResult.mediaType) }) }
  }

  if (src.startsWith('file://')) {
    const bytes = await window.api.fs.read(src)
    const mimeType = normalizeImageMimeType(mime.getType(src), src)
    return { blob: new Blob([bytes], { type: mimeType }), filename: getFilenameFromUrl(src) }
  }

  if (src.startsWith('blob:')) {
    const response = await fetch(src)
    const blob = await response.blob()
    return { blob: new Blob([blob], { type: normalizeImageMimeType(blob.type) }) }
  }

  try {
    const file = await window.api.file.download(src)
    return await readDownloadedImage(file)
  } catch (downloadError) {
    logger.warn('Failed to download image through main process, falling back to renderer fetch', downloadError as Error)
    const response = await fetch(src)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const blob = await response.blob()
    return {
      blob: new Blob([blob], { type: normalizeImageMimeType(blob.type, src) }),
      filename: getFilenameFromUrl(src)
    }
  }
}

const downloadImageSource = async (src: string) => {
  const { blob, filename } = await resolveImageSource(src)
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = createDownloadFilename(src, blob, filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
}

const ImageViewer: React.FC<ImageViewerProps> = ({ src, style, ...props }) => {
  const { t } = useTranslation()

  // 复制图片到剪贴板
  const handleCopyImage = async (src: string) => {
    try {
      const { blob } = await resolveImageSource(src)

      // 统一转换为 PNG 以确保兼容性（剪贴板 API 不支持 JPEG）
      const pngBlob = await convertImageToPng(blob)

      const item = new ClipboardItem({
        'image/png': pngBlob
      })
      await navigator.clipboard.write([item])

      window.toast.success(t('message.copy.success'))
    } catch (error) {
      const err = error as Error
      logger.error(`Failed to copy image: ${err.message}`, { stack: err.stack })
      window.toast.error(t('message.copy.failed'))
    }
  }

  const handleDownloadImage = async (src: string) => {
    try {
      await downloadImageSource(src)
      window.toast.success(t('message.download.success'))
    } catch (error) {
      const err = error as Error
      logger.error(`Failed to download image: ${err.message}`, { stack: err.stack })
      window.toast.error(t('message.download.failed'))
    }
  }

  const getContextMenuItems = (src: string, size: number = 14) => {
    return [
      {
        key: 'copy-image',
        label: t('common.copy'),
        icon: <CopyIcon size={size} />,
        onClick: () => handleCopyImage(src)
      },
      {
        key: 'copy-url',
        label: t('preview.copy.src'),
        icon: <CopyIcon size={size} />,
        onClick: () => {
          void navigator.clipboard.writeText(src)
          window.toast.success(t('message.copy.success'))
        }
      },
      {
        key: 'download',
        label: t('common.download'),
        icon: <DownloadIcon size={size} />,
        onClick: () => void handleDownloadImage(src)
      }
    ]
  }

  return (
    <Dropdown menu={{ items: getContextMenuItems(src) }} trigger={['contextMenu']}>
      <AntImage
        src={src}
        style={style}
        onContextMenu={(e) => e.stopPropagation()}
        {...props}
        preview={{
          mask: typeof props.preview === 'object' ? props.preview.mask : false,
          ...(typeof props.preview === 'object' ? props.preview : {}),
          toolbarRender: (
            _,
            {
              transform: { scale },
              actions: { onFlipY, onFlipX, onRotateLeft, onRotateRight, onZoomOut, onZoomIn, onReset }
            }
          ) => (
            <ToolbarWrapper size={12} className="toolbar-wrapper">
              <SwapOutlined rotate={90} onClick={onFlipY} />
              <SwapOutlined onClick={onFlipX} />
              <RotateLeftOutlined onClick={onRotateLeft} />
              <RotateRightOutlined onClick={onRotateRight} />
              <ZoomOutOutlined disabled={scale === 1} onClick={onZoomOut} />
              <ZoomInOutlined disabled={scale === 50} onClick={onZoomIn} />
              <UndoOutlined onClick={onReset} />
              <CopyOutlined onClick={() => handleCopyImage(src)} />
              <DownloadOutlined onClick={() => void handleDownloadImage(src)} />
            </ToolbarWrapper>
          )
        }}
      />
    </Dropdown>
  )
}

const ToolbarWrapper = styled(Space)`
  padding: 0px 24px;
  color: #fff;
  font-size: 20px;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 100px;
  .anticon {
    padding: 12px;
    cursor: pointer;
  }
  .anticon:hover {
    opacity: 0.3;
  }
`

export default ImageViewer
