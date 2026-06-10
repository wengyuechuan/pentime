import { loggerService } from '@logger'
import { useAllProviders } from '@renderer/hooks/useProvider'
import { useAppDispatch } from '@renderer/store'
import { setDefaultPaintingProvider } from '@renderer/store/settings'
import { updateTab } from '@renderer/store/tabs'
import type { PaintingProvider, SystemProviderId } from '@renderer/types'
import { isNewApiProvider } from '@renderer/utils/provider'
import type { FC } from 'react'
import { useEffect, useMemo } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'

import NewApiPage from './NewApiPage'

const logger = loggerService.withContext('PaintingsRoutePage')

const BASE_OPTIONS: SystemProviderId[] = []

const PaintingsRoutePage: FC = () => {
  const params = useParams()
  const provider = params['*']
  const dispatch = useAppDispatch()
  const providers = useAllProviders()

  const Options = useMemo(() => [...BASE_OPTIONS, ...providers.filter(isNewApiProvider).map((p) => p.id)], [providers])
  const newApiProviders = useMemo(() => providers.filter(isNewApiProvider), [providers])

  const validOptions = Options

  useEffect(() => {
    logger.debug(`defaultPaintingProvider: ${provider}`)
    if (provider && validOptions.includes(provider)) {
      dispatch(setDefaultPaintingProvider(provider as PaintingProvider))
      dispatch(updateTab({ id: 'paintings', updates: { path: `/paintings/${provider}` } }))
    }
  }, [provider, dispatch, validOptions])

  return (
    <Routes>
      <Route path="/new-api" element={<NewApiPage Options={validOptions} />} />
      {/* new-api family providers are mounted dynamically below */}
      {newApiProviders.map((p) => (
        <Route key={p.id} path={`/${p.id}`} element={<NewApiPage Options={validOptions} />} />
      ))}
      <Route path="*" element={<NewApiPage Options={validOptions} />} />
    </Routes>
  )
}

export default PaintingsRoutePage
