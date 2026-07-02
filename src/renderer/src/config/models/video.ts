import type { Model, Provider } from '@renderer/types'

const VIDEO_MODEL_PATTERN = /\bveo\b|veo-|gemini.*video|video|\u89c6\u9891|\u97f3\u89c6\u9891/i
const SEED_VIDEO_MODEL_PATTERN = /(^|\s)(?:seed-2(?:$|[\s-])|[\w.-]*seedance[\w.-]*)/i
const SEED_VISION_VIDEO_MODEL_PATTERN =
  /(^|\s)(?:[\w.-]*seed-2[\w.-]*vision[\w.-]*|[\w.-]*seedance[\w.-]*vision[\w.-]*)/i

const PENTIME_NEW_API_HOSTS = ['pentime-api.com', 'api.siivsd.com']

export const PENTIME_NEW_API_VIDEO_MODELS: Model[] = [
  'seed-2',
  'seed-2-1080',
  'seed-2-4k',
  'seed-2-fast',
  'seed-2-fast-vision',
  'seed-2-mini',
  'seed-2-mini-vision',
  'seed-2-vision-4k'
].map((id) => ({
  id,
  name: id,
  provider: 'new-api',
  group: '\u89c6\u9891',
  endpoint_type: 'video-generation',
  supported_endpoint_types: ['video-generation']
}))

export const isPentimeNewApiHost = (apiHost?: string) => {
  if (!apiHost) return false

  try {
    const hostname = new URL(apiHost).hostname.toLowerCase()
    return PENTIME_NEW_API_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return PENTIME_NEW_API_HOSTS.some((host) => apiHost.toLowerCase().includes(host))
  }
}

export const shouldUsePentimeModelCatalog = (provider?: Provider) => {
  if (!provider || !isPentimeNewApiHost(provider.apiHost)) return false
  return (
    provider.id === 'new-api' ||
    provider.type === 'new-api' ||
    provider.type === 'openai' ||
    provider.type === 'openai-response'
  )
}

export const shouldUsePentimeNewApiVideoFallback = (provider?: Provider) => shouldUsePentimeModelCatalog(provider)

export const getPentimeNewApiVideoFallbackModels = (providerId = 'new-api') =>
  PENTIME_NEW_API_VIDEO_MODELS.map((model) => ({ ...model, provider: providerId }))

export const isSeedVideoGenerationModel = (model: Model | string) => {
  const value =
    typeof model === 'string'
      ? model.toLowerCase()
      : `${model.id} ${model.name} ${model.group} ${model.description ?? ''}`.toLowerCase()

  return SEED_VIDEO_MODEL_PATTERN.test(value)
}

export const isSeedVisionVideoGenerationModel = (model: Model | string) => {
  const value =
    typeof model === 'string'
      ? model.toLowerCase()
      : `${model.id} ${model.name} ${model.group} ${model.description ?? ''}`.toLowerCase()

  return SEED_VISION_VIDEO_MODEL_PATTERN.test(value)
}

export const isVideoGenerationModel = (model: Model) => {
  const endpointTypes = model.supported_endpoint_types?.map((type) => String(type)) ?? []
  const endpointType = String(model.endpoint_type ?? '')
  const value = `${model.id} ${model.name} ${model.group} ${model.description ?? ''}`.toLowerCase()

  return (
    endpointType === 'video-generation' ||
    endpointTypes.includes('video-generation') ||
    endpointTypes.includes('videos') ||
    VIDEO_MODEL_PATTERN.test(value) ||
    isSeedVideoGenerationModel(model)
  )
}
