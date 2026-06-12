import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockInstallBuiltinSkills,
  mockInitDefaultCherryClawAgent,
  mockInitBuiltinAgent,
  mockListSessions,
  mockCreateSession,
  mockEnsureHeartbeatTask
} = vi.hoisted(() => ({
  mockInstallBuiltinSkills: vi.fn(),
  mockInitDefaultCherryClawAgent: vi.fn(),
  mockInitBuiltinAgent: vi.fn(),
  mockListSessions: vi.fn(),
  mockCreateSession: vi.fn(),
  mockEnsureHeartbeatTask: vi.fn()
}))

vi.mock('@main/utils/builtinSkills', () => ({
  installBuiltinSkills: mockInstallBuiltinSkills
}))

vi.mock('../../AgentService', () => ({
  agentService: {
    initDefaultCherryClawAgent: mockInitDefaultCherryClawAgent,
    initBuiltinAgent: mockInitBuiltinAgent
  }
}))

vi.mock('../../SessionService', () => ({
  sessionService: {
    listSessions: mockListSessions,
    createSession: mockCreateSession
  }
}))

vi.mock('../../SchedulerService', () => ({
  schedulerService: {
    ensureHeartbeatTask: mockEnsureHeartbeatTask
  }
}))

vi.mock('../BuiltinAgentProvisioner', () => ({
  provisionBuiltinAgent: vi.fn()
}))

describe('bootstrapBuiltinAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.resetModules()
    mockInstallBuiltinSkills.mockResolvedValue(undefined)
    mockListSessions.mockResolvedValue({ total: 0 })
    mockCreateSession.mockResolvedValue({ id: 'session_1' })
    mockEnsureHeartbeatTask.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('installs built-in skills without creating default Cherry agents', async () => {
    const { bootstrapBuiltinAgents } = await import('../BuiltinAgentBootstrap')

    await bootstrapBuiltinAgents()
    await vi.advanceTimersByTimeAsync(60000)

    expect(mockInstallBuiltinSkills).toHaveBeenCalledTimes(1)
    expect(mockInitDefaultCherryClawAgent).not.toHaveBeenCalled()
    expect(mockInitBuiltinAgent).not.toHaveBeenCalled()
    expect(mockListSessions).not.toHaveBeenCalled()
    expect(mockCreateSession).not.toHaveBeenCalled()
    expect(mockEnsureHeartbeatTask).not.toHaveBeenCalled()
  })
})
