import { PlusOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import { AiProvider } from '@renderer/aiCore'
import IcImageUp from '@renderer/assets/images/paintings/ic_ImageUp.svg'
import { Navbar, NavbarCenter, NavbarRight } from '@renderer/components/app/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'
import TranslateButton from '@renderer/components/TranslateButton'
import { isMac } from '@renderer/config/constant'
import { getProviderLogo, PROVIDER_URLS } from '@renderer/config/providers'
import { LanguagesEnum } from '@renderer/config/translate'
import { useTheme } from '@renderer/context/ThemeProvider'
import { usePaintings } from '@renderer/hooks/usePaintings'
import { useAllProviders } from '@renderer/hooks/useProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import {
  getPaintingsBackgroundOptionsLabel,
  getPaintingsImageSizeOptionsLabel,
  getPaintingsModerationOptionsLabel,
  getPaintingsQualityOptionsLabel
} from '@renderer/i18n/label'
import PaintingsList from '@renderer/pages/paintings/components/PaintingsList'
import {
  DEFAULT_PAINTING,
  getNewApiModelConfig,
  isNewApiGptImage2Model,
  isNewApiImageSizeModel,
  parseNewApiImageSize,
  SUPPORTED_MODELS
} from '@renderer/pages/paintings/config/NewApiConfig'
import FileManager from '@renderer/services/FileManager'
import { translateText } from '@renderer/services/TranslateService'
import type { Model, PaintingAction, PaintingsState } from '@renderer/types'
import type { FileMetadata } from '@renderer/types'
import { getErrorMessage, getFileStorageName, uuid } from '@renderer/utils'
import { isSendMessageKeyPressed } from '@renderer/utils/input'
import { isNewApiProvider } from '@renderer/utils/provider'
import { Avatar, Button, Empty, InputNumber, Segmented, Select, Upload } from 'antd'
import TextArea from 'antd/es/input/TextArea'
import type { RcFile } from 'antd/es/upload'
import type { UploadFile } from 'antd/es/upload/interface'
import type { FC } from 'react'
import React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import SendMessageButton from '../home/Inputbar/SendMessageButton'
import { SettingHelpLink, SettingTitle } from '../settings'
import Artboard from './components/Artboard'
import ProviderSelect from './components/ProviderSelect'
import { checkProviderEnabled, findPaintingByFiles } from './utils'

const logger = loggerService.withContext('NewApiPage')

const isNewApiImageGenerationModel = (model: Model) => {
  const endpointTypes = model.supported_endpoint_types?.map((type) => String(type)) ?? []
  const endpointType = String(model.endpoint_type ?? '')
  const value = `${model.id} ${model.name} ${model.group} ${model.description ?? ''}`.toLowerCase()

  return (
    endpointType === 'image-generation' ||
    endpointTypes.includes('image-generation') ||
    endpointTypes.includes('images') ||
    /\bgpt-image\b|chatgpt-image|gemini.*image|grok.*image|image-generation/.test(value)
  )
}

type NewApiGenerationTask = {
  paintingId: string
  controller: AbortController
  progress: number
}

const newApiGenerationTasks = new Map<string, NewApiGenerationTask>()
const newApiGenerationListeners = new Set<() => void>()
let newApiGenerationVersion = 0

const notifyNewApiGenerationListeners = () => {
  newApiGenerationVersion += 1
  newApiGenerationListeners.forEach((listener) => listener())
}

const subscribeNewApiGeneration = (listener: () => void) => {
  newApiGenerationListeners.add(listener)
  return () => {
    newApiGenerationListeners.delete(listener)
  }
}

const getNewApiGenerationSnapshot = () => newApiGenerationVersion

const setNewApiGenerationTask = (paintingId: string, task: NewApiGenerationTask) => {
  newApiGenerationTasks.set(paintingId, task)
  notifyNewApiGenerationListeners()
}

const deleteNewApiGenerationTask = (paintingId: string) => {
  newApiGenerationTasks.delete(paintingId)
  notifyNewApiGenerationListeners()
}

const getNewApiGenerationTask = (paintingId?: string) =>
  paintingId ? newApiGenerationTasks.get(paintingId) : undefined

const getImageGenerationProgressText = (progress: number) => {
  if (progress < 30) return '正在提交生成请求'
  if (progress < 70) return '模型正在生成图片，请稍候'
  if (progress < 90) return '即将完成，正在接收结果'
  return '正在保存生成图片'
}

const isProcessingPainting = (painting: PaintingAction) => {
  return painting.generationStatus === 'processing' && (painting.generationProgress ?? 0) < 100
}

const NewApiPage: FC<{ Options: string[] }> = ({ Options }) => {
  const [mode, setMode] = useState<keyof PaintingsState>('openai_image_generate')
  const { addPainting, removePainting, updatePainting, openai_image_generate, openai_image_edit } = usePaintings()

  const newApiPaintings = useMemo(() => {
    return {
      openai_image_generate,
      openai_image_edit
    }
  }, [openai_image_generate, openai_image_edit])

  // moved below after newApiProvider is defined
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isRetryLoading, setIsRetryLoading] = useState(false)
  useSyncExternalStore(subscribeNewApiGeneration, getNewApiGenerationSnapshot, getNewApiGenerationSnapshot)
  const [spaceClickCount, setSpaceClickCount] = useState(0)
  const [isTranslating, setIsTranslating] = useState(false)
  const [editImageFiles, setEditImageFiles] = useState<File[]>([])

  const { t } = useTranslation()
  const { theme } = useTheme()
  const providers = useAllProviders()
  const location = useLocation()
  const routeName = location.pathname.split('/').pop() || 'new-api'
  const newApiProviders = providers.filter((p) => isNewApiProvider(p))

  const navigate = useNavigate()
  const { autoTranslateWithSpace, sendMessageShortcut } = useSettings()
  const spaceClickTimer = useRef<NodeJS.Timeout>(null)
  const isMountedRef = useRef(true)
  const newApiProvider = newApiProviders.find((p) => p.id === routeName) || newApiProviders[0]

  const filteredPaintings = useMemo(
    () => (newApiPaintings[mode] || []).filter((p) => p.providerId === newApiProvider.id),
    [newApiPaintings, mode, newApiProvider.id]
  )
  const [painting, setPainting] = useState<PaintingAction>({ ...DEFAULT_PAINTING, providerId: newApiProvider.id })
  const currentModeProcessingPainting = useMemo(() => filteredPaintings.find(isProcessingPainting), [filteredPaintings])
  const editProcessingPainting = useMemo(
    () =>
      (newApiPaintings.openai_image_edit || []).find(
        (item) => item.providerId === newApiProvider.id && isProcessingPainting(item)
      ),
    [newApiPaintings.openai_image_edit, newApiProvider.id]
  )
  const activeGenerationTask = getNewApiGenerationTask(painting.id)
  const isPersistedGenerationLoading =
    painting.generationStatus === 'processing' &&
    painting.files.length === 0 &&
    (painting.generationProgress ?? 0) < 100
  const isLoading = !!activeGenerationTask || isPersistedGenerationLoading
  const isPromptEmpty = !painting.prompt?.trim()

  const modeOptions = [
    { label: t('paintings.mode.generate'), value: 'openai_image_generate' },
    { label: t('paintings.mode.edit'), value: 'openai_image_edit' }
  ]

  const textareaRef = useRef<any>(null)

  // 获取编辑模式的图片文件
  const editImages = editImageFiles

  useEffect(() => {
    if (mode !== 'openai_image_edit') {
      return
    }

    let isActive = true

    const syncEditImages = async () => {
      if (painting.files.length === 0) {
        setEditImageFiles([])
        return
      }

      try {
        const files = await Promise.all(
          painting.files.map(async (file, index) => {
            const { data, mime } = await window.api.file.binaryImage(getFileStorageName(file))
            const fileName = file.name || `image_${index + 1}${file.ext}`

            return new File([data], fileName, {
              type: mime,
              lastModified: new Date(file.created_at).getTime()
            })
          })
        )

        if (isActive) {
          setEditImageFiles(files)
        }
      } catch (error) {
        logger.error('Failed to sync edit images from selected painting:', error as Error)

        if (isActive) {
          setEditImageFiles([])
        }
      }
    }

    void syncEditImages()

    return () => {
      isActive = false
    }
  }, [mode, painting.files])

  const updatePaintingState = useCallback(
    (updates: Partial<PaintingAction>) => {
      const updatedPainting = { ...painting, providerId: newApiProvider.id, ...updates }
      setPainting(updatedPainting)
      updatePainting(mode, updatedPainting)
    },
    [painting, newApiProvider.id, mode, updatePainting]
  )

  // ---------------- Model Related Configurations ----------------
  // const modelOptions = MODELS.map((m) => ({ label: m.name, value: m.name }))

  const modelOptions = useMemo(() => {
    const customModels = newApiProvider.models.filter(isNewApiImageGenerationModel).map((m) => ({
      label: m.name || m.id,
      value: m.id,
      custom: !SUPPORTED_MODELS.includes(m.id),
      group: m.group || newApiProvider.name
    }))
    return [...customModels]
  }, [newApiProvider.models, newApiProvider.name])

  // 根据 group 将模型进行分组，便于在下拉列表中分组渲染
  const groupedModelOptions = useMemo(() => {
    return modelOptions.reduce<Record<string, typeof modelOptions>>((acc, option) => {
      const groupName = option.group
      if (!acc[groupName]) {
        acc[groupName] = []
      }
      acc[groupName].push(option)
      return acc
    }, {})
  }, [modelOptions])

  const getNewPainting = useCallback(() => {
    return {
      ...DEFAULT_PAINTING,
      model: painting.model || modelOptions[0]?.value || '',
      id: uuid(),
      providerId: newApiProvider.id
    }
  }, [modelOptions, painting.model, newApiProvider.id])

  const selectedModelConfig = useMemo(() => getNewApiModelConfig(painting.model), [painting.model])
  const isImageSizeSupported = isNewApiImageSizeModel(painting.model)
  const selectedImageSizeValues = useMemo(
    () => (isImageSizeSupported ? (selectedModelConfig?.imageSizes?.map((item) => item.value) ?? []) : []),
    [isImageSizeSupported, selectedModelConfig]
  )
  const selectedQualityValues = useMemo(
    () => selectedModelConfig?.quality?.map((item) => item.value) ?? [],
    [selectedModelConfig]
  )

  useEffect(() => {
    if (selectedImageSizeValues.length === 0) {
      return
    }

    if (!painting.size || !selectedImageSizeValues.includes(painting.size)) {
      updatePaintingState({ size: selectedImageSizeValues[0] })
    }
  }, [painting.size, selectedImageSizeValues, updatePaintingState])

  useEffect(() => {
    if (selectedQualityValues.length === 0) {
      return
    }

    if (!painting.quality || !selectedQualityValues.includes(painting.quality)) {
      updatePaintingState({ quality: selectedQualityValues[0] })
    }
  }, [painting.quality, selectedQualityValues, updatePaintingState])

  useEffect(() => {
    if (!selectedModelConfig?.max_images || !painting.n || painting.n <= selectedModelConfig.max_images) {
      return
    }

    updatePaintingState({ n: selectedModelConfig.max_images })
  }, [painting.n, selectedModelConfig?.max_images, updatePaintingState])

  const handleModelChange = (value: string) => {
    const modelConfig = getNewApiModelConfig(value)
    const updates: Partial<PaintingAction> = { model: value }

    // 设置默认值
    if (isNewApiImageSizeModel(value) && modelConfig?.imageSizes?.length) {
      updates.size = modelConfig.imageSizes[0].value
    } else {
      updates.size = 'auto'
    }
    if (modelConfig?.quality?.length) {
      updates.quality = modelConfig.quality[0].value
    }
    if (modelConfig?.moderation?.length) {
      updates.moderation = modelConfig.moderation[0].value
    }
    updates.n = 1
    updatePaintingState(updates)
  }

  const handleSizeChange = (value: string) => {
    updatePaintingState({ size: value })
  }

  const handleQualityChange = (value: string) => {
    updatePaintingState({ quality: value })
  }

  const handleModerationChange = (value: string) => {
    updatePaintingState({ moderation: value })
  }

  const handleNChange = (value: number | string | null) => {
    if (value !== null && value !== undefined && value !== '') {
      updatePaintingState({ n: Number(value) })
    }
  }

  const handleError = (error: unknown) => {
    if (error instanceof Error && error.name !== 'AbortError') {
      window.modal.error({
        content: getErrorMessage(error),
        centered: true
      })
    }
  }

  const downloadImages = async (urls: string[]) => {
    const downloadedFiles = await Promise.all(
      urls.map(async (url) => {
        try {
          if (!url?.trim()) {
            logger.error('图像URL为空')
            window.toast.warning(t('message.empty_url'))
            return null
          }
          return await window.api.file.download(url)
        } catch (error) {
          logger.error('下载图像失败:', error as Error)
          if (
            error instanceof Error &&
            (error.message.includes('Failed to parse URL') || error.message.includes('Invalid URL'))
          ) {
            window.toast.warning(t('message.empty_url'))
          }
          return null
        }
      })
    )

    return downloadedFiles.filter((file): file is FileMetadata => file !== null)
  }

  const onGenerate = async () => {
    await checkProviderEnabled(newApiProvider, t)

    const prompt = textareaRef.current?.resizableTextArea?.textArea?.value || ''

    const AI = new AiProvider(newApiProvider)

    if (!AI.getApiKey()) {
      window.modal.error({
        content: t('error.no_api_key'),
        centered: true
      })
      return
    }

    if (!painting.model || !prompt.trim()) {
      return
    }

    if (mode === 'openai_image_edit' && editImages.length === 0) {
      window.toast.warning(t('paintings.image_file_required'))
      return
    }

    if (mode === 'openai_image_generate' && painting.files.length > 0) {
      const confirmed = await window.modal.confirm({
        content: t('paintings.regenerate.confirm'),
        centered: true
      })

      if (!confirmed) return
      await FileManager.deleteFiles(painting.files)
    }

    const controller = new AbortController()
    const generationNamespace = mode
    const paintingId = painting.id
    const editSourceFiles = mode === 'openai_image_edit' ? [...painting.files] : []
    let editSourceFilesReleased = false
    let progress = 8
    let taskPainting: PaintingAction = {
      ...painting,
      providerId: newApiProvider.id,
      prompt,
      files: mode === 'openai_image_edit' ? painting.files : [],
      urls: mode === 'openai_image_edit' ? painting.urls : [],
      generationProgress: progress,
      generationStatus: 'processing',
      generationMessage: getImageGenerationProgressText(progress)
    }

    const updateGenerationPainting = (updates: Partial<PaintingAction>) => {
      taskPainting = { ...taskPainting, ...updates }
      updatePainting(generationNamespace, taskPainting)
      if (isMountedRef.current) {
        setPainting((prev) => (prev.id === paintingId ? taskPainting : prev))
      }
    }

    const releaseSharedEditSourceFiles = async () => {
      if (editSourceFilesReleased || editSourceFiles.length === 0) {
        return
      }

      editSourceFilesReleased = true

      try {
        const releasableFiles: FileMetadata[] = []

        for (const file of editSourceFiles) {
          const fileRecord = await FileManager.getFile(file.id)
          if ((fileRecord?.count ?? 0) > 1) {
            releasableFiles.push(file)
          }
        }

        await FileManager.deleteFiles(releasableFiles)
      } catch (error) {
        logger.error('Failed to release edit source images:', error as Error)
      }
    }

    const updateProgress = (nextProgress: number) => {
      progress = Math.min(99, nextProgress)
      setNewApiGenerationTask(paintingId, { paintingId, controller, progress })
      updateGenerationPainting({
        generationProgress: progress,
        generationStatus: 'processing',
        generationMessage: getImageGenerationProgressText(progress)
      })
    }

    setNewApiGenerationTask(paintingId, { paintingId, controller, progress })
    updatePainting(generationNamespace, taskPainting)
    if (isMountedRef.current) {
      setPainting(taskPainting)
    }

    const progressTimer = window.setInterval(() => {
      updateProgress(progress + (progress < 45 ? 6 : progress < 75 ? 3 : 1))
    }, 2200)

    let body: string | FormData = ''
    const headers: Record<string, string> = {
      Authorization: `Bearer ${AI.getApiKey()}`
    }
    // NOTE: Cherry Studio当下 newapi只接受v1/images/xxx的请求
    // TODO: support gemini https://www.newapi.ai/zh/docs/api/ai-model/images/gemini/geminirelayv1beta-383837589
    let url = newApiProvider.apiHost.replace(/\/v1$/, '') + `/v1/images/generations`
    let editUrl = newApiProvider.apiHost.replace(/\/v1$/, '') + `/v1/images/edits`
    if (newApiProvider.id === 'aionly') {
      url = newApiProvider.apiHost.replace(/\/v1$/, '') + `/openai/v1/images/generations`
      editUrl = newApiProvider.apiHost.replace(/\/v1$/, '') + `/openai/v1/images/edits`
    }

    try {
      if (mode === 'openai_image_generate') {
        const parsedImageSize = parseNewApiImageSize(painting.size)
        const isGptImage2 = isNewApiGptImage2Model(painting.model)
        const supportsImageSize = isNewApiImageSizeModel(painting.model)
        const requestData = {
          prompt,
          model: painting.model,
          size: supportsImageSize && parsedImageSize.size !== 'auto' ? parsedImageSize.size : undefined,
          aspect_ratio: undefined,
          background: isGptImage2 || painting.background === 'auto' ? undefined : painting.background,
          n: isGptImage2 ? 1 : painting.n,
          quality: painting.quality === 'auto' ? undefined : painting.quality,
          moderation: isGptImage2 || painting.moderation === 'auto' ? undefined : painting.moderation,
          response_format: isGptImage2 ? 'b64_json' : undefined
        }

        body = JSON.stringify(requestData)
        headers['Content-Type'] = 'application/json'
      } else if (mode === 'openai_image_edit') {
        // -------- Edit Mode --------
        const formData = new FormData()
        formData.append('prompt', prompt)
        formData.append('model', painting.model)
        if (painting.background && painting.background !== 'auto') {
          formData.append('background', painting.background)
        }

        if (isNewApiImageSizeModel(painting.model) && painting.size && painting.size !== 'auto') {
          const parsedImageSize = parseNewApiImageSize(painting.size)
          if (parsedImageSize.size && parsedImageSize.size !== 'auto') {
            formData.append('size', parsedImageSize.size)
          }
        }

        if (painting.quality && painting.quality !== 'auto') {
          formData.append('quality', painting.quality)
        }

        if (painting.moderation && painting.moderation !== 'auto') {
          formData.append('moderation', painting.moderation)
        }

        // append images
        editImages.forEach((file) => {
          formData.append('image', file)
        })

        // TODO: mask support later

        body = formData

        // For edit mode we do not set content-type; browser will set multipart boundary
      }

      const requestUrl = mode === 'openai_image_edit' ? editUrl : url
      const response = await fetch(requestUrl, { method: 'POST', headers, body, signal: controller.signal })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || t('paintings.generate_failed'))
      }

      updateProgress(88)

      const data = await response.json()
      const urls = data.data.filter((item) => item.url).map((item) => item.url)
      const base64s = data.data.filter((item) => item.b64_json).map((item) => item.b64_json)

      if (urls.length > 0) {
        updateProgress(92)
        const validFiles = await downloadImages(urls)
        await FileManager.addFiles(validFiles)
        await releaseSharedEditSourceFiles()
        updateGenerationPainting({
          files: validFiles,
          urls,
          generationProgress: 100,
          generationStatus: 'succeeded',
          generationMessage: t('paintings.generated_image')
        })
      }

      if (base64s?.length > 0) {
        updateProgress(92)
        const validFiles = await Promise.all(
          base64s.map(async (base64) => {
            return await window.api.file.saveBase64Image(base64)
          })
        )
        await FileManager.addFiles(validFiles)
        await releaseSharedEditSourceFiles()
        updateGenerationPainting({
          files: validFiles,
          urls: [],
          generationProgress: 100,
          generationStatus: 'succeeded',
          generationMessage: t('paintings.generated_image')
        })
      }

      if (urls.length === 0 && base64s.length === 0) {
        throw new Error(t('paintings.generate_failed'))
      }
    } catch (error: unknown) {
      updateGenerationPainting({
        generationStatus: error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed',
        generationMessage:
          error instanceof Error && error.name === 'AbortError' ? t('common.cancel') : getErrorMessage(error)
      })
      handleError(error)
    } finally {
      window.clearInterval(progressTimer)
      deleteNewApiGenerationTask(paintingId)
    }
  }

  const handleRetry = async (painting: PaintingAction) => {
    setIsRetryLoading(true)
    try {
      const validFiles = await downloadImages(painting.urls)
      await FileManager.addFiles(validFiles)
      updatePaintingState({ files: validFiles, urls: painting.urls })
    } catch (error) {
      handleError(error)
    } finally {
      setIsRetryLoading(false)
    }
  }

  const onCancel = () => {
    activeGenerationTask?.controller.abort()
  }

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % painting.files.length)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + painting.files.length) % painting.files.length)
  }

  const handleAddPainting = () => {
    const newPainting = addPainting(mode, getNewPainting())
    updatePainting(mode, newPainting)
    setPainting(newPainting)
    return newPainting
  }

  const onDeletePainting = (paintingToDelete: PaintingAction) => {
    if (paintingToDelete.id === painting.id) {
      const currentIndex = filteredPaintings.findIndex((p) => p.id === paintingToDelete.id)

      if (currentIndex > 0) {
        setPainting(filteredPaintings[currentIndex - 1])
      } else if (filteredPaintings.length > 1) {
        setPainting(filteredPaintings[1])
      }
    }

    void removePainting(mode, paintingToDelete)
  }

  const translate = async () => {
    if (isTranslating) {
      return
    }

    if (!painting.prompt) {
      return
    }

    try {
      setIsTranslating(true)
      const translatedText = await translateText(painting.prompt, LanguagesEnum.enUS)
      updatePaintingState({ prompt: translatedText })
    } catch (error) {
      logger.error('Translation failed:', error as Error)
    } finally {
      setIsTranslating(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnterPressed = event.key === 'Enter' && !event.nativeEvent.isComposing
    if (isEnterPressed && isSendMessageKeyPressed(event, sendMessageShortcut) && !isLoading && !isPromptEmpty) {
      event.preventDefault()
      void onGenerate()
      return
    }

    if (autoTranslateWithSpace && event.key === ' ') {
      setSpaceClickCount((prev) => prev + 1)

      if (spaceClickTimer.current) {
        clearTimeout(spaceClickTimer.current)
      }

      spaceClickTimer.current = setTimeout(() => {
        setSpaceClickCount(0)
      }, 200)

      if (spaceClickCount === 2) {
        setSpaceClickCount(0)
        setIsTranslating(true)
        void translate()
      }
    }
  }

  const handleProviderChange = (providerId: string) => {
    const routeName = location.pathname.split('/').pop()
    if (providerId !== routeName) {
      navigate('../' + providerId, { replace: true })
    }
  }

  // 处理模式切换
  const handleModeChange = async (value: string) => {
    const nextMode = value as keyof PaintingsState

    setMode(nextMode)
    setCurrentImageIndex(0)

    if (nextMode === 'openai_image_edit' && mode === 'openai_image_generate' && painting.files.length > 0) {
      const existingEditPainting = findPaintingByFiles(
        newApiPaintings.openai_image_edit || [],
        newApiProvider.id,
        painting.files
      )

      if (existingEditPainting) {
        setPainting(existingEditPainting)
        return
      }

      let referencedFiles = painting.files
      try {
        referencedFiles = await FileManager.addFiles(painting.files)
      } catch (error) {
        logger.error('Failed to retain edit source images:', error as Error)
      }

      const seededPainting = {
        ...painting,
        id: uuid(),
        files: referencedFiles,
        providerId: newApiProvider.id
      }

      addPainting(nextMode, seededPainting)
      setPainting(seededPainting)
      return
    }

    const list = (newApiPaintings[nextMode] || []).filter((p) => p.providerId === newApiProvider.id)
    setPainting(list[0] || { ...DEFAULT_PAINTING, providerId: newApiProvider.id })
  }

  // 渲染配置项的函数
  const onSelectPainting = (newPainting: PaintingAction) => {
    setPainting(newPainting)
    setCurrentImageIndex(0)
  }

  const handleImageUpload = (file: File) => {
    setEditImageFiles((prev) => [...prev, file])
    return false // 阻止默认上传行为
  }

  // 当 modelOptions 为空时，引导用户跳转到 Provider 设置页面，新增 image-generation 端点模型
  const handleShowAddModelPopup = () => {
    navigate(`/settings/provider?id=${newApiProvider.id}`)
  }

  useEffect(() => {
    if (mode === 'openai_image_edit' || currentModeProcessingPainting || !editProcessingPainting) {
      return
    }

    setMode('openai_image_edit')
    setPainting(editProcessingPainting)
  }, [currentModeProcessingPainting, editProcessingPainting, mode])

  useEffect(() => {
    if (filteredPaintings.length === 0) {
      const newPainting = getNewPainting()
      addPainting(mode, newPainting)
      setPainting(newPainting)
    } else {
      // 如果当前 painting 存在于 filteredPaintings 中，则优先显示当前 painting
      const found = filteredPaintings.find((p) => p.id === painting.id)
      if (found) {
        setPainting(found)
      } else if (currentModeProcessingPainting) {
        setPainting(currentModeProcessingPainting)
      } else {
        setPainting(filteredPaintings[0])
      }
    }
  }, [currentModeProcessingPainting, filteredPaintings, mode, addPainting, getNewPainting, painting.id])

  useEffect(() => {
    setCurrentImageIndex(0)
  }, [mode, painting.id])

  useEffect(() => {
    if (currentImageIndex > 0 && currentImageIndex >= painting.files.length) {
      setCurrentImageIndex(0)
    }
  }, [currentImageIndex, painting.files.length])

  useEffect(() => {
    isMountedRef.current = true

    const timer = spaceClickTimer.current
    return () => {
      isMountedRef.current = false
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [])

  // if painting.model is not set, set it to the first model in modelOptions
  useEffect(() => {
    if (!painting.model && modelOptions.length > 0) {
      updatePaintingState({ model: modelOptions[0].value })
    }
  }, [modelOptions, painting.model, updatePaintingState])

  return (
    <Container>
      <Navbar>
        <NavbarCenter style={{ borderRight: 'none' }}>{t('paintings.title')}</NavbarCenter>
        {isMac && (
          <NavbarRight style={{ justifyContent: 'flex-end' }}>
            <Button size="small" className="nodrag" icon={<PlusOutlined />} onClick={handleAddPainting}>
              {t('paintings.button.new.image')}
            </Button>
          </NavbarRight>
        )}
      </Navbar>
      <ContentContainer id="content-container">
        <LeftContainer>
          <ProviderTitleContainer>
            <SettingTitle style={{ marginBottom: 5 }}>{t('common.provider')}</SettingTitle>
            <SettingHelpLink
              target="_blank"
              href={PROVIDER_URLS[newApiProvider.id]?.websites?.docs || 'https://www.pentime-api.com'}>
              {t('paintings.learn_more')}
              <ProviderLogo
                shape="square"
                src={getProviderLogo(newApiProvider.id)}
                size={16}
                style={{ marginLeft: 5 }}
              />
            </SettingHelpLink>
          </ProviderTitleContainer>

          <ProviderSelect provider={newApiProvider} options={Options} onChange={handleProviderChange} />

          {/* 当没有可用的 Image Generation 模型时，提示用户先去新增 */}
          {modelOptions.length === 0 && (
            <Empty
              style={{ marginTop: 24 }}
              description={t('paintings.no_image_generation_model', {
                endpoint_type: t('endpoint_type.image-generation')
              })}>
              <Button type="primary" onClick={handleShowAddModelPopup}>
                {t('paintings.go_to_settings')}
              </Button>
            </Empty>
          )}

          {modelOptions.length > 0 && (
            <>
              {mode === 'openai_image_edit' && (
                <>
                  <SettingTitle style={{ marginTop: 20 }}>{t('paintings.input_image')}</SettingTitle>
                  <ImageUploadButton
                    accept="image/png, image/jpeg, image/gif"
                    maxCount={16}
                    showUploadList={true}
                    listType="picture"
                    beforeUpload={handleImageUpload}
                    fileList={editImageFiles.map((file, idx): UploadFile<any> => {
                      const rcFile: RcFile = {
                        ...file,
                        uid: String(idx),
                        lastModifiedDate: file.lastModified ? new Date(file.lastModified) : new Date()
                      }
                      return {
                        uid: rcFile.uid,
                        name: rcFile.name || `image_${idx + 1}.png`,
                        status: 'done',
                        url: URL.createObjectURL(file),
                        originFileObj: rcFile,
                        lastModifiedDate: rcFile.lastModifiedDate
                      }
                    })}
                    onRemove={(file) => {
                      setEditImageFiles((prev) =>
                        prev.filter((f) => {
                          const idx = prev.indexOf(f)
                          return String(idx) !== file.uid
                        })
                      )
                      return true
                    }}>
                    <ImagePlaceholder>
                      <ImageSizeImage src={IcImageUp} theme={theme} />
                    </ImagePlaceholder>
                  </ImageUploadButton>
                </>
              )}

              {/* Model Selector */}
              <SettingTitle style={{ marginTop: 20 }}>{t('paintings.model')}</SettingTitle>
              <Select value={painting.model} onChange={handleModelChange} style={{ width: '100%', marginBottom: 15 }}>
                {Object.entries(groupedModelOptions).map(([groupName, options]) => (
                  <Select.OptGroup label={groupName} key={groupName}>
                    {options.map((m) => (
                      <Select.Option value={m.value} key={m.value}>
                        {m.label}
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                ))}
              </Select>

              {/* Image Size */}
              {isImageSizeSupported && selectedModelConfig?.imageSizes && selectedModelConfig.imageSizes.length > 0 && (
                <>
                  <SettingTitle>{t('paintings.image.size')}</SettingTitle>
                  <Select value={painting.size} onChange={handleSizeChange} style={{ width: '100%', marginBottom: 15 }}>
                    {selectedModelConfig.imageSizes.map((s) => (
                      <Select.Option value={s.value} key={s.value}>
                        {'label' in s && s.label
                          ? getPaintingsImageSizeOptionsLabel(s.label)
                          : getPaintingsImageSizeOptionsLabel(s.value)}
                      </Select.Option>
                    ))}
                  </Select>
                </>
              )}

              {/* Quality */}
              {selectedModelConfig?.quality && selectedModelConfig.quality.length > 0 && (
                <>
                  <SettingTitle>{t('paintings.quality')}</SettingTitle>
                  <Select
                    value={painting.quality}
                    onChange={handleQualityChange}
                    style={{ width: '100%', marginBottom: 15 }}>
                    {selectedModelConfig.quality.map((q) => (
                      <Select.Option value={q.value} key={q.value}>
                        {getPaintingsQualityOptionsLabel(q.value) ?? q.value}
                      </Select.Option>
                    ))}
                  </Select>
                </>
              )}

              {/* Moderation */}
              {mode !== 'openai_image_edit' &&
                selectedModelConfig?.moderation &&
                selectedModelConfig.moderation.length > 0 && (
                  <>
                    <SettingTitle>{t('paintings.moderation')}</SettingTitle>
                    <Select
                      value={painting.moderation}
                      onChange={handleModerationChange}
                      style={{ width: '100%', marginBottom: 15 }}>
                      {selectedModelConfig.moderation.map((m) => (
                        <Select.Option value={m.value} key={m.value}>
                          {getPaintingsModerationOptionsLabel(m.value) ?? m.value}
                        </Select.Option>
                      ))}
                    </Select>
                  </>
                )}

              {/* Background */}
              {mode === 'openai_image_edit' &&
                selectedModelConfig?.background &&
                selectedModelConfig.background.length > 0 && (
                  <>
                    <SettingTitle>{t('paintings.background')}</SettingTitle>
                    <Select
                      value={painting.background}
                      onChange={(value) => updatePaintingState({ background: value })}
                      style={{ width: '100%', marginBottom: 15 }}>
                      {selectedModelConfig.background.map((b) => (
                        <Select.Option value={b.value} key={b.value}>
                          {getPaintingsBackgroundOptionsLabel(b.value) ?? b.value}
                        </Select.Option>
                      ))}
                    </Select>
                  </>
                )}

              {/* Number of Images (n) */}
              {selectedModelConfig?.max_images && (
                <>
                  <SettingTitle>{t('paintings.number_images')}</SettingTitle>
                  <InputNumber
                    min={1}
                    max={selectedModelConfig.max_images}
                    value={painting.n || 1}
                    onChange={handleNChange}
                    style={{ width: '100%', marginBottom: 15 }}
                  />
                </>
              )}
            </>
          )}
        </LeftContainer>
        <MainContainer>
          {/* 添加功能切换分段控制器 */}
          <ModeSegmentedContainer>
            <Segmented shape="round" value={mode} onChange={handleModeChange} options={modeOptions} />
          </ModeSegmentedContainer>
          <Artboard
            painting={painting}
            isLoading={isLoading || isRetryLoading}
            currentImageIndex={currentImageIndex}
            onPrevImage={prevImage}
            onNextImage={nextImage}
            onCancel={onCancel}
            retry={handleRetry}
          />
          <InputContainer>
            <Textarea
              ref={textareaRef}
              variant="borderless"
              disabled={isLoading}
              value={painting.prompt}
              spellCheck={false}
              onChange={(e) => updatePaintingState({ prompt: e.target.value })}
              placeholder={
                isTranslating
                  ? t('paintings.translating')
                  : painting.model?.startsWith('imagen-')
                    ? t('paintings.prompt_placeholder_en')
                    : t('paintings.prompt_placeholder_edit')
              }
              onKeyDown={handleKeyDown}
            />
            <Toolbar>
              <ToolbarMenu>
                <TranslateButton
                  text={textareaRef.current?.resizableTextArea?.textArea?.value}
                  onTranslated={(translatedText) => updatePaintingState({ prompt: translatedText })}
                  disabled={isLoading || isTranslating}
                  isLoading={isTranslating}
                  style={{ marginRight: 6, borderRadius: '50%' }}
                />
                <SendMessageButton sendMessage={onGenerate} disabled={isLoading || !painting.model || isPromptEmpty} />
              </ToolbarMenu>
            </Toolbar>
          </InputContainer>
        </MainContainer>
        <PaintingsList
          namespace={mode}
          paintings={filteredPaintings}
          selectedPainting={painting}
          onSelectPainting={onSelectPainting}
          onDeletePainting={onDeletePainting}
          onNewPainting={handleAddPainting}
        />
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
  background-color: var(--color-background);
`

const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 95px;
  max-height: 95px;
  position: relative;
  border: 1px solid var(--color-border-soft);
  transition: all 0.3s ease;
  margin: 0 20px 15px 20px;
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
  justify-content: space-between;
  justify-content: flex-end;
  padding: 0 8px;
  padding-bottom: 0;
  height: 40px;
`

const ToolbarMenu = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
`

const ProviderLogo = styled(Avatar)`
  border: 0.5px solid var(--color-border);
`

const ModeSegmentedContainer = styled.div`
  display: flex;
  justify-content: center;
  padding-top: 24px;
`

const ProviderTitleContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
`

const ImageUploadButton = styled(Upload)`
  & .ant-upload.ant-upload-select {
    width: 100% !important;
    height: 60px !important;
    border: 1px dashed var(--color-border);
  }
`

const ImagePlaceholder = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 100%;
  cursor: pointer;
  gap: 8px;
`

const ImageSizeImage = styled.img<{ theme: string }>`
  filter: ${({ theme }) => (theme === 'dark' ? 'invert(100%)' : 'none')};
  width: 20px;
  height: 20px;
`

export default NewApiPage
