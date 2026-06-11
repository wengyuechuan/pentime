import { loggerService } from '@logger'
import { AiProvider } from '@renderer/aiCore'
import { Navbar, NavbarCenter } from '@renderer/components/app/Navbar'
import { ActionIconButton } from '@renderer/components/Buttons'
import Scrollbar from '@renderer/components/Scrollbar'
import TranslateButton from '@renderer/components/TranslateButton'
import { getProviderLogo, PROVIDER_URLS } from '@renderer/config/providers'
import { LanguagesEnum } from '@renderer/config/translate'
import { useAllProviders } from '@renderer/hooks/useProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import ProviderSelect from '@renderer/pages/paintings/components/ProviderSelect'
import { checkProviderEnabled } from '@renderer/pages/paintings/utils'
import { translateText } from '@renderer/services/TranslateService'
import type { FileMetadata, Model, Provider } from '@renderer/types'
import { getErrorMessage, uuid } from '@renderer/utils'
import { isSendMessageKeyPressed } from '@renderer/utils/input'
import { isNewApiProvider } from '@renderer/utils/provider'
import { Avatar, Button, Empty, Progress, Select, Space, Switch, Tag, Tooltip, Upload } from 'antd'
import TextArea from 'antd/es/input/TextArea'
import type { RcFile } from 'antd/es/upload'
import type { UploadFile } from 'antd/es/upload/interface'
import { Download, ExternalLink, MessageSquareDiff, RefreshCw, Trash2, Upload as UploadIcon } from 'lucide-react'
import type { FC, KeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import SendMessageButton from '../home/Inputbar/SendMessageButton'
import { SettingHelpLink, SettingTitle } from '../settings'

const logger = loggerService.withContext('VideoPage')

type FrameImage = {
  name: string
  dataUrl: string
}

type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed'

const VIDEO_STATUS_LABEL_KEYS: Record<VideoStatus, string> = {
  completed: 'video.status.completed',
  failed: 'video.status.failed',
  pending: 'video.status.pending',
  processing: 'video.status.processing'
}

type GeneratedVideo = {
  id: string
  providerId: string
  model: string
  prompt: string
  status: VideoStatus
  createdAt: number
  taskId?: string
  url?: string
  blobUrl?: string
  localFile?: FileMetadata
  error?: string
  playbackError?: string
  progress?: number
  progressText?: string
}

type VideoFormState = {
  model: string
  prompt: string
  aspectRatio: string
  resolution: string
  enhancePrompt: boolean
  firstFrame?: FrameImage
  lastFrame?: FrameImage
}

type VideoTaskResult = {
  taskId?: string
  url?: string
  blobUrl?: string
  localFile?: FileMetadata
  progress?: number
  status?: string
  message?: string
  raw?: unknown
}

type VideoPreviewResult = {
  blobUrl?: string
  localFile?: FileMetadata
}

type VideoEndpoints = {
  create: string
  status: string
  content: string
}

const DEFAULT_VIDEO_MODELS = [
  'gemini-veo-3.1-generate-preview-4s',
  'gemini-veo-3.1-generate-preview-6s',
  'gemini-veo-3.1-generate-preview-8s'
]

const ASPECT_RATIO_OPTIONS = ['16:9', '9:16']
const RESOLUTION_OPTIONS = ['720p', '1080p']
const VIDEO_SIZE_BY_RATIO: Record<string, Record<string, string>> = {
  '16:9': {
    '720p': '1280x720',
    '1080p': '1920x1080'
  },
  '9:16': {
    '720p': '720x1280',
    '1080p': '1080x1920'
  }
}
const MAX_POLL_COUNT = 120
const POLL_INTERVAL_MS = 3000

const DEFAULT_FORM: VideoFormState = {
  model: '',
  prompt: '',
  aspectRatio: '16:9',
  resolution: '720p',
  enhancePrompt: true
}

type VideoPageState = {
  videos: GeneratedVideo[]
  selectedVideoId?: string
  activeVideoId?: string
  activeController?: AbortController
}

let videoPageState: VideoPageState = {
  videos: []
}

const videoPageListeners = new Set<() => void>()

const notifyVideoPageListeners = () => {
  videoPageListeners.forEach((listener) => listener())
}

const subscribeVideoPageState = (listener: () => void) => {
  videoPageListeners.add(listener)
  return () => {
    videoPageListeners.delete(listener)
  }
}

const setVideoPageVideos = (updater: GeneratedVideo[] | ((prev: GeneratedVideo[]) => GeneratedVideo[])) => {
  const nextVideos = typeof updater === 'function' ? updater(videoPageState.videos) : updater
  videoPageState = { ...videoPageState, videos: nextVideos }
  notifyVideoPageListeners()
}

const updateVideoPageVideo = (id: string, updates: Partial<GeneratedVideo>) => {
  setVideoPageVideos((prev) => prev.map((video) => (video.id === id ? { ...video, ...updates } : video)))
}

const setVideoPageSelectedVideoId = (selectedVideoId?: string) => {
  videoPageState = { ...videoPageState, selectedVideoId }
  notifyVideoPageListeners()
}

const setActiveVideoTask = (activeVideoId: string, activeController: AbortController) => {
  videoPageState = { ...videoPageState, activeVideoId, activeController }
  notifyVideoPageListeners()
}

const clearActiveVideoTask = (videoId: string) => {
  if (videoPageState.activeVideoId !== videoId) return
  videoPageState = { ...videoPageState, activeVideoId: undefined, activeController: undefined }
  notifyVideoPageListeners()
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms)

    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })

const normalizeProviderApiHost = (provider: Provider) => {
  const host = provider.apiHost.replace(/\/+$/, '')
  if (host.endsWith('/openai/v1')) {
    return host.slice(0, -'/openai/v1'.length)
  }
  return host.replace(/\/v1$/, '')
}

const getVideoEndpoints = (provider: Provider): VideoEndpoints => {
  const base = normalizeProviderApiHost(provider)
  const prefix = provider.id === 'aionly' ? '/openai/v1' : '/v1'

  return {
    create: `${base}${prefix}/videos`,
    status: `${base}${prefix}/video/generations`,
    content: `${base}${prefix}/videos`
  }
}

const readResponseError = async (response: Response) => {
  try {
    const data = await response.json()
    return data?.error?.message || data?.message || data?.msg || `${response.status} ${response.statusText}`
  } catch {
    return `${response.status} ${response.statusText}`
  }
}

const fetchJson = async (url: string, init: RequestInit) => {
  const response = await fetch(url, init)

  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }

  return response.json()
}

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

const isLikelyVideoUrl = (value?: string) => {
  if (!value) return false
  return /^(https?:|blob:|data:video\/)/i.test(value)
}

const extractVideoUrlFromText = (value?: string) => {
  if (!value) return undefined
  return value.match(/https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/i)?.[0]
}

const getVideoMimeType = (value?: string, fallback = 'video/mp4') => {
  const normalizedValue = value?.toLowerCase().split('?')[0] ?? ''

  if (normalizedValue.endsWith('.webm')) return 'video/webm'
  if (normalizedValue.endsWith('.mov')) return 'video/quicktime'
  if (normalizedValue.endsWith('.m4v')) return 'video/x-m4v'
  if (normalizedValue.endsWith('.mp4')) return 'video/mp4'
  if (fallback === 'application/mp4') return 'video/mp4'
  if (fallback.startsWith('video/')) return fallback

  return 'video/mp4'
}

const pickVideoUrl = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (isLikelyVideoUrl(trimmed)) {
        return trimmed
      }
      const embeddedUrl = extractVideoUrlFromText(trimmed)
      if (embeddedUrl) {
        return embeddedUrl
      }
    }
  }
  return undefined
}

const getVideoSize = (aspectRatio: string, resolution: string) => {
  return VIDEO_SIZE_BY_RATIO[aspectRatio]?.[resolution] ?? VIDEO_SIZE_BY_RATIO['16:9']['720p']
}

const extractTaskId = (data: any): string | undefined => {
  return pickString(
    data?.task_id,
    data?.taskId,
    data?.id,
    data?.data?.task_id,
    data?.data?.taskId,
    data?.data?.id,
    data?.data?.[0]?.task_id,
    data?.data?.[0]?.id
  )
}

const extractVideoUrl = (data: any): string | undefined => {
  const output = Array.isArray(data?.output) ? data.output[0] : data?.output
  const content = Array.isArray(data?.content) ? data.content[0] : data?.content
  const dataItem = Array.isArray(data?.data) ? data.data[0] : data?.data
  const nestedDataItem = Array.isArray(dataItem?.data) ? dataItem.data[0] : dataItem?.data
  const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined
  const serializedData = typeof data === 'string' ? data : JSON.stringify(data)

  return pickVideoUrl(
    data?.url,
    data?.video_url,
    data?.videoUrl,
    data?.download_url,
    data?.downloadUrl,
    data?.result_url,
    data?.result?.url,
    data?.result?.video_url,
    data?.result?.videoUrl,
    data?.result?.download_url,
    data?.result?.downloadUrl,
    data?.result?.result_url,
    dataItem?.url,
    dataItem?.video_url,
    dataItem?.videoUrl,
    dataItem?.download_url,
    dataItem?.downloadUrl,
    dataItem?.result_url,
    dataItem?.content,
    nestedDataItem?.url,
    nestedDataItem?.video_url,
    nestedDataItem?.videoUrl,
    nestedDataItem?.download_url,
    nestedDataItem?.downloadUrl,
    nestedDataItem?.result_url,
    nestedDataItem?.metadata?.url,
    nestedDataItem?.metadata?.video_url,
    nestedDataItem?.metadata?.download_url,
    output?.url,
    output?.video_url,
    output?.videoUrl,
    typeof output === 'string' ? output : undefined,
    content?.url,
    typeof content === 'string' ? content : undefined,
    choice?.message?.content,
    choice?.delta?.content,
    choice?.text,
    data?.output_text,
    serializedData
  )
}

const extractStatus = (data: any): string | undefined => {
  return pickString(
    data?.status,
    data?.state,
    data?.data?.status,
    data?.data?.state,
    data?.data?.data?.status,
    data?.data?.data?.state,
    data?.result?.status
  )
}

const extractProgress = (data: any): number | undefined => {
  const value = data?.progress ?? data?.data?.progress ?? data?.data?.data?.progress ?? data?.result?.progress
  if (typeof value === 'number') {
    return value > 1 ? Math.min(value, 100) : Math.round(value * 100)
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace('%', ''))
    return Number.isFinite(parsed) ? Math.min(parsed, 100) : undefined
  }
  return undefined
}

const isCompletedStatus = (status?: string) => {
  if (!status) return false
  return ['completed', 'complete', 'succeeded', 'success', 'done', 'finished'].includes(status.toLowerCase())
}

const isFailedStatus = (status?: string) => {
  if (!status) return false
  return ['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status.toLowerCase())
}

const isErrorEnvelope = (data: any) => {
  return !!data?.error && !extractStatus(data) && !extractVideoUrl(data)
}

const extractMessage = (data: any) => {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined

  return pickString(
    data?.data?.data?.error?.message,
    data?.data?.error?.message,
    data?.result?.error?.message,
    data?.error?.message,
    data?.data?.data?.message,
    data?.data?.message,
    data?.result?.message,
    data?.message,
    data?.data?.data?.fail_reason,
    data?.data?.fail_reason,
    data?.result?.fail_reason,
    data?.fail_reason,
    data?.msg,
    data?.data?.msg,
    choice?.message?.content,
    choice?.text,
    !isLikelyVideoUrl(data?.data?.result_url) ? data?.data?.result_url : undefined,
    !isLikelyVideoUrl(data?.result_url) ? data?.result_url : undefined
  )
}

const readFrameImage = (file: File) => {
  return new Promise<FrameImage>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve({ name: file.name, dataUrl: reader.result })
        return
      }
      reject(new Error('Invalid image data'))
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

const frameUploadList = (frame?: FrameImage): UploadFile[] => {
  if (!frame) return []
  return [{ uid: frame.name, name: frame.name, status: 'done' }]
}

const isVideoModel = (model: Model) => {
  const endpointTypes = model.supported_endpoint_types?.map((type) => String(type)) ?? []
  const endpointType = String(model.endpoint_type ?? '')
  const value = `${model.id} ${model.name} ${model.group} ${model.description ?? ''}`.toLowerCase()

  return (
    endpointType === 'video-generation' ||
    endpointTypes.includes('video-generation') ||
    endpointTypes.includes('videos') ||
    /\bveo\b|veo-|gemini.*video|video/.test(value)
  )
}

const createAbortError = () => new DOMException('Aborted', 'AbortError')

const createVideoBlobUrl = (base64: string, mime: string) => {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

const createVideoObjectUrl = (blob: Blob, fallbackName?: string) => {
  const mime = getVideoMimeType(fallbackName, blob.type)
  const playableBlob = blob.type === mime ? blob : blob.slice(0, blob.size, mime)
  return URL.createObjectURL(playableBlob)
}

const revokeVideoBlobUrl = (url?: string) => {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

const getLocalVideoUrl = (file?: FileMetadata) => {
  if (!file?.path) return undefined
  const normalizedPath = file.path.replace(/\\/g, '/')
  const prefix = normalizedPath.startsWith('/') ? 'file://' : 'file:///'
  const encodedPath = normalizedPath
    .split('/')
    .map((segment) => (/^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join('/')

  return `${prefix}${encodedPath}`
}

const getVideoPlaybackErrorText = (code?: number, src?: string) => {
  const sourceText = src?.startsWith('file:')
    ? '本地缓存文件'
    : src?.startsWith('blob:')
      ? '本地缓存数据'
      : '远程视频地址'

  switch (code) {
    case 1:
      return `${sourceText}播放被中止`
    case 2:
      return `${sourceText}加载失败`
    case 3:
      return `${sourceText}解码失败`
    case 4:
      return `${sourceText}不支持播放`
    default:
      return `${sourceText}暂时无法播放`
  }
}

const VideoPage: FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const providers = useAllProviders()
  const { autoTranslateWithSpace, sendMessageShortcut } = useSettings()
  const textareaRef = useRef<any>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const spaceClickTimer = useRef<number | null>(null)

  const newApiProviders = useMemo(() => providers.filter((p) => isNewApiProvider(p)), [providers])
  const routeName = location.pathname.split('/').pop() || newApiProviders[0]?.id || 'new-api'
  const currentProvider = newApiProviders.find((p) => p.id === routeName) || newApiProviders[0]

  const providerOptions = useMemo(() => newApiProviders.map((provider) => provider.id), [newApiProviders])

  const [form, setForm] = useState<VideoFormState>(DEFAULT_FORM)
  const { videos, selectedVideoId, activeVideoId, activeController } = useSyncExternalStore(
    subscribeVideoPageState,
    () => videoPageState,
    () => videoPageState
  )
  const isLoading = !!activeVideoId
  const [isPreparingPreview, setIsPreparingPreview] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [spaceClickCount, setSpaceClickCount] = useState(0)

  const modelOptions = useMemo(() => {
    if (!currentProvider) return []

    const providerModels = currentProvider.models.filter(isVideoModel).map((model) => ({
      label: model.name || model.id,
      value: model.id,
      group: model.group || currentProvider.name
    }))

    const fallbackModels = DEFAULT_VIDEO_MODELS.map((model) => ({
      label: model,
      value: model,
      group: 'Gemini / Veo'
    }))

    const seen = new Set<string>()
    return [...providerModels, ...fallbackModels].filter((item) => {
      if (seen.has(item.value)) return false
      seen.add(item.value)
      return true
    })
  }, [currentProvider])

  const groupedModelOptions = useMemo(() => {
    return modelOptions.reduce<Record<string, typeof modelOptions>>((acc, option) => {
      acc[option.group] ??= []
      acc[option.group].push(option)
      return acc
    }, {})
  }, [modelOptions])

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedVideoId) || videos[0],
    [selectedVideoId, videos]
  )
  const isSelectedVideoLoading = !!selectedVideo && selectedVideo.id === activeVideoId
  const selectedVideoProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedVideo?.providerId),
    [providers, selectedVideo?.providerId]
  )

  const getVideoRequestHeaders = useCallback((provider?: Provider): Record<string, string> | undefined => {
    if (!provider) return undefined

    const apiKey = new AiProvider(provider).getApiKey()
    if (!apiKey) return undefined

    return {
      Authorization: `Bearer ${apiKey}`,
      'X-Api-Key': apiKey,
      ...provider.extra_headers
    }
  }, [])

  useEffect(() => {
    if (modelOptions.length === 0) return

    if (!form.model || !modelOptions.some((option) => option.value === form.model)) {
      setForm((prev) => ({ ...prev, model: modelOptions[0].value }))
    }
  }, [form.model, modelOptions])

  useEffect(() => {
    const timer = spaceClickTimer.current
    return () => {
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  const updateVideo = useCallback((id: string, updates: Partial<GeneratedVideo>) => {
    updateVideoPageVideo(id, updates)
  }, [])

  const buildRequestBody = (state: VideoFormState) => {
    const size = getVideoSize(state.aspectRatio, state.resolution)
    const body: Record<string, unknown> = {
      model: state.model,
      prompt: state.prompt,
      size
    }

    if (state.firstFrame) {
      body.image = state.firstFrame.dataUrl
      body.first_frame_image = state.firstFrame.dataUrl
    }

    if (state.lastFrame) {
      body.last_frame_image = state.lastFrame.dataUrl
    }

    return body
  }

  const prepareVideoPreview = useCallback(
    async (
      url: string,
      signal: AbortSignal,
      headers?: Record<string, string>
    ): Promise<VideoPreviewResult | undefined> => {
      if (!url.startsWith('http')) {
        return undefined
      }

      if (signal.aborted) {
        throw createAbortError()
      }

      if (headers) {
        const response = await fetch(url, { headers, signal })
        if (!response.ok) {
          throw new Error(await readResponseError(response))
        }

        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('video/') || contentType.includes('octet-stream')) {
          const blob = await response.blob()
          return { blobUrl: createVideoObjectUrl(blob, url) }
        }

        const data = await response.json()
        const nestedUrl = extractVideoUrl(data)
        if (nestedUrl && nestedUrl !== url) {
          return prepareVideoPreview(nestedUrl, signal, headers)
        }
      }

      const file = await window.api.file.download(url, true)

      if (signal.aborted) {
        throw createAbortError()
      }

      let blobUrl: string | undefined

      try {
        const base64File = await window.api.file.base64File(`${file.id}${file.ext}`)

        if (signal.aborted) {
          throw createAbortError()
        }

        const mime = getVideoMimeType(file.ext || url, base64File.mime)
        blobUrl = createVideoBlobUrl(base64File.data, mime)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error
        }
        logger.warn('Failed to create blob video preview, local file preview will be used', error as Error)
      }

      return { blobUrl, localFile: file }
    },
    []
  )

  useEffect(() => {
    if (
      !selectedVideo?.url ||
      selectedVideo.localFile ||
      selectedVideo.blobUrl ||
      selectedVideo.status !== 'completed'
    ) {
      return
    }

    const controller = new AbortController()

    void prepareVideoPreview(selectedVideo.url, controller.signal, getVideoRequestHeaders(selectedVideoProvider))
      .then((preview) => {
        if (preview) {
          updateVideo(selectedVideo.id, {
            blobUrl: preview.blobUrl || selectedVideo.blobUrl,
            localFile: preview.localFile,
            playbackError: undefined
          })
        }
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return
        logger.warn('Failed to prepare selected video preview', error as Error)
      })

    return () => controller.abort()
  }, [
    getVideoRequestHeaders,
    prepareVideoPreview,
    selectedVideo?.blobUrl,
    selectedVideo?.id,
    selectedVideo?.localFile,
    selectedVideoProvider,
    selectedVideo?.status,
    selectedVideo?.url,
    updateVideo
  ])

  const fetchVideoContent = async (
    endpoints: VideoEndpoints,
    taskId: string,
    headers: Record<string, string>,
    signal: AbortSignal
  ): Promise<VideoTaskResult> => {
    const contentEndpoints = [`${endpoints.content}/${taskId}/content`, `${endpoints.content}/${taskId}/download`]
    let lastError: unknown

    for (const endpoint of contentEndpoints) {
      try {
        const response = await fetch(endpoint, { headers, signal })
        if (!response.ok) {
          lastError = new Error(await readResponseError(response))
          continue
        }

        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('video/') || contentType.includes('octet-stream')) {
          const blob = await response.blob()
          return { blobUrl: createVideoObjectUrl(blob, endpoint) }
        }

        const data = await response.json()
        return { url: extractVideoUrl(data), raw: data }
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error ? lastError : new Error(t('video.error.fetch_content_failed'))
  }

  const pollVideoTask = async (
    videoId: string,
    taskId: string,
    endpoints: VideoEndpoints,
    headers: Record<string, string>,
    signal: AbortSignal
  ): Promise<VideoTaskResult> => {
    for (let index = 0; index < MAX_POLL_COUNT; index += 1) {
      await wait(POLL_INTERVAL_MS, signal)

      let lastPollError: unknown

      try {
        const data = await fetchJson(`${endpoints.status}/${taskId}`, { headers, signal })
        const status = extractStatus(data)
        const progress = extractProgress(data)
        const url = extractVideoUrl(data)
        const message = extractMessage(data)

        if (isErrorEnvelope(data)) {
          lastPollError = new Error(message || t('video.error.task_failed'))
        } else {
          updateVideo(videoId, {
            status: isCompletedStatus(status) ? 'completed' : 'processing',
            ...(progress !== undefined ? { progress } : {}),
            progressText: message || status || t('video.status.processing')
          })

          if (url) {
            return { taskId, url, progress, status, raw: data }
          }

          if (isCompletedStatus(status)) {
            const content = await fetchVideoContent(endpoints, taskId, headers, signal)
            return { taskId, ...content, progress, status, raw: data }
          }

          if (isFailedStatus(status)) {
            throw new Error(message || t('video.error.task_failed'))
          }
        }
      } catch (error) {
        lastPollError = error
      }

      if (lastPollError instanceof Error) {
        logger.debug('Video task polling attempt failed', { taskId, error: lastPollError.message })
      }
    }

    throw new Error(t('video.error.timeout'))
  }

  const createVideoTask = async (
    provider: Provider,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    signal: AbortSignal
  ) => {
    const endpoints = getVideoEndpoints(provider)
    const data = await fetchJson(endpoints.create, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    })

    return {
      endpoint: endpoints.create,
      endpoints,
      taskId: extractTaskId(data),
      url: extractVideoUrl(data),
      progress: extractProgress(data),
      status: extractStatus(data),
      message: extractMessage(data),
      raw: data
    }
  }

  const onGenerate = async () => {
    if (!currentProvider) return

    const prompt = textareaRef.current?.resizableTextArea?.textArea?.value || form.prompt
    if (!form.model || !prompt.trim()) return

    try {
      await checkProviderEnabled(currentProvider, t)
    } catch {
      return
    }

    const aiProvider = new AiProvider(currentProvider)
    const apiKey = aiProvider.getApiKey()
    if (!apiKey) {
      window.modal.error({ content: t('error.no_api_key'), centered: true })
      return
    }

    const controller = new AbortController()
    const videoId = uuid()
    const newVideo: GeneratedVideo = {
      id: videoId,
      providerId: currentProvider.id,
      model: form.model,
      prompt,
      status: 'pending',
      progress: 0,
      progressText: t('video.status.submitting'),
      createdAt: Date.now()
    }

    setActiveVideoTask(videoId, controller)
    setVideoPageVideos((prev) => [newVideo, ...prev])
    setVideoPageSelectedVideoId(videoId)
    setForm((prev) => ({ ...prev, prompt }))

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'X-Api-Key': apiKey,
      ...currentProvider.extra_headers
    }

    try {
      const requestBody = buildRequestBody({ ...form, prompt })

      updateVideo(videoId, {
        status: 'processing',
        progressText: t('video.status.submitting')
      })

      const task = await createVideoTask(currentProvider, headers, requestBody, controller.signal)

      if (!task) {
        throw new Error(t('video.error.create_failed'))
      }

      updateVideo(videoId, {
        taskId: task.taskId,
        url: task.url,
        status: task.url ? 'completed' : 'processing',
        ...(task.progress !== undefined ? { progress: task.progress } : task.url ? { progress: 100 } : {}),
        progressText:
          task.message || task.status || (task.url ? t('video.status.completed') : t('video.status.processing'))
      })

      if (task.url) {
        const preview = await prepareVideoPreview(task.url, controller.signal, headers).catch((error) => {
          if (error instanceof Error && error.name === 'AbortError') {
            throw error
          }
          logger.warn('Failed to prepare local video preview, falling back to remote URL', error as Error)
          return undefined
        })
        if (preview) {
          updateVideo(videoId, {
            blobUrl: preview.blobUrl,
            localFile: preview.localFile,
            playbackError: undefined,
            status: 'completed',
            progress: 100,
            progressText: t('video.status.completed')
          })
        }
        return
      }

      if (!task.taskId) {
        throw new Error(t('video.error.no_task_id'))
      }

      const result = await pollVideoTask(videoId, task.taskId, task.endpoints, headers, controller.signal)
      if (!result.url && !result.blobUrl) {
        throw new Error(t('video.error.no_video_url'))
      }

      const preview = result.url
        ? await prepareVideoPreview(result.url, controller.signal, headers).catch((error) => {
            if (error instanceof Error && error.name === 'AbortError') {
              throw error
            }
            logger.warn('Failed to prepare local video preview, falling back to remote URL', error as Error)
            return undefined
          })
        : undefined

      updateVideo(videoId, {
        url: result.url,
        blobUrl: result.blobUrl || preview?.blobUrl,
        localFile: result.localFile || preview?.localFile,
        playbackError: undefined,
        status: 'completed',
        progress: 100,
        progressText: t('video.status.completed')
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        updateVideo(videoId, {
          status: 'failed',
          error: t('video.error.cancelled'),
          progressText: t('video.error.cancelled')
        })
        return
      }

      logger.error('Video generation failed', error as Error)
      const message = getErrorMessage(error)
      updateVideo(videoId, { status: 'failed', error: message, progressText: message })
      window.modal.error({ content: message, centered: true })
    } finally {
      clearActiveVideoTask(videoId)
    }
  }

  const onCancel = () => {
    activeController?.abort()
  }

  const translate = async () => {
    if (isTranslating || !form.prompt) return

    try {
      setIsTranslating(true)
      const translatedText = await translateText(form.prompt, LanguagesEnum.enUS)
      setForm((prev) => ({ ...prev, prompt: translatedText }))
    } catch (error) {
      logger.error('Translation failed:', error as Error)
    } finally {
      setIsTranslating(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnterPressed = event.key === 'Enter' && !event.nativeEvent.isComposing
    if (
      isEnterPressed &&
      isSendMessageKeyPressed(event, sendMessageShortcut) &&
      !isLoading &&
      !isSelectedVideoLoading
    ) {
      event.preventDefault()
      void onGenerate()
      return
    }

    if (!autoTranslateWithSpace || event.key !== ' ') return

    setSpaceClickCount((prev) => prev + 1)
    if (spaceClickTimer.current) {
      window.clearTimeout(spaceClickTimer.current)
    }

    spaceClickTimer.current = window.setTimeout(() => {
      setSpaceClickCount(0)
    }, 200)

    if (spaceClickCount === 2) {
      setSpaceClickCount(0)
      void translate()
    }
  }

  const uploadFrame = (field: 'firstFrame' | 'lastFrame') => async (file: RcFile) => {
    try {
      const frame = await readFrameImage(file)
      setForm((prev) => ({ ...prev, [field]: frame }))
    } catch (error) {
      window.toast.error(getErrorMessage(error))
    }
    return false
  }

  const removeFrame = (field: 'firstFrame' | 'lastFrame') => {
    setForm((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleProviderChange = (providerId: string) => {
    navigate(`/videos/${providerId}`, { replace: true })
  }

  const addNewPrompt = () => {
    setForm(DEFAULT_FORM)
    setVideoPageSelectedVideoId(undefined)
  }

  const deleteVideo = (videoId: string) => {
    revokeVideoBlobUrl(videos.find((video) => video.id === videoId)?.blobUrl)
    setVideoPageVideos((prev) => prev.filter((video) => video.id !== videoId))
    if (selectedVideoId === videoId) {
      setVideoPageSelectedVideoId(undefined)
    }
  }

  const previewLocalSrc = getLocalVideoUrl(selectedVideo?.localFile)
  const previewSrc = previewLocalSrc || selectedVideo?.blobUrl || selectedVideo?.url
  const previewSourceText = previewLocalSrc
    ? '正在使用本地缓存预览'
    : selectedVideo?.blobUrl
      ? '正在使用本地数据预览'
      : '正在使用远程地址预览'

  useEffect(() => {
    if (!selectedVideo?.id || !previewSrc) return

    updateVideo(selectedVideo.id, { playbackError: undefined })
    videoRef.current?.load()
  }, [previewSrc, selectedVideo?.id, updateVideo])

  const handleVideoLoaded = () => {
    if (!selectedVideo?.id || !selectedVideo.playbackError) return
    updateVideo(selectedVideo.id, { playbackError: undefined })
  }

  const handleVideoError = () => {
    if (!selectedVideo?.id) return

    const message = getVideoPlaybackErrorText(videoRef.current?.error?.code, previewSrc)
    logger.warn(`Video preview playback failed: ${message}`)
    updateVideo(selectedVideo.id, { playbackError: message })
  }

  const retryPrepareSelectedPreview = async () => {
    if (!selectedVideo?.id || !selectedVideo.url) return

    const controller = new AbortController()
    setIsPreparingPreview(true)

    try {
      const previousBlobUrl = selectedVideo.blobUrl
      const preview = await prepareVideoPreview(
        selectedVideo.url,
        controller.signal,
        getVideoRequestHeaders(selectedVideoProvider)
      )

      if (preview?.blobUrl && previousBlobUrl && preview.blobUrl !== previousBlobUrl) {
        revokeVideoBlobUrl(previousBlobUrl)
      }

      updateVideo(selectedVideo.id, {
        blobUrl: preview?.blobUrl || previousBlobUrl,
        localFile: preview?.localFile || selectedVideo.localFile,
        playbackError: undefined
      })
    } catch (error) {
      logger.warn('Failed to prepare video preview manually', error as Error)
      window.toast.error(getErrorMessage(error))
    } finally {
      setIsPreparingPreview(false)
    }
  }

  const openSelectedLocalFile = () => {
    if (!selectedVideo?.localFile?.path) return
    void window.api.file.openPath(selectedVideo.localFile.path)
  }

  if (!currentProvider) {
    return (
      <Container>
        <Navbar>
          <NavbarCenter>{t('video.title')}</NavbarCenter>
        </Navbar>
        <EmptyContainer>
          <Empty description={t('video.no_provider')}>
            <Button type="primary" onClick={() => navigate('/settings/provider')}>
              {t('common.go_to_settings')}
            </Button>
          </Empty>
        </EmptyContainer>
      </Container>
    )
  }

  return (
    <Container>
      <Navbar>
        <NavbarCenter style={{ borderRight: 'none' }}>{t('video.title')}</NavbarCenter>
      </Navbar>
      <ContentContainer>
        <LeftContainer>
          <ProviderTitleContainer>
            <SettingTitle style={{ marginBottom: 5 }}>{t('common.provider')}</SettingTitle>
            <SettingHelpLink
              target="_blank"
              href={PROVIDER_URLS[currentProvider.id]?.websites?.docs || 'https://www.pentime-api.com'}>
              {t('paintings.learn_more')}
              <ProviderLogo
                shape="square"
                src={getProviderLogo(currentProvider.id)}
                size={16}
                style={{ marginLeft: 5 }}
              />
            </SettingHelpLink>
          </ProviderTitleContainer>

          <ProviderSelect provider={currentProvider} options={providerOptions} onChange={handleProviderChange} />

          <SettingTitle style={{ marginTop: 20 }}>{t('video.model')}</SettingTitle>
          <Select
            value={form.model}
            onChange={(model) => setForm((prev) => ({ ...prev, model }))}
            style={{ width: '100%' }}>
            {Object.entries(groupedModelOptions).map(([groupName, options]) => (
              <Select.OptGroup label={groupName} key={groupName}>
                {options.map((model) => (
                  <Select.Option value={model.value} key={model.value}>
                    {model.label}
                  </Select.Option>
                ))}
              </Select.OptGroup>
            ))}
          </Select>

          <SettingTitle style={{ marginTop: 20, marginBottom: 5 }}>{t('video.default_settings')}</SettingTitle>
          <TwoColumn>
            <Field>
              <Select
                value={form.aspectRatio}
                onChange={(aspectRatio) => setForm((prev) => ({ ...prev, aspectRatio }))}
                options={ASPECT_RATIO_OPTIONS.map((value) => ({ label: value, value }))}
              />
            </Field>
            <Field>
              <Select
                value={form.resolution}
                onChange={(resolution) => setForm((prev) => ({ ...prev, resolution }))}
                options={RESOLUTION_OPTIONS.map((value) => ({ label: value, value }))}
              />
            </Field>
          </TwoColumn>

          <SwitchRow>
            <span>{t('video.enhance_prompt')}</span>
            <Switch
              checked={form.enhancePrompt}
              onChange={(enhancePrompt) => setForm((prev) => ({ ...prev, enhancePrompt }))}
            />
          </SwitchRow>

          <SettingTitle style={{ marginTop: 20 }}>{t('video.first_frame')}</SettingTitle>
          <Upload
            accept="image/png,image/jpeg,image/webp"
            maxCount={1}
            fileList={frameUploadList(form.firstFrame)}
            beforeUpload={uploadFrame('firstFrame')}
            onRemove={() => {
              removeFrame('firstFrame')
              return true
            }}>
            <UploadButton icon={<UploadIcon size={14} />}>{t('video.upload_frame')}</UploadButton>
          </Upload>

          <SettingTitle style={{ marginTop: 15 }}>{t('video.last_frame')}</SettingTitle>
          <Upload
            accept="image/png,image/jpeg,image/webp"
            maxCount={1}
            fileList={frameUploadList(form.lastFrame)}
            beforeUpload={uploadFrame('lastFrame')}
            onRemove={() => {
              removeFrame('lastFrame')
              return true
            }}>
            <UploadButton icon={<UploadIcon size={14} />}>{t('video.upload_frame')}</UploadButton>
          </Upload>
        </LeftContainer>

        <MainContainer>
          <PreviewArea>
            {previewSrc ? (
              <PreviewPanel>
                <VideoPreview
                  ref={videoRef}
                  controls
                  preload="auto"
                  src={previewSrc}
                  onCanPlay={handleVideoLoaded}
                  onLoadedMetadata={handleVideoLoaded}
                  onError={handleVideoError}
                />
                <PreviewFooter>
                  <PreviewMeta>
                    <span>{previewSourceText}</span>
                    {selectedVideo?.playbackError && <PreviewError>{selectedVideo.playbackError}</PreviewError>}
                  </PreviewMeta>
                  <PreviewActions>
                    {selectedVideo?.url && (
                      <Button
                        size="small"
                        icon={<RefreshCw size={13} />}
                        loading={isPreparingPreview}
                        onClick={retryPrepareSelectedPreview}>
                        重试预览
                      </Button>
                    )}
                    {selectedVideo?.localFile?.path && (
                      <Button size="small" icon={<ExternalLink size={13} />} onClick={openSelectedLocalFile}>
                        打开文件
                      </Button>
                    )}
                  </PreviewActions>
                </PreviewFooter>
              </PreviewPanel>
            ) : selectedVideo?.status === 'failed' ? (
              <StatusPanel>
                <StatusTitle>{t('video.status.failed')}</StatusTitle>
                <StatusText>{selectedVideo.error}</StatusText>
              </StatusPanel>
            ) : isSelectedVideoLoading && selectedVideo ? (
              <StatusPanel>
                <Progress type="circle" percent={selectedVideo.progress ?? 0} />
                <StatusText>{selectedVideo.progressText || t('video.status.processing')}</StatusText>
                <Button onClick={onCancel}>{t('common.cancel')}</Button>
              </StatusPanel>
            ) : (
              <StatusPanel>
                <StatusTitle>{t('video.empty_title')}</StatusTitle>
                <StatusText>{t('video.empty_description')}</StatusText>
              </StatusPanel>
            )}
          </PreviewArea>

          <InputContainer>
            <Textarea
              ref={textareaRef}
              variant="borderless"
              disabled={isSelectedVideoLoading}
              value={form.prompt}
              spellCheck={false}
              onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
              placeholder={isTranslating ? t('paintings.translating') : t('video.prompt_placeholder')}
              onKeyDown={handleKeyDown}
            />
            <Toolbar>
              <ToolbarMenu>
                <TranslateButton
                  text={textareaRef.current?.resizableTextArea?.textArea?.value}
                  onTranslated={(translatedText) => setForm((prev) => ({ ...prev, prompt: translatedText }))}
                  disabled={isSelectedVideoLoading || isTranslating}
                  isLoading={isTranslating}
                  style={{ marginRight: 6, borderRadius: '50%' }}
                />
                <Tooltip title={t('video.new_task')}>
                  <ActionIconButton onClick={addNewPrompt} disabled={isSelectedVideoLoading}>
                    <MessageSquareDiff size={19} />
                  </ActionIconButton>
                </Tooltip>
                <SendMessageButton sendMessage={onGenerate} disabled={isLoading || isSelectedVideoLoading} />
              </ToolbarMenu>
            </Toolbar>
          </InputContainer>
        </MainContainer>

        <RightContainer>
          {videos.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('video.no_history')} />
          ) : (
            <HistoryList>
              {videos.map((video) => (
                <HistoryItem
                  key={video.id}
                  $active={video.id === selectedVideo?.id}
                  onClick={() => setVideoPageSelectedVideoId(video.id)}>
                  <HistoryHeader>
                    <HistoryModel>{video.model}</HistoryModel>
                    <Tag color={video.status === 'completed' ? 'green' : video.status === 'failed' ? 'red' : 'blue'}>
                      {t(VIDEO_STATUS_LABEL_KEYS[video.status])}
                    </Tag>
                  </HistoryHeader>
                  <HistoryPrompt>{video.prompt}</HistoryPrompt>
                  <HistoryActions>
                    {(video.blobUrl || video.url) && (
                      <Tooltip title={t('common.download')}>
                        <HistoryIconButton
                          size="small"
                          icon={<Download size={13} />}
                          href={video.blobUrl || video.url}
                          target="_blank"
                          download
                          onClick={(event) => event.stopPropagation()}
                        />
                      </Tooltip>
                    )}
                    <Tooltip title={t('common.delete')}>
                      <HistoryIconButton
                        size="small"
                        icon={<Trash2 size={13} />}
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteVideo(video.id)
                        }}
                      />
                    </Tooltip>
                  </HistoryActions>
                </HistoryItem>
              ))}
            </HistoryList>
          )}
        </RightContainer>
      </ContentContainer>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  height: 100%;
  background-color: var(--color-background);
  overflow: hidden;
`

const LeftContainer = styled(Scrollbar)`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  background-color: var(--color-background);
  max-width: var(--assistants-width);
  border-right: 0.5px solid var(--color-border);
`

const MainContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background-color: var(--color-background);
`

const RightContainer = styled(Scrollbar)`
  display: flex;
  flex-direction: column;
  width: clamp(150px, 18vw, 220px);
  min-width: 150px;
  max-width: 220px;
  padding: 12px;
  border-left: 0.5px solid var(--color-border);
`

const ProviderTitleContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
`

const ProviderLogo = styled(Avatar)`
  border: 0.5px solid var(--color-border);
`

const TwoColumn = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 15px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
`

const SwitchRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  margin-top: 6px;
  margin-bottom: 16px;
  padding-top: 8px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
`

const UploadButton = styled(Button)`
  width: 100%;
`

const PreviewArea = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 20px;
`

const PreviewPanel = styled.div`
  display: flex;
  flex-direction: column;
  width: min(100%, calc((100vh - 230px) * 16 / 9));
  max-width: 960px;
  min-width: 0;
`

const VideoPreview = styled.video`
  width: 100%;
  max-height: calc(100vh - 230px);
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: 8px;
`

const PreviewFooter = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  padding-top: 10px;
`

const PreviewMeta = styled.div`
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-2);
`

const PreviewError = styled.span`
  color: var(--color-error);
  word-break: break-word;
`

const PreviewActions = styled.div`
  display: flex;
  flex-shrink: 0;
  gap: 6px;
`

const StatusPanel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  width: min(100%, calc((100vh - 230px) * 16 / 9));
  max-width: 780px;
  aspect-ratio: 16 / 9;
  padding: 24px;
  border-radius: 8px;
  background-color: var(--color-background-soft);
  color: var(--color-text-2);
  text-align: center;
`

const StatusTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
`

const StatusText = styled.div`
  font-size: 13px;
  color: var(--color-text-2);
  word-break: break-word;
`

const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 105px;
  max-height: 105px;
  position: relative;
  border: 1px solid var(--color-border-soft);
  margin: 0 20px 15px;
  border-radius: 10px;
`

const Textarea = styled(TextArea)`
  padding: 10px;
  border-radius: 0;
  display: flex;
  flex: 1;
  resize: none !important;
  overflow: auto;
  width: auto;
`

const Toolbar = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  padding: 0 8px;
  height: 40px;
`

const ToolbarMenu = styled(Space)`
  display: flex;
  flex-direction: row;
  align-items: center;

  .ant-btn-icon-only {
    width: 28px;
    height: 28px;
  }
`

const HistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const HistoryItem = styled.div<{ $active?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-primary)' : 'var(--color-border)')};
  border-radius: 8px;
  background-color: ${({ $active }) => ($active ? 'var(--color-list-item)' : 'var(--color-background)')};
  cursor: pointer;
`

const HistoryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  .ant-tag {
    flex-shrink: 0;
    margin-inline-end: 0;
  }
`

const HistoryModel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const HistoryPrompt = styled.div`
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  color: var(--color-text-2);
  word-break: break-word;
`

const HistoryActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
`

const HistoryIconButton = styled(Button)`
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  flex-shrink: 0;
`

const EmptyContainer = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
`

export default VideoPage
