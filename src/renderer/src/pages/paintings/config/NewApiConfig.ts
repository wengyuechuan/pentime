import type { GeneratePainting } from '@renderer/types'
import { uuid } from '@renderer/utils'

type NewApiOption = {
  value: string
  label?: string
}

type NewApiModelConfig = {
  name: string
  group: string
  imageSizes?: NewApiOption[]
  max_images: number
  quality?: NewApiOption[]
  moderation?: NewApiOption[]
  output_compression_format?: NewApiOption[]
  output_format?: NewApiOption[]
  background?: NewApiOption[]
}

export const SUPPORTED_MODELS = [
  'gpt-image-1',
  'gpt-image-1.5',
  'gpt-image-2',
  'gpt-image-v2',
  'chatgpt-image-latest',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-3-pro-image-preview'
]

const GPT_IMAGE_2_SIZES = [
  { value: 'auto', label: 'Auto[自动]' },
  { value: '1024x1024', label: '1024x1024' },
  { value: '1536x1024', label: '1536x1024' },
  { value: '1024x1536', label: '1024x1536' },
  { value: '2048x2048', label: '2K 2048x2048' },
  { value: '2048x1152', label: '2K 2048x1152' },
  { value: '1152x2048', label: '2K 1152x2048' },
  { value: '3840x2160', label: '4K 3840x2160' },
  { value: '2160x3840', label: '4K 2160x3840' }
]

const GPT_IMAGE_QUALITY = [{ value: 'auto' }, { value: 'high' }, { value: 'medium' }, { value: 'low' }]
const GPT_IMAGE_2_QUALITY = [
  { value: 'auto' },
  { value: 'medium' },
  { value: 'standard' },
  { value: 'high' },
  { value: 'hd' }
]
const GPT_IMAGE_MODERATION = [{ value: 'auto' }, { value: 'low' }]
const GPT_IMAGE_BACKGROUND = [{ value: 'auto' }, { value: 'transparent' }, { value: 'opaque' }]

export const MODELS: NewApiModelConfig[] = [
  {
    name: 'gpt-image-1',
    group: 'OpenAI',
    max_images: 10,
    quality: GPT_IMAGE_QUALITY,
    moderation: GPT_IMAGE_MODERATION,
    output_compression_format: [{ value: 'jpeg' }, { value: 'webp' }],
    output_format: [{ value: 'image/png' }, { value: 'image/jpeg' }, { value: 'image/webp' }],
    background: GPT_IMAGE_BACKGROUND
  },
  {
    name: 'gpt-image-1.5',
    group: 'OpenAI',
    max_images: 10,
    quality: GPT_IMAGE_QUALITY,
    moderation: GPT_IMAGE_MODERATION,
    output_compression_format: [{ value: 'jpeg' }, { value: 'webp' }],
    output_format: [{ value: 'image/png' }, { value: 'image/jpeg' }, { value: 'image/webp' }],
    background: GPT_IMAGE_BACKGROUND
  },
  {
    name: 'gpt-image-2',
    group: 'OpenAI',
    imageSizes: GPT_IMAGE_2_SIZES,
    max_images: 1,
    quality: GPT_IMAGE_2_QUALITY,
    output_compression_format: [{ value: 'jpeg' }, { value: 'webp' }],
    output_format: [{ value: 'image/png' }, { value: 'image/jpeg' }, { value: 'image/webp' }],
    background: GPT_IMAGE_BACKGROUND
  },
  {
    name: 'chatgpt-image-latest',
    group: 'OpenAI',
    max_images: 1,
    quality: GPT_IMAGE_2_QUALITY,
    output_compression_format: [{ value: 'jpeg' }, { value: 'webp' }],
    output_format: [{ value: 'image/png' }, { value: 'image/jpeg' }, { value: 'image/webp' }],
    background: GPT_IMAGE_BACKGROUND
  },
  {
    name: 'gemini-2.5-flash-image',
    group: 'Gemini',
    max_images: 4
  },
  {
    name: 'gemini-2.5-flash-image-preview',
    group: 'Gemini',
    max_images: 4
  },
  {
    name: 'gemini-3-pro-image-preview',
    group: 'Gemini',
    max_images: 4
  }
]

const DEFAULT_MODEL_CONFIG: NewApiModelConfig = {
  name: 'custom-image-model',
  group: 'Custom',
  max_images: 1
}

export function getNewApiModelConfig(model?: string) {
  if (!model) {
    return DEFAULT_MODEL_CONFIG
  }

  const normalizedModel = model.toLowerCase()

  return (
    MODELS.find((m) => m.name === model) ||
    (isNewApiImageSizeModel(model) ? MODELS.find((m) => m.name === 'gpt-image-2') : undefined) ||
    (normalizedModel.includes('chatgpt-image') ? MODELS.find((m) => m.name === 'chatgpt-image-latest') : undefined) ||
    (normalizedModel.includes('gemini') && normalizedModel.includes('image')
      ? MODELS.find((m) => m.name === 'gemini-3-pro-image-preview')
      : undefined) ||
    DEFAULT_MODEL_CONFIG
  )
}

export function parseNewApiImageSize(value?: string) {
  if (!value) {
    return { size: undefined, aspectRatio: undefined }
  }

  const [size, aspectRatio] = value.split('|')
  return { size, aspectRatio }
}

export function isNewApiGptImage2Model(model?: string) {
  if (!model) {
    return false
  }

  const normalizedModel = model.toLowerCase()
  return (
    normalizedModel.includes('gpt-image-2') ||
    normalizedModel.includes('gpt-image-v2') ||
    normalizedModel.includes('chatgpt-image')
  )
}

export function isNewApiImageSizeModel(model?: string) {
  if (!model) {
    return false
  }

  const normalizedModel = model.toLowerCase()
  return normalizedModel === 'gpt-image-2'
}

export const DEFAULT_PAINTING: GeneratePainting = {
  id: uuid(),
  urls: [],
  files: [],
  model: '',
  prompt: '',
  quality: 'auto',
  n: 1,
  background: 'auto',
  moderation: 'auto',
  size: 'auto'
}
