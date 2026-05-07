export { getOpenAIClient, isAiEnabled }          from './client'
export { makeCacheKey, getCached, setCached }    from './cache'
export { logUsage, checkBudget, getUsageSummary } from './usage'
export {
  generateEmailDraft, generateSubjectLines,
  generateFollowUp, generateLeadSummary, generateBatchEmail,
} from './tasks'
export type {
  AiModel, AiTask, AiTone, DraftEmailResult, SubjectLineResult,
  FollowUpResult, LeadSummaryResult, BatchJob, AiUsageLog, UsageSummary,
  TASK_MODELS,
} from './types'
