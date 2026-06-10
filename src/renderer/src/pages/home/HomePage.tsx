import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { useAssistants, useDefaultAssistant } from '@renderer/hooks/useAssistant'
import { useNavbarPosition, useSettings } from '@renderer/hooks/useSettings'
import { useShortcut } from '@renderer/hooks/useShortcuts'
import { useShowAssistants, useShowTopics } from '@renderer/hooks/useStore'
import { useActiveTopic } from '@renderer/hooks/useTopic'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import NavigationService from '@renderer/services/NavigationService'
import { newMessagesActions } from '@renderer/store/newMessage'
import type { Assistant, Topic } from '@renderer/types'
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, SECOND_MIN_WINDOW_WIDTH } from '@shared/config/constant'
import { AnimatePresence, motion } from 'motion/react'
import type { FC } from 'react'
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import Chat from './Chat'
import Navbar from './Navbar'
import HomeTabs from './Tabs'

let _activeAssistant: Assistant

const HomePage: FC = () => {
  const { assistants } = useAssistants()
  const { defaultAssistant } = useDefaultAssistant()
  const navigate = useNavigate()
  const { isLeftNavbar } = useNavbarPosition()

  const location = useLocation()
  const state = location.state

  const normalizeAssistant = useCallback(
    (assistant?: Assistant): Assistant => {
      const nextAssistant = assistant || defaultAssistant
      const topics =
        Array.isArray(nextAssistant.topics) && nextAssistant.topics.length > 0
          ? nextAssistant.topics
          : [getDefaultTopic(nextAssistant.id)]

      return topics === nextAssistant.topics ? nextAssistant : { ...nextAssistant, topics }
    },
    [defaultAssistant]
  )

  const [activeAssistant, _setActiveAssistant] = useState<Assistant>(() =>
    normalizeAssistant(state?.assistant || _activeAssistant || assistants[0])
  )
  const safeActiveAssistant = useMemo(
    () => normalizeAssistant(activeAssistant || _activeAssistant || assistants[0]),
    [activeAssistant, assistants, normalizeAssistant]
  )
  const { activeTopic, setActiveTopic: _setActiveTopic } = useActiveTopic(
    safeActiveAssistant.id,
    state?.topic || safeActiveAssistant.topics[0]
  )
  const safeActiveTopic = useMemo(
    () =>
      safeActiveAssistant.topics.find((topic) => topic.id === activeTopic?.id) ||
      safeActiveAssistant.topics[0] ||
      getDefaultTopic(safeActiveAssistant.id),
    [activeTopic, safeActiveAssistant]
  )
  const { showAssistants, showTopics, topicPosition } = useSettings()
  const { setShowAssistants, toggleShowAssistants } = useShowAssistants()
  const { toggleShowTopics } = useShowTopics()
  const dispatch = useDispatch()

  _activeAssistant = safeActiveAssistant

  useShortcut('toggle_show_assistants', () => {
    if (topicPosition === 'right') {
      toggleShowAssistants()
      return
    }

    if (!showAssistants) {
      setShowAssistants(true)
      requestAnimationFrame(() => {
        void EventEmitter.emit(EVENT_NAMES.SHOW_ASSISTANTS)
      })
      return
    }

    void EventEmitter.emit(EVENT_NAMES.SHOW_ASSISTANTS)
  })

  useShortcut('toggle_show_topics', () => {
    if (topicPosition === 'right') {
      toggleShowTopics()
      return
    }

    if (!showAssistants) {
      setShowAssistants(true)
      requestAnimationFrame(() => {
        void EventEmitter.emit(EVENT_NAMES.SHOW_TOPIC_SIDEBAR)
      })
      return
    }

    void EventEmitter.emit(EVENT_NAMES.SHOW_TOPIC_SIDEBAR)
  })

  const setActiveAssistant = useCallback(
    (newAssistant: Assistant) => {
      const normalizedAssistant = normalizeAssistant(newAssistant)
      if (normalizedAssistant.id === safeActiveAssistant.id) return
      startTransition(() => {
        _setActiveAssistant(normalizedAssistant)
        // 同步更新 active topic，避免不必要的重新渲染
        const newTopic = normalizedAssistant.topics[0] || getDefaultTopic(normalizedAssistant.id)
        _setActiveTopic((prev) => (newTopic?.id === prev?.id ? prev : newTopic))
      })
    },
    [_setActiveTopic, normalizeAssistant, safeActiveAssistant.id]
  )

  const setActiveTopic = useCallback(
    (newTopic: Topic) => {
      if (!newTopic?.id) return
      startTransition(() => {
        _setActiveTopic((prev) => (newTopic?.id === prev?.id ? prev : newTopic))
        dispatch(newMessagesActions.setTopicFulfilled({ topicId: newTopic.id, fulfilled: false }))
      })
    },
    [_setActiveTopic, dispatch]
  )

  useEffect(() => {
    NavigationService.setNavigate(navigate)
  }, [navigate])

  useEffect(() => {
    state?.assistant && setActiveAssistant(state?.assistant)
    state?.topic && setActiveTopic(state?.topic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    const canMinimize = topicPosition == 'left' ? !showAssistants : !showAssistants && !showTopics
    void window.api.window.setMinimumSize(canMinimize ? SECOND_MIN_WINDOW_WIDTH : MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)

    return () => {
      void window.api.window.resetMinimumSize()
    }
  }, [showAssistants, showTopics, topicPosition])

  return (
    <Container id="home-page">
      {isLeftNavbar && (
        <Navbar
          activeAssistant={safeActiveAssistant}
          activeTopic={safeActiveTopic}
          setActiveTopic={setActiveTopic}
          setActiveAssistant={setActiveAssistant}
          position="left"
        />
      )}
      <ContentContainer id={isLeftNavbar ? 'content-container' : undefined}>
        <AnimatePresence initial={false}>
          {showAssistants && (
            <ErrorBoundary>
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'var(--assistants-width)', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}>
                <HomeTabs
                  activeAssistant={safeActiveAssistant}
                  activeTopic={safeActiveTopic}
                  setActiveAssistant={setActiveAssistant}
                  setActiveTopic={setActiveTopic}
                  position="left"
                />
              </motion.div>
            </ErrorBoundary>
          )}
        </AnimatePresence>
        <ErrorBoundary>
          <Chat
            assistant={safeActiveAssistant}
            activeTopic={safeActiveTopic}
            setActiveTopic={setActiveTopic}
            setActiveAssistant={setActiveAssistant}
          />
        </ErrorBoundary>
      </ContentContainer>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  [navbar-position='left'] & {
    max-width: calc(100vw - var(--sidebar-width));
  }
  [navbar-position='top'] & {
    max-width: 100vw;
  }
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  overflow: hidden;

  [navbar-position='top'] & {
    max-width: calc(100vw - 12px);
  }
`

export default HomePage
