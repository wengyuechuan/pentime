/**
 * BuiltinAgentBootstrap
 *
 * Pen-Time keeps built-in skills available, but does not create Cherry Studio's
 * default Claude agents during startup.
 */
import { loggerService } from '@logger'
import { installBuiltinSkills } from '@main/utils/builtinSkills'

export { CHERRY_ASSISTANT_AGENT_ID } from './BuiltinAgentIds'

const logger = loggerService.withContext('BuiltinAgentBootstrap')

export async function bootstrapBuiltinAgents(): Promise<void> {
  try {
    await installBuiltinSkills()
  } catch (error) {
    logger.error('Failed to install built-in skills', error as Error)
  }

  logger.info('Built-in Cherry agents bootstrap skipped for Pen-Time')
}
