import type { GeneratePainting } from '@renderer/types'
import { uuid } from '@renderer/utils'

export const SUPPORTED_MODELS = [
  'gpt-image-1',
  'gpt-image-1.5',
  'gpt-image-2',
  'chatgpt-image-latest',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-3-pro-image-preview'
]

const ONE_TWO_K_ASPECT_SIZES = [
  { value: 'auto', label: 'auto' },
  { value: '1K|1:1', label: '1K 1:1' },
  { value: '1K|16:9', label: '1K 16:9' },
  { value: '1K|9:16', label: '1K 9:16' },
  { value: '2K|1:1', label: '2K 1:1' },
  { value: '2K|16:9', label: '2K 16:9' },
  { value: '2K|9:16', label: '2K 9:16' }
]

const GPT_IMAGE_2_SIZES = [
  { value: '1024x1024', label: '1024x1024' },
  { value: '1536x1024', label: '1536x1024' },
  { value: '1024x1536', label: '1024x1536' },
  { value: '2048x2048', label: '2K 2048x2048' },
  { value: '2048x1152', label: '2K 2048x1152' },
  { value: '3840x2160', label: '4K 3840x2160' },
  { value: '2160x3840', label: '4K 2160x3840' },
  { value: 'auto', label: 'auto' }
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

export const MODELS = [
  {
    name: 'gpt-image-1',
    group: 'OpenAI',
    imageSizes: [{ value: 'auto' }, { value: '1024x1024' }, { value: '1536x1024' }, { value: '1024x1536' }],
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
    imageSizes: [{ value: 'auto' }, { value: '1024x1024' }, { value: '1536x1024' }, { value: '1024x1536' }],
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
    imageSizes: GPT_IMAGE_2_SIZES,
    max_images: 1,
    quality: GPT_IMAGE_2_QUALITY,
    output_compression_format: [{ value: 'jpeg' }, { value: 'webp' }],
    output_format: [{ value: 'image/png' }, { value: 'image/jpeg' }, { value: 'image/webp' }],
    background: GPT_IMAGE_BACKGROUND
  },
  {
    name: 'gemini-2.5-flash-image',
    group: 'Gemini',
    imageSizes: ONE_TWO_K_ASPECT_SIZES,
    max_images: 4
  },
  {
    name: 'gemini-2.5-flash-image-preview',
    group: 'Gemini',
    imageSizes: ONE_TWO_K_ASPECT_SIZES,
    max_images: 4
  },
  {
    name: 'gemini-3-pro-image-preview',
    group: 'Gemini',
    imageSizes: ONE_TWO_K_ASPECT_SIZES,
    max_images: 4
  }
]

export function getNewApiModelConfig(model?: string) {
  if (!model) {
    return MODELS[0]
  }

  return (
    MODELS.find((m) => m.name === model) ||
    (model.includes('gpt-image-2') ? MODELS.find((m) => m.name === 'gpt-image-2') : undefined) ||
    (model.includes('chatgpt-image') ? MODELS.find((m) => m.name === 'chatgpt-image-latest') : undefined) ||
    (model.includes('gemini') && model.includes('image')
      ? MODELS.find((m) => m.name === 'gemini-3-pro-image-preview')
      : undefined) ||
    MODELS[0]
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
  return normalizedModel.includes('gpt-image-2') || normalizedModel.includes('chatgpt-image')
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
