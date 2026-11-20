CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY,
	`event_type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`local_day` text NOT NULL,
	`session_id` text,
	`problem_id` text,
	`platform` text,
	`url` text,
	`payload_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_ae_local_day` ON `activity_events` (`local_day`);--> statement-breakpoint
CREATE INDEX `idx_ae_problem` ON `activity_events` (`problem_id`);--> statement-breakpoint
CREATE INDEX `idx_ae_time` ON `activity_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_ae_type_time` ON `activity_events` (`event_type`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `ai_context_snapshots` (
	`id` text PRIMARY KEY,
	`snapshot_date` text NOT NULL,
	`context_json` text NOT NULL,
	`schema_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_date_unique` ON `ai_context_snapshots` (`snapshot_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_context_snapshots_snapshot_date_unique` ON `ai_context_snapshots` (`snapshot_date`);--> statement-breakpoint
CREATE TABLE `ai_outputs` (
	`id` text PRIMARY KEY,
	`output_type` text NOT NULL,
	`title` text,
	`content` text NOT NULL,
	`content_markdown` text,
	`input_summary_json` text,
	`source_refs_json` text,
	`model_info_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `ai_outputs_created_idx` ON `ai_outputs` ("created_at" desc);--> statement-breakpoint
CREATE INDEX `ai_outputs_type_idx` ON `ai_outputs` (`output_type`);--> statement-breakpoint
CREATE TABLE `coach_events` (
	`event_id` text PRIMARY KEY,
	`session_id` text,
	`event_type` text NOT NULL,
	`severity` text NOT NULL,
	`score` integer NOT NULL,
	`problem_id` text,
	`platform` text,
	`evidence_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `coach_events_created_idx` ON `coach_events` ("created_at" desc);--> statement-breakpoint
CREATE INDEX `coach_events_problem_idx` ON `coach_events` (`problem_id`);--> statement-breakpoint
CREATE INDEX `coach_events_session_idx` ON `coach_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `coach_events_type_idx` ON `coach_events` (`event_type`);--> statement-breakpoint
CREATE TABLE `coach_feedback` (
	`feedback_id` text PRIMARY KEY,
	`intervention_id` text,
	`bubble_id` text,
	`feedback_type` text NOT NULL,
	`event_type` text,
	`problem_id` text,
	`local_day` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `coach_feedback_day_idx` ON `coach_feedback` (`local_day`);--> statement-breakpoint
CREATE INDEX `coach_feedback_intervention_idx` ON `coach_feedback` (`intervention_id`);--> statement-breakpoint
CREATE INDEX `coach_feedback_type_idx` ON `coach_feedback` (`feedback_type`);--> statement-breakpoint
CREATE TABLE `coach_interventions` (
	`intervention_id` text PRIMARY KEY,
	`event_id` text,
	`trigger_reason` text NOT NULL,
	`intervention_level` integer NOT NULL,
	`source_type` text NOT NULL,
	`message` text NOT NULL,
	`related_tags_json` text,
	`user_action` text NOT NULL,
	`problem_id` text,
	`platform` text,
	`session_id` text,
	`created_at` integer NOT NULL,
	`is_contest_mode` integer DEFAULT 0 NOT NULL,
	`contest_url` text,
	`contest_start` integer,
	`contest_end` integer,
	`zero_intervention` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `coach_interventions_contest_idx` ON `coach_interventions` (`is_contest_mode`,`contest_url`);--> statement-breakpoint
CREATE INDEX `coach_interventions_created_idx` ON `coach_interventions` ("created_at" desc);--> statement-breakpoint
CREATE INDEX `coach_interventions_event_idx` ON `coach_interventions` (`event_id`);--> statement-breakpoint
CREATE INDEX `coach_interventions_source_idx` ON `coach_interventions` (`source_type`);--> statement-breakpoint
CREATE TABLE `contest_results` (
	`id` text PRIMARY KEY,
	`platform` text NOT NULL,
	`contest_id` text NOT NULL,
	`contest_name` text,
	`account_id` text,
	`rank` integer,
	`solved_count` integer,
	`penalty` integer,
	`rating_delta` integer,
	`contest_at` integer,
	`raw_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_contest_results_account_time` ON `contest_results` (`account_id`,`contest_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contest_results_unique` ON `contest_results` (`platform`,`contest_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `cookie_records` (
	`id` text PRIMARY KEY,
	`site_id` text NOT NULL,
	`domain` text NOT NULL,
	`name` text NOT NULL,
	`value_encrypted` text,
	`expires_at` integer,
	`http_only` integer DEFAULT 0 NOT NULL,
	`secure` integer DEFAULT 0 NOT NULL,
	`same_site` text,
	`last_seen_at` integer NOT NULL,
	`purpose` text,
	`sync_excluded` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cookie_records_domain_idx` ON `cookie_records` (`domain`);--> statement-breakpoint
CREATE INDEX `cookie_records_expires_at_idx` ON `cookie_records` (`expires_at`);--> statement-breakpoint
CREATE INDEX `cookie_records_site_idx` ON `cookie_records` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cookie_records_site_id_domain_name_unique` ON `cookie_records` (`site_id`,`domain`,`name`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY,
	`problem_id` text,
	`title` text NOT NULL,
	`file_path` text NOT NULL,
	`note_type` text DEFAULT 'solution' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `notes_problem` ON `notes` (`problem_id`);--> statement-breakpoint
CREATE INDEX `notes_updated_at` ON `notes` (`updated_at`);--> statement-breakpoint
CREATE TABLE `platform_accounts` (
	`id` text PRIMARY KEY,
	`platform` text NOT NULL,
	`handle` text NOT NULL,
	`display_name` text,
	`current_rating` integer,
	`peak_rating` integer,
	`last_synced_at` integer,
	`raw_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_platform_accounts_handle` ON `platform_accounts` (`platform`,`handle`);--> statement-breakpoint
CREATE TABLE `problem_visits` (
	`id` text PRIMARY KEY,
	`problem_id` text NOT NULL,
	`session_id` text,
	`platform` text NOT NULL,
	`url` text NOT NULL,
	`entered_at` integer NOT NULL,
	`left_at` integer,
	`duration_seconds` integer,
	`active_seconds` integer,
	`leave_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pv_entered` ON `problem_visits` (`entered_at`);--> statement-breakpoint
CREATE INDEX `idx_pv_problem_time` ON `problem_visits` (`problem_id`,`entered_at`);--> statement-breakpoint
CREATE INDEX `idx_pv_session` ON `problem_visits` (`session_id`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` text PRIMARY KEY,
	`platform` text NOT NULL,
	`platform_problem_id` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`contest_id` text,
	`problem_index` text,
	`source_platform` text,
	`source_problem_id` text,
	`difficulty` text,
	`tags_json` text,
	`first_seen_at` integer NOT NULL,
	`last_visited_at` integer,
	`first_solved_at` integer,
	`extra_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_problems_last_visited` ON `problems` (`last_visited_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_problems_platform_id` ON `problems` (`platform`,`platform_problem_id`);--> statement-breakpoint
CREATE INDEX `idx_problems_source` ON `problems` (`source_platform`,`source_problem_id`);--> statement-breakpoint
CREATE INDEX `idx_problems_status` ON `problems` (`status`);--> statement-breakpoint
CREATE TABLE `rating_history` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`platform` text NOT NULL,
	`contest_id` text,
	`contest_name` text,
	`rank` integer,
	`rating_before` integer,
	`rating_after` integer,
	`delta` integer,
	`contest_at` integer,
	`raw_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_rating_history_account_time` ON `rating_history` (`account_id`,`contest_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rating_history_unique` ON `rating_history` (`platform`,`account_id`,`contest_id`);--> statement-breakpoint
CREATE TABLE `schema_migrations` (
	`version` integer PRIMARY KEY,
	`name` text NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_configs` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`domains_json` text NOT NULL,
	`home_url` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`problem_url_patterns_json` text,
	`submit_url_patterns_json` text,
	`cookie_policy` text,
	`adapter` text,
	`is_builtin` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`login_url_patterns_json` text,
	`login_username_selectors_json` text,
	`login_password_selectors_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_site_configs_enabled` ON `site_configs` (`enabled`);--> statement-breakpoint
CREATE TABLE `site_credentials` (
	`id` text PRIMARY KEY,
	`site_id` text NOT NULL,
	`username` text NOT NULL,
	`secret_envelope` text,
	`last_used_at` integer,
	`sync_excluded` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`display_name` text,
	FOREIGN KEY (`site_id`) REFERENCES `site_configs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_credentials_check_1" CHECK(sync_excluded = 1),
	CONSTRAINT "site_credentials_check_2" CHECK((deleted_at IS NULL AND secret_envelope IS NOT NULL AND json_valid(secret_envelope) = 1 AND json_extract(secret_envelope, '$.version') = 1 AND json_extract(secret_envelope, '$.provider') = 'electron-safe-storage') OR (deleted_at IS NOT NULL AND secret_envelope IS NULL))
);
--> statement-breakpoint
CREATE INDEX `site_credentials_active_site_idx` ON `site_credentials` (`site_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `site_credentials_last_used_idx` ON `site_credentials` ("last_used_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX `site_credentials_site_id_username_unique` ON `site_credentials` (`site_id`,`username`);--> statement-breakpoint
CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_seconds` integer,
	`active_seconds` integer,
	`main_platform` text,
	`end_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_ss_ended` ON `study_sessions` (`ended_at`);--> statement-breakpoint
CREATE INDEX `idx_ss_started` ON `study_sessions` (`started_at`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY,
	`problem_id` text,
	`platform` text NOT NULL,
	`platform_submission_id` text NOT NULL,
	`verdict` text NOT NULL,
	`raw_verdict` text,
	`language` text,
	`submitted_at` integer NOT NULL,
	`is_first_ac` integer DEFAULT 0 NOT NULL,
	`runtime_ms` integer,
	`memory_kb` integer,
	`source_url` text,
	`raw_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_submissions_platform_id` ON `submissions` (`platform`,`platform_submission_id`);--> statement-breakpoint
CREATE INDEX `idx_submissions_problem_time` ON `submissions` (`problem_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_submissions_submitted_at` ON `submissions` (`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_submissions_verdict` ON `submissions` (`verdict`);--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` text PRIMARY KEY,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload_hash` text,
	`created_at` integer NOT NULL,
	`synced_at` integer,
	`error_message` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_queue_entity_operation_created_idx` ON `sync_queue` (`entity_type`,`entity_id`,`operation`,`created_at`);--> statement-breakpoint
CREATE INDEX `sync_queue_status_created_idx` ON `sync_queue` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_daily_stats` (
	`local_day` text PRIMARY KEY,
	`active_seconds` integer DEFAULT 0 NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`visited_problem_count` integer DEFAULT 0 NOT NULL,
	`solved_problem_count` integer DEFAULT 0 NOT NULL,
	`submission_count` integer DEFAULT 0 NOT NULL,
	`ac_submission_count` integer DEFAULT 0 NOT NULL,
	`platform_distribution_json` text,
	`recomputed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_user_daily_stats_recomputed` ON `user_daily_stats` (`recomputed_at`);--> statement-breakpoint
CREATE TABLE `user_script_host_permissions` (
	`id` text PRIMARY KEY,
	`script_id` text NOT NULL,
	`host_pattern` text NOT NULL,
	`granted_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`script_id`) REFERENCES `user_scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_script_host_permissions_check_1" CHECK(length(host_pattern) > 0)
);
--> statement-breakpoint
CREATE INDEX `user_script_host_permissions_active_idx` ON `user_script_host_permissions` (`script_id`,`host_pattern`,`revoked_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_script_host_permissions_script_id_host_pattern_unique` ON `user_script_host_permissions` (`script_id`,`host_pattern`);--> statement-breakpoint
CREATE TABLE `user_script_resources` (
	`id` text PRIMARY KEY,
	`script_id` text NOT NULL,
	`resource_kind` text NOT NULL,
	`resource_key` text NOT NULL,
	`declaration_order` integer NOT NULL,
	`source_url` text NOT NULL,
	`content_blob` blob,
	`content_encoding` text DEFAULT 'binary' NOT NULL,
	`content_type` text,
	`integrity` text,
	`fetched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `user_scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_script_resources_check_1" CHECK(resource_kind IN ('require', 'resource')),
	CONSTRAINT "user_script_resources_check_2" CHECK(length(resource_key) > 0),
	CONSTRAINT "user_script_resources_check_3" CHECK(declaration_order >= 0),
	CONSTRAINT "user_script_resources_check_4" CHECK(length(source_url) > 0),
	CONSTRAINT "user_script_resources_check_5" CHECK(content_encoding IN ('binary', 'utf8'))
);
--> statement-breakpoint
CREATE INDEX `user_script_resources_script_idx` ON `user_script_resources` (`script_id`,`resource_kind`,`declaration_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_script_resources_script_id_resource_kind_resource_key_unique` ON `user_script_resources` (`script_id`,`resource_kind`,`resource_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_script_resources_script_id_resource_kind_declaration_order_unique` ON `user_script_resources` (`script_id`,`resource_kind`,`declaration_order`);--> statement-breakpoint
CREATE TABLE `user_script_update_state` (
	`script_id` text PRIMARY KEY,
	`last_checked_at` integer,
	`next_check_at` integer,
	`etag` text,
	`last_modified` text,
	`available_version` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `user_scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_script_update_state_check_1" CHECK(status IN ('idle', 'checking', 'current', 'available', 'error'))
);
--> statement-breakpoint
CREATE INDEX `user_script_update_state_next_check_idx` ON `user_script_update_state` (`next_check_at`,`status`);--> statement-breakpoint
CREATE TABLE `user_script_values` (
	`id` text PRIMARY KEY,
	`script_id` text NOT NULL,
	`value_key` text NOT NULL,
	`value_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `user_scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_script_values_check_1" CHECK(length(value_key) > 0),
	CONSTRAINT "user_script_values_check_2" CHECK(json_valid(value_json))
);
--> statement-breakpoint
CREATE INDEX `user_script_values_script_idx` ON `user_script_values` (`script_id`,`value_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_script_values_script_id_value_key_unique` ON `user_script_values` (`script_id`,`value_key`);--> statement-breakpoint
CREATE TABLE `user_scripts` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`version` text,
	`match_urls_json` text NOT NULL,
	`code` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`file_path` text,
	`site_ids_json` text DEFAULT '[]',
	`deleted_at` integer,
	`namespace` text,
	`identity_name` text DEFAULT '' NOT NULL,
	`auto_update_enabled` integer DEFAULT 1 NOT NULL,
	`include_rules_json` text DEFAULT '[]' NOT NULL,
	`exclude_rules_json` text DEFAULT '[]' NOT NULL,
	`exclude_match_rules_json` text DEFAULT '[]' NOT NULL,
	`grant_json` text DEFAULT '[]' NOT NULL,
	`connect_json` text DEFAULT '[]' NOT NULL,
	`noframes` integer DEFAULT 0 NOT NULL,
	`run_at` text DEFAULT 'document-idle' NOT NULL,
	`update_url` text,
	`download_url` text,
	`last_install_url` text,
	`antifeature_json` text DEFAULT '[]' NOT NULL,
	`icon_url` text,
	CONSTRAINT "user_scripts_check_1" CHECK(auto_update_enabled IN (0, 1)),
	CONSTRAINT "user_scripts_check_2" CHECK(json_valid(include_rules_json) AND json_type(include_rules_json) = 'array'),
	CONSTRAINT "user_scripts_check_3" CHECK(json_valid(exclude_rules_json) AND json_type(exclude_rules_json) = 'array'),
	CONSTRAINT "user_scripts_check_4" CHECK(json_valid(exclude_match_rules_json) AND json_type(exclude_match_rules_json) = 'array'),
	CONSTRAINT "user_scripts_check_5" CHECK(json_valid(grant_json) AND json_type(grant_json) = 'array'),
	CONSTRAINT "user_scripts_check_6" CHECK(json_valid(connect_json) AND json_type(connect_json) = 'array'),
	CONSTRAINT "user_scripts_check_7" CHECK(noframes IN (0, 1)),
	CONSTRAINT "user_scripts_check_8" CHECK(json_valid(antifeature_json) AND json_type(antifeature_json) = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_scripts_active_identity_unique` ON `user_scripts` (`namespace`,`identity_name`) WHERE deleted_at IS NULL AND namespace IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `user_scripts_active_legacy_identity_unique` ON `user_scripts` (`identity_name`) WHERE deleted_at IS NULL AND namespace IS NULL;