import type { Model } from '@renderer/types'
import { describe, expect, it } from 'vitest'

import {
  getPentimeNewApiVideoFallbackModels,
  isPentimeNewApiHost,
  isSeedVideoGenerationModel,
  isSeedVisionVideoGenerationModel,
  isVideoGenerationModel,
  shouldUsePentimeModelCatalog,
  shouldUsePentimeNewApiVideoFallback
} from '../video'

const createModel = (model: Partial<Model> & Pick<Model, 'id'>): Model =>
  ({
    provider: 'new-api',
    group: 'new-api',
    name: model.id,
    ...model
  }) as Model

describe('isVideoGenerationModel', () => {
  it('identifies seed-2 video models returned as openai endpoint models', () => {
    expect(isVideoGenerationModel(createModel({ id: 'seed-2', endpoint_type: 'openai' }))).toBe(true)
    expect(isVideoGenerationModel(createModel({ id: 'seed-2-1080', endpoint_type: 'openai' }))).toBe(true)
    expect(isVideoGenerationModel(createModel({ id: 'seed-2-4k', endpoint_type: 'openai' }))).toBe(true)
    expect(isVideoGenerationModel(createModel({ id: 'seed-2-fast', endpoint_type: 'openai' }))).toBe(true)
    expect(isVideoGenerationModel(createModel({ id: 'seed-2-fast-vision', endpoint_type: 'openai' }))).toBe(true)
    expect(isVideoGenerationModel(createModel({ id: 'seed-2-mini', endpoint_type: 'openai' }))).toBe(true)
    expect(isSeedVideoGenerationModel('seed-2-mini-vision')).toBe(true)
    expect(isSeedVisionVideoGenerationModel('seed-2-mini-vision')).toBe(true)
    expect(isSeedVisionVideoGenerationModel('seed-2-mini')).toBe(false)
  })

  it('identifies seedance video models', () => {
    expect(isVideoGenerationModel(createModel({ id: 'doubao-seedance-2-0-260128' }))).toBe(true)
  })

  it('does not identify image or chat seed models as video models', () => {
    expect(isVideoGenerationModel(createModel({ id: 'seedream-4.0-draw' }))).toBe(false)
    expect(isVideoGenerationModel(createModel({ id: 'doubao-seed-2-0-pro-260215' }))).toBe(false)
  })

  it('provides Pen-Time New API seed video fallback models only for Pen-Time hosts', () => {
    expect(isPentimeNewApiHost('https://www.pentime-api.com')).toBe(true)
    expect(isPentimeNewApiHost('https://api.siivsd.com')).toBe(true)
    expect(isPentimeNewApiHost('https://example.com')).toBe(false)
    expect(
      shouldUsePentimeNewApiVideoFallback({
        id: 'new-api',
        type: 'new-api',
        name: 'Pen time',
        apiKey: 'test',
        apiHost: 'https://www.pentime-api.com',
        models: []
      })
    ).toBe(true)
    expect(
      shouldUsePentimeModelCatalog({
        id: 'custom-pentime',
        type: 'openai',
        name: 'Pen time compatible',
        apiKey: 'test',
        apiHost: 'https://www.pentime-api.com',
        models: []
      })
    ).toBe(true)
    expect(getPentimeNewApiVideoFallbackModels('new-api').map((model) => model.id)).toEqual([
      'seed-2',
      'seed-2-1080',
      'seed-2-4k',
      'seed-2-fast',
      'seed-2-fast-vision',
      'seed-2-mini',
      'seed-2-mini-vision',
      'seed-2-vision-4k'
    ])
  })
})
