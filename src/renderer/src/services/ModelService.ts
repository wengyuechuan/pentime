import { getStoreProviders } from '@renderer/hooks/useStore'
import type { Model } from '@renderer/types'
import { pick } from 'lodash'

export const getModelUniqId = (m?: Model) => {
  return m?.id ? JSON.stringify(pick(m, ['id', 'provider'])) : ''
}

export const hasModel = (m?: Model) => {
  const allModels = getStoreProviders()
    .filter((p) => p.enabled)
    .map((p) => p.models)
    .flat()

  return allModels.find((model) => model.id === m?.id)
}

export function getModelName(model?: Model) {
  return model?.name || model?.id || ''
}

export function getModelById(modelId: string) {
  const allModels = getStoreProviders()
    .filter((p) => p.enabled)
    .map((p) => p.models)
    .flat()
  return allModels.find((m) => m.id === modelId)
}
