import { sql } from 'drizzle-orm'
import {
  blob,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// Mirrors the schema produced by migrations 001-030. Do not add new defaults or constraints.
// Table-level primary keys preserve the legacy SQLite nullable PRIMARY KEY declarations.

export const activityEvents = sqliteTable(
  'activity_events',
  {
    id: text('id'),
    event_type: text('event_type').notNull(),
    occurred_at: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    local_day: text('local_day').notNull(),
    session_id: text('session_id'),
    problem_id: text('problem_id'),
    platform: text('platform'),
    url: text('url'),
    payload_json: text('payload_json'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('idx_ae_local_day').on(table.local_day),
    index('idx_ae_problem').on(table.problem_id),
    index('idx_ae_time').on(table.occurred_at),
    index('idx_ae_type_time').on(table.event_type, table.occurred_at),
  ],
)

export const aiContextSnapshots = sqliteTable(
  'ai_context_snapshots',
  {
    id: text('id'),
    snapshot_date: text('snapshot_date').notNull(),
    context_json: text('context_json').notNull(),
    schema_version: integer('schema_version').notNull(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique('ai_context_snapshots_snapshot_date_unique').on(table.snapshot_date),
    uniqueIndex('snapshots_date_unique').on(table.snapshot_date),
  ],
)

export const aiOutputs = sqliteTable(
  'ai_outputs',
  {
    id: text('id'),
    output_type: text('output_type').notNull(),
    title: text('title'),
    content: text('content').notNull(),
    content_markdown: text('content_markdown'),
    input_summary_json: text('input_summary_json'),
    source_refs_json: text('source_refs_json'),
    model_info_json: text('model_info_json'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('ai_outputs_created_idx').on(sql`${table.created_at} desc`),
    index('ai_outputs_type_idx').on(table.output_type),
  ],
)

export const coachEvents = sqliteTable(
  'coach_events',
  {
    event_id: text('event_id'),
    session_id: text('session_id'),
    event_type: text('event_type').notNull(),
    severity: text('severity').notNull(),
    score: integer('score').notNull(),
    problem_id: text('problem_id'),
    platform: text('platform'),
    evidence_json: text('evidence_json'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.event_id] }),
    index('coach_events_created_idx').on(sql`${table.created_at} desc`),
    index('coach_events_problem_idx').on(table.problem_id),
    index('coach_events_session_idx').on(table.session_id),
    index('coach_events_type_idx').on(table.event_type),
  ],
)

export const coachFeedback = sqliteTable(
  'coach_feedback',
  {
    feedback_id: text('feedback_id'),
    intervention_id: text('intervention_id'),
    bubble_id: text('bubble_id'),
    feedback_type: text('feedback_type').notNull(),
    event_type: text('event_type'),
    problem_id: text('problem_id'),
    local_day: text('local_day').notNull(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.feedback_id] }),
    index('coach_feedback_day_idx').on(table.local_day),
    index('coach_feedback_intervention_idx').on(table.intervention_id),
    index('coach_feedback_type_idx').on(table.feedback_type),
  ],
)

export const coachInterventions = sqliteTable(
  'coach_interventions',
  {
    intervention_id: text('intervention_id'),
    event_id: text('event_id'),
    trigger_reason: text('trigger_reason').notNull(),
    intervention_level: integer('intervention_level').notNull(),
    source_type: text('source_type').notNull(),
    message: text('message').notNull(),
    related_tags_json: text('related_tags_json'),
    user_action: text('user_action').notNull(),
    problem_id: text('problem_id'),
    platform: text('platform'),
    session_id: text('session_id'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    is_contest_mode: integer('is_contest_mode')
      .notNull()
      .default(sql`0`),
    contest_url: text('contest_url'),
    contest_start: integer('contest_start', { mode: 'timestamp_ms' }),
    contest_end: integer('contest_end', { mode: 'timestamp_ms' }),
    zero_intervention: integer('zero_intervention')
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    primaryKey({ columns: [table.intervention_id] }),
    index('coach_interventions_contest_idx').on(table.is_contest_mode, table.contest_url),
    index('coach_interventions_created_idx').on(sql`${table.created_at} desc`),
    index('coach_interventions_event_idx').on(table.event_id),
    index('coach_interventions_source_idx').on(table.source_type),
  ],
)

export const contestResults = sqliteTable(
  'contest_results',
  {
    id: text('id'),
    platform: text('platform').notNull(),
    contest_id: text('contest_id').notNull(),
    contest_name: text('contest_name'),
    account_id: text('account_id'),
    rank: integer('rank'),
    solved_count: integer('solved_count'),
    penalty: integer('penalty'),
    rating_delta: integer('rating_delta'),
    contest_at: integer('contest_at', { mode: 'timestamp_ms' }),
    raw_json: text('raw_json'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('idx_contest_results_account_time').on(table.account_id, table.contest_at),
    uniqueIndex('idx_contest_results_unique').on(
      table.platform,
      table.contest_id,
      table.account_id,
    ),
  ],
)

export const cookieRecords = sqliteTable(
  'cookie_records',
  {
    id: text('id'),
    site_id: text('site_id').notNull(),
    domain: text('domain').notNull(),
    name: text('name').notNull(),
    value_encrypted: text('value_encrypted'),
    expires_at: integer('expires_at', { mode: 'timestamp_ms' }),
    http_only: integer('http_only')
      .notNull()
      .default(sql`0`),
    secure: integer('secure')
      .notNull()
      .default(sql`0`),
    same_site: text('same_site'),
    last_seen_at: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    purpose: text('purpose'),
    sync_excluded: integer('sync_excluded')
      .notNull()
      .default(sql`1`),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique('cookie_records_site_id_domain_name_unique').on(table.site_id, table.domain, table.name),
    index('cookie_records_domain_idx').on(table.domain),
    index('cookie_records_expires_at_idx').on(table.expires_at),
    index('cookie_records_site_idx').on(table.site_id),
  ],
)

export const notes = sqliteTable(
  'notes',
  {
    id: text('id'),
    problem_id: text('problem_id'),
    title: text('title').notNull(),
    file_path: text('file_path').notNull(),
    note_type: text('note_type')
      .notNull()
      .default(sql`'solution'`),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    content: text('content')
      .notNull()
      .default(sql`''`),
    word_count: integer('word_count')
      .notNull()
      .default(sql`0`),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('notes_problem').on(table.problem_id),
    index('notes_updated_at').on(table.updated_at),
  ],
)

export const platformAccounts = sqliteTable(
  'platform_accounts',
  {
    id: text('id'),
    platform: text('platform').notNull(),
    handle: text('handle').notNull(),
    display_name: text('display_name'),
    current_rating: integer('current_rating'),
    peak_rating: integer('peak_rating'),
    last_synced_at: integer('last_synced_at', { mode: 'timestamp_ms' }),
    raw_json: text('raw_json'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex('idx_platform_accounts_handle').on(table.platform, table.handle),
  ],
)

export const problems = sqliteTable(
  'problems',
  {
    id: text('id'),
    platform: text('platform').notNull(),
    platform_problem_id: text('platform_problem_id').notNull(),
    canonical_url: text('canonical_url').notNull(),
    title: text('title'),
    status: text('status')
      .notNull()
      .default(sql`'unknown'`),
    contest_id: text('contest_id'),
    problem_index: text('problem_index'),
    source_platform: text('source_platform'),
    source_problem_id: text('source_problem_id'),
    difficulty: text('difficulty'),
    tags_json: text('tags_json'),
    first_seen_at: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    last_visited_at: integer('last_visited_at', { mode: 'timestamp_ms' }),
    first_solved_at: integer('first_solved_at', { mode: 'timestamp_ms' }),
    extra_json: text('extra_json'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('idx_problems_last_visited').on(table.last_visited_at),
    uniqueIndex('idx_problems_platform_id').on(table.platform, table.platform_problem_id),
    index('idx_problems_source').on(table.source_platform, table.source_problem_id),
    index('idx_problems_status').on(table.status),
  ],
)

export const problemVisits = sqliteTable(
  'problem_visits',
  {
    id: text('id'),
    problem_id: text('problem_id')
      .notNull()
      .references(() => problems.id),
    session_id: text('session_id'),
    platform: text('platform').notNull(),
    url: text('url').notNull(),
    entered_at: integer('entered_at', { mode: 'timestamp_ms' }).notNull(),
    left_at: integer('left_at', { mode: 'timestamp_ms' }),
    duration_seconds: integer('duration_seconds'),
    active_seconds: integer('active_seconds'),
    leave_reason: text('leave_reason'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('idx_pv_entered').on(table.entered_at),
    index('idx_pv_problem_time').on(table.problem_id, table.entered_at),
    index('idx_pv_session').on(table.session_id),
  ],
)

export const ratingHistory = sqliteTable(
  'rating_history',
  {
    id: text('id'),
    account_id: text('account_id').notNull(),
    platform: text('platform').notNull(),
    contest_id: text('contest_id'),
    contest_name: text('contest_name'),
    rank: integer('rank'),
    rating_before: integer('rating_before'),
    rating_after: integer('rating_after'),
    delta: integer('delta'),
    contest_at: integer('contest_at', { mode: 'timestamp_ms' }),
    raw_json: text('raw_json'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('idx_rating_history_account_time').on(table.account_id, table.contest_at),
    uniqueIndex('idx_rating_history_unique').on(table.platform, table.account_id, table.contest_id),
  ],
)

export const schemaMigrations = sqliteTable(
  'schema_migrations',
  {
    version: integer('version'),
    name: text('name').notNull(),
    applied_at: integer('applied_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.version] })],
)

export const siteConfigs = sqliteTable(
  'site_configs',
  {
    id: text('id'),
    name: text('name').notNull(),
    domains_json: text('domains_json').notNull(),
    home_url: text('home_url').notNull(),
    enabled: integer('enabled')
      .notNull()
      .default(sql`1`),
    problem_url_patterns_json: text('problem_url_patterns_json'),
    submit_url_patterns_json: text('submit_url_patterns_json'),
    cookie_policy: text('cookie_policy'),
    adapter: text('adapter'),
    is_builtin: integer('is_builtin')
      .notNull()
      .default(sql`0`),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
    login_url_patterns_json: text('login_url_patterns_json'),
    login_username_selectors_json: text('login_username_selectors_json'),
    login_password_selectors_json: text('login_password_selectors_json'),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('idx_site_configs_enabled').on(table.enabled),
  ],
)

export const siteCredentials = sqliteTable(
  'site_credentials',
  {
    id: text('id'),
    site_id: text('site_id')
      .notNull()
      .references(() => siteConfigs.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    secret_envelope: text('secret_envelope'),
    last_used_at: integer('last_used_at', { mode: 'timestamp_ms' }),
    sync_excluded: integer('sync_excluded')
      .notNull()
      .default(sql`1`),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
    display_name: text('display_name'),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique('site_credentials_site_id_username_unique').on(table.site_id, table.username),
    index('site_credentials_active_site_idx').on(table.site_id, table.deleted_at),
    index('site_credentials_last_used_idx').on(sql`${table.last_used_at} desc`),
    check('site_credentials_check_1', sql`sync_excluded = 1`),
    check(
      'site_credentials_check_2',
      sql`(deleted_at IS NULL AND secret_envelope IS NOT NULL AND json_valid(secret_envelope) = 1 AND json_extract(secret_envelope, '$.version') = 1 AND json_extract(secret_envelope, '$.provider') = 'electron-safe-storage') OR (deleted_at IS NOT NULL AND secret_envelope IS NULL)`,
    ),
  ],
)

export const studySessions = sqliteTable(
  'study_sessions',
  {
    id: text('id'),
    started_at: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    ended_at: integer('ended_at', { mode: 'timestamp_ms' }),
    duration_seconds: integer('duration_seconds'),
    active_seconds: integer('active_seconds'),
    main_platform: text('main_platform'),
    end_reason: text('end_reason'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('idx_ss_ended').on(table.ended_at),
    index('idx_ss_started').on(table.started_at),
  ],
)

export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id'),
    problem_id: text('problem_id').references(() => problems.id),
    platform: text('platform').notNull(),
    platform_submission_id: text('platform_submission_id').notNull(),
    verdict: text('verdict').notNull(),
    raw_verdict: text('raw_verdict'),
    language: text('language'),
    submitted_at: integer('submitted_at', { mode: 'timestamp_ms' }).notNull(),
    is_first_ac: integer('is_first_ac')
      .notNull()
      .default(sql`0`),
    runtime_ms: integer('runtime_ms'),
    memory_kb: integer('memory_kb'),
    source_url: text('source_url'),
    raw_json: text('raw_json'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex('idx_submissions_platform_id').on(table.platform, table.platform_submission_id),
    index('idx_submissions_problem_time').on(table.problem_id, table.submitted_at),
    index('idx_submissions_submitted_at').on(table.submitted_at),
    index('idx_submissions_verdict').on(table.verdict),
  ],
)

export const syncQueue = sqliteTable(
  'sync_queue',
  {
    id: text('id'),
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    operation: text('operation').notNull(),
    status: text('status')
      .notNull()
      .default(sql`'pending'`),
    payload_hash: text('payload_hash'),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    synced_at: integer('synced_at', { mode: 'timestamp_ms' }),
    error_message: text('error_message'),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex('sync_queue_entity_operation_created_idx').on(
      table.entity_type,
      table.entity_id,
      table.operation,
      table.created_at,
    ),
    index('sync_queue_status_created_idx').on(table.status, table.created_at),
  ],
)

export const userDailyStats = sqliteTable(
  'user_daily_stats',
  {
    local_day: text('local_day'),
    active_seconds: integer('active_seconds')
      .notNull()
      .default(sql`0`),
    duration_seconds: integer('duration_seconds')
      .notNull()
      .default(sql`0`),
    visited_problem_count: integer('visited_problem_count')
      .notNull()
      .default(sql`0`),
    solved_problem_count: integer('solved_problem_count')
      .notNull()
      .default(sql`0`),
    submission_count: integer('submission_count')
      .notNull()
      .default(sql`0`),
    ac_submission_count: integer('ac_submission_count')
      .notNull()
      .default(sql`0`),
    platform_distribution_json: text('platform_distribution_json'),
    recomputed_at: integer('recomputed_at', { mode: 'timestamp_ms' }),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.local_day] }),
    index('idx_user_daily_stats_recomputed').on(table.recomputed_at),
  ],
)

export const userScripts = sqliteTable(
  'user_scripts',
  {
    id: text('id'),
    name: text('name').notNull(),
    description: text('description'),
    version: text('version'),
    match_urls_json: text('match_urls_json').notNull(),
    code: text('code').notNull(),
    enabled: integer('enabled')
      .notNull()
      .default(sql`1`),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    file_path: text('file_path'),
    site_ids_json: text('site_ids_json').default(sql`'[]'`),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
    namespace: text('namespace'),
    identity_name: text('identity_name')
      .notNull()
      .default(sql`''`),
    auto_update_enabled: integer('auto_update_enabled')
      .notNull()
      .default(sql`1`),
    include_rules_json: text('include_rules_json')
      .notNull()
      .default(sql`'[]'`),
    exclude_rules_json: text('exclude_rules_json')
      .notNull()
      .default(sql`'[]'`),
    exclude_match_rules_json: text('exclude_match_rules_json')
      .notNull()
      .default(sql`'[]'`),
    grant_json: text('grant_json')
      .notNull()
      .default(sql`'[]'`),
    connect_json: text('connect_json')
      .notNull()
      .default(sql`'[]'`),
    noframes: integer('noframes')
      .notNull()
      .default(sql`0`),
    run_at: text('run_at')
      .notNull()
      .default(sql`'document-idle'`),
    update_url: text('update_url'),
    download_url: text('download_url'),
    last_install_url: text('last_install_url'),
    antifeature_json: text('antifeature_json')
      .notNull()
      .default(sql`'[]'`),
    icon_url: text('icon_url'),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex('user_scripts_active_identity_unique')
      .on(table.namespace, table.identity_name)
      .where(sql`deleted_at IS NULL AND namespace IS NOT NULL`),
    uniqueIndex('user_scripts_active_legacy_identity_unique')
      .on(table.identity_name)
      .where(sql`deleted_at IS NULL AND namespace IS NULL`),
    check('user_scripts_check_1', sql`auto_update_enabled IN (0, 1)`),
    check(
      'user_scripts_check_2',
      sql`json_valid(include_rules_json) AND json_type(include_rules_json) = 'array'`,
    ),
    check(
      'user_scripts_check_3',
      sql`json_valid(exclude_rules_json) AND json_type(exclude_rules_json) = 'array'`,
    ),
    check(
      'user_scripts_check_4',
      sql`json_valid(exclude_match_rules_json) AND json_type(exclude_match_rules_json) = 'array'`,
    ),
    check('user_scripts_check_5', sql`json_valid(grant_json) AND json_type(grant_json) = 'array'`),
    check(
      'user_scripts_check_6',
      sql`json_valid(connect_json) AND json_type(connect_json) = 'array'`,
    ),
    check('user_scripts_check_7', sql`noframes IN (0, 1)`),
    check(
      'user_scripts_check_8',
      sql`json_valid(antifeature_json) AND json_type(antifeature_json) = 'array'`,
    ),
  ],
)

export const userScriptHostPermissions = sqliteTable(
  'user_script_host_permissions',
  {
    id: text('id'),
    script_id: text('script_id')
      .notNull()
      .references(() => userScripts.id, { onDelete: 'cascade' }),
    host_pattern: text('host_pattern').notNull(),
    granted_at: integer('granted_at', { mode: 'timestamp_ms' }).notNull(),
    last_used_at: integer('last_used_at', { mode: 'timestamp_ms' }),
    revoked_at: integer('revoked_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique('user_script_host_permissions_script_id_host_pattern_unique').on(
      table.script_id,
      table.host_pattern,
    ),
    index('user_script_host_permissions_active_idx').on(
      table.script_id,
      table.host_pattern,
      table.revoked_at,
    ),
    check('user_script_host_permissions_check_1', sql`length(host_pattern) > 0`),
  ],
)

export const userScriptResources = sqliteTable(
  'user_script_resources',
  {
    id: text('id'),
    script_id: text('script_id')
      .notNull()
      .references(() => userScripts.id, { onDelete: 'cascade' }),
    resource_kind: text('resource_kind').notNull(),
    resource_key: text('resource_key').notNull(),
    declaration_order: integer('declaration_order').notNull(),
    source_url: text('source_url').notNull(),
    content_blob: blob('content_blob', { mode: 'buffer' }),
    content_encoding: text('content_encoding')
      .notNull()
      .default(sql`'binary'`),
    content_type: text('content_type'),
    integrity: text('integrity'),
    fetched_at: integer('fetched_at', { mode: 'timestamp_ms' }),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique('user_script_resources_script_id_resource_kind_resource_key_unique').on(
      table.script_id,
      table.resource_kind,
      table.resource_key,
    ),
    unique('user_script_resources_script_id_resource_kind_declaration_order_unique').on(
      table.script_id,
      table.resource_kind,
      table.declaration_order,
    ),
    index('user_script_resources_script_idx').on(
      table.script_id,
      table.resource_kind,
      table.declaration_order,
    ),
    check('user_script_resources_check_1', sql`resource_kind IN ('require', 'resource')`),
    check('user_script_resources_check_2', sql`length(resource_key) > 0`),
    check('user_script_resources_check_3', sql`declaration_order >= 0`),
    check('user_script_resources_check_4', sql`length(source_url) > 0`),
    check('user_script_resources_check_5', sql`content_encoding IN ('binary', 'utf8')`),
  ],
)

export const userScriptUpdateState = sqliteTable(
  'user_script_update_state',
  {
    script_id: text('script_id').references(() => userScripts.id, { onDelete: 'cascade' }),
    last_checked_at: integer('last_checked_at', { mode: 'timestamp_ms' }),
    next_check_at: integer('next_check_at', { mode: 'timestamp_ms' }),
    etag: text('etag'),
    last_modified: text('last_modified'),
    available_version: text('available_version'),
    status: text('status')
      .notNull()
      .default(sql`'idle'`),
    last_error: text('last_error'),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.script_id] }),
    index('user_script_update_state_next_check_idx').on(table.next_check_at, table.status),
    check(
      'user_script_update_state_check_1',
      sql`status IN ('idle', 'checking', 'current', 'available', 'error')`,
    ),
  ],
)

export const userScriptValues = sqliteTable(
  'user_script_values',
  {
    id: text('id'),
    script_id: text('script_id')
      .notNull()
      .references(() => userScripts.id, { onDelete: 'cascade' }),
    value_key: text('value_key').notNull(),
    value_json: text('value_json').notNull(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique('user_script_values_script_id_value_key_unique').on(table.script_id, table.value_key),
    index('user_script_values_script_idx').on(table.script_id, table.value_key),
    check('user_script_values_check_1', sql`length(value_key) > 0`),
    check('user_script_values_check_2', sql`json_valid(value_json)`),
  ],
)
