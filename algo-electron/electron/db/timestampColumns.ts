import type { LegacyTimestampPolicy } from '../shared/legacyTimestamp'

interface TimestampTable {
  readonly columns: readonly string[]
  readonly policy: LegacyTimestampPolicy
}

/** Only application-owned instants; day keys, run_at and HTTP validators remain strings. */
export const TIMESTAMP_COLUMNS: Readonly<Record<string, TimestampTable>> = {
  activity_events: {
    columns: ['occurred_at', 'created_at', 'updated_at', 'deleted_at'],
    policy: 'local',
  },
  ai_context_snapshots: { columns: ['created_at', 'updated_at', 'deleted_at'], policy: 'local' },
  ai_outputs: { columns: ['created_at', 'updated_at', 'deleted_at'], policy: 'local' },
  coach_events: { columns: ['created_at'], policy: 'local' },
  coach_feedback: { columns: ['created_at'], policy: 'local' },
  coach_interventions: { columns: ['created_at', 'contest_start', 'contest_end'], policy: 'local' },
  contest_results: {
    columns: ['contest_at', 'created_at', 'updated_at', 'deleted_at'],
    policy: 'local',
  },
  cookie_records: {
    columns: ['expires_at', 'last_seen_at', 'created_at', 'updated_at'],
    policy: 'local',
  },
  notes: { columns: ['created_at', 'updated_at', 'deleted_at'], policy: 'local' },
  platform_accounts: {
    columns: ['last_synced_at', 'created_at', 'updated_at', 'deleted_at'],
    policy: 'local',
  },
  problem_visits: {
    columns: ['entered_at', 'left_at', 'created_at', 'updated_at', 'deleted_at'],
    policy: 'local',
  },
  problems: {
    columns: [
      'first_seen_at',
      'last_visited_at',
      'first_solved_at',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
    policy: 'local',
  },
  rating_history: {
    columns: ['contest_at', 'created_at', 'updated_at', 'deleted_at'],
    policy: 'local',
  },
  schema_migrations: { columns: ['applied_at'], policy: 'local' },
  site_configs: { columns: ['created_at', 'updated_at', 'deleted_at'], policy: 'local' },
  site_credentials: {
    columns: ['last_used_at', 'created_at', 'updated_at', 'deleted_at'],
    policy: 'utc8',
  },
  study_sessions: {
    columns: ['started_at', 'ended_at', 'created_at', 'updated_at', 'deleted_at'],
    policy: 'local',
  },
  submissions: {
    columns: ['submitted_at', 'created_at', 'updated_at', 'deleted_at'],
    policy: 'local',
  },
  sync_queue: { columns: ['created_at', 'synced_at'], policy: 'local' },
  user_daily_stats: {
    columns: ['recomputed_at', 'created_at', 'updated_at', 'deleted_at'],
    policy: 'local',
  },
  user_script_host_permissions: {
    columns: ['granted_at', 'last_used_at', 'revoked_at'],
    policy: 'utc8',
  },
  user_script_resources: { columns: ['fetched_at', 'created_at', 'updated_at'], policy: 'utc8' },
  user_script_update_state: {
    columns: ['last_checked_at', 'next_check_at', 'updated_at'],
    policy: 'utc8',
  },
  user_script_values: { columns: ['created_at', 'updated_at'], policy: 'utc8' },
  user_scripts: { columns: ['created_at', 'updated_at', 'deleted_at'], policy: 'utc8' },
}
