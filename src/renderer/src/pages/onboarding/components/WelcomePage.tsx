import { loggerService } from '@logger'
import PenTimeLogo from '@renderer/assets/images/logo.png'
import { useAppStore } from '@renderer/store'
import { Button, Divider } from 'antd'
import type { FC } from 'react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import type { OnboardingStep } from '../OnboardingPage'
import ProviderPopup from './ProviderPopup'

const logger = loggerService.withContext('WelcomePage')

interface WelcomePageProps {
  setStep: (step: OnboardingStep) => void
  setCherryInLoggedIn: (loggedIn: boolean) => void
}

const WelcomePage: FC<WelcomePageProps> = ({ setStep, setCherryInLoggedIn }) => {
  const { t } = useTranslation()
  const store = useAppStore()

  const handleCherryInLogin = useCallback(async () => {
    try {
      await window.api.openWebsite('https://www.pentime-api.com')
      setCherryInLoggedIn(false)
    } catch (error) {
      logger.error('Failed to open Pen time API website:', error as Error)
    }
  }, [setCherryInLoggedIn])

  const handleSelectProvider = async () => {
    await ProviderPopup.show()
    const hasAvailableProvider = store.getState().llm.providers.some((p) => p.enabled && p.models.length > 0)
    hasAvailableProvider && setStep('select-model')
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <img src={PenTimeLogo} alt="Pen time" className="h-16 w-16 rounded-xl" />

        <div className="flex flex-col items-center gap-2">
          <h1 className="m-0 font-semibold text-(--color-text) text-2xl">{t('onboarding.welcome.title')}</h1>
          <p className="m-0 text-(--color-text-2) text-sm">{t('onboarding.welcome.subtitle')}</p>
        </div>

        <div className="mt-2 flex w-100 flex-col gap-3">
          <Button type="primary" size="large" block className="h-12 rounded-lg" onClick={handleCherryInLogin}>
            {t('onboarding.welcome.login_cherryin')}
          </Button>

          <Divider className="my-1!">
            <span className="text-(--color-text-3) text-xs">{t('onboarding.welcome.or_continue_with')}</span>
          </Divider>

          <Button size="large" block className="h-12 rounded-lg" onClick={handleSelectProvider}>
            {t('onboarding.welcome.other_provider')}
          </Button>
        </div>

        <p className="mt-1 text-(--color-text-3) text-xs">{t('onboarding.welcome.setup_hint')}</p>
      </div>
    </div>
  )
}

export default WelcomePage
