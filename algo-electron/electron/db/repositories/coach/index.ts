/**
 * Coach repository 统一入口。
 *
 * 包含三个子 repository：
 * - eventsRepository: coach_events 表（事件落库）
 * - interventionsRepository: coach_interventions 表（干预 + 比赛审计）
 * - feedbackRepository: coach_feedback 表（用户反馈）
 *
 * 阶段 2 数据流：
 *   CoachEventBridge → eventsRepository.insertCoachEvent
 *   RuleEngine       → interventionsRepository.insertCoachIntervention
 *   ContestGuard     → interventionsRepository.insertCoachIntervention（source_type='contest_audit'）
 *   CoachFeedbackStore → feedbackRepository.insertCoachFeedback
 *
 * Repository 只通过 getDb() 读写，不做网络请求、不持有 Electron session。
 */

export * from './eventsRepository'
export * from './interventionsRepository'
export * from './feedbackRepository'
