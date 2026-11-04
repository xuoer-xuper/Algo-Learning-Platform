-- Generated from pinned historical migrations; no user database was used.

-- v1.1.0-beta.2 (b27debfcac5a368da1a19113bd1a48dc87526b79), schema 24.

-- Migration ledger times are synthetic; data rows are seeded by the tests.

CREATE TABLE activity_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        local_day TEXT NOT NULL,
        session_id TEXT,
        problem_id TEXT,
        platform TEXT,
        url TEXT,
        payload_json TEXT,
        created_at TEXT NOT NULL
      , updated_at TEXT, deleted_at TEXT);

CREATE TABLE ai_context_snapshots (
        id TEXT PRIMARY KEY,
        snapshot_date TEXT NOT NULL UNIQUE,
        context_json TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL
      , updated_at TEXT, deleted_at TEXT);

CREATE TABLE ai_outputs (
        id TEXT PRIMARY KEY,
        output_type TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        content_markdown TEXT,
        input_summary_json TEXT,
        source_refs_json TEXT,
        model_info_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      , deleted_at TEXT);

CREATE TABLE coach_events (
        event_id TEXT PRIMARY KEY,
        session_id TEXT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        score INTEGER NOT NULL,
        problem_id TEXT,
        platform TEXT,
        evidence_json TEXT,
        created_at TEXT NOT NULL
      );

CREATE TABLE coach_feedback (
        feedback_id TEXT PRIMARY KEY,
        intervention_id TEXT,
        bubble_id TEXT,
        feedback_type TEXT NOT NULL,
        event_type TEXT,
        problem_id TEXT,
        local_day TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

CREATE TABLE coach_interventions (
        intervention_id TEXT PRIMARY KEY,
        event_id TEXT,
        trigger_reason TEXT NOT NULL,
        intervention_level INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        message TEXT NOT NULL,
        related_tags_json TEXT,
        user_action TEXT NOT NULL,
        problem_id TEXT,
        platform TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL,
        is_contest_mode INTEGER NOT NULL DEFAULT 0,
        contest_url TEXT,
        contest_start TEXT,
        contest_end TEXT,
        zero_intervention INTEGER NOT NULL DEFAULT 0
      );

CREATE TABLE contest_results (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        contest_id TEXT NOT NULL,
        contest_name TEXT,
        account_id TEXT,
        rank INTEGER,
        solved_count INTEGER,
        penalty INTEGER,
        rating_delta INTEGER,
        contest_at TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL
      , updated_at TEXT, deleted_at TEXT);

CREATE TABLE cookie_records (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        name TEXT NOT NULL,
        value_encrypted TEXT,
        expires_at TEXT,
        http_only INTEGER NOT NULL DEFAULT 0,
        secure INTEGER NOT NULL DEFAULT 0,
        same_site TEXT,
        last_seen_at TEXT NOT NULL,
        purpose TEXT,
        sync_excluded INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(site_id, domain, name)
      );

CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        problem_id TEXT,
        title TEXT NOT NULL,
        file_path TEXT NOT NULL,
        note_type TEXT NOT NULL DEFAULT 'solution',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      , content TEXT NOT NULL DEFAULT '', word_count INTEGER NOT NULL DEFAULT 0, deleted_at TEXT);

CREATE TABLE platform_accounts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        handle TEXT NOT NULL,
        display_name TEXT,
        current_rating INTEGER,
        peak_rating INTEGER,
        last_synced_at TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      , deleted_at TEXT);

CREATE TABLE problem_visits (
        id TEXT PRIMARY KEY,
        problem_id TEXT NOT NULL,
        session_id TEXT,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        entered_at TEXT NOT NULL,
        left_at TEXT,
        duration_seconds INTEGER,
        active_seconds INTEGER,
        leave_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, deleted_at TEXT,
        FOREIGN KEY (problem_id) REFERENCES problems(id)
      );

CREATE TABLE problems (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        platform_problem_id TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        title TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        contest_id TEXT,
        problem_index TEXT,
        source_platform TEXT,
        source_problem_id TEXT,
        difficulty TEXT,
        tags_json TEXT,
        first_seen_at TEXT NOT NULL,
        last_visited_at TEXT,
        first_solved_at TEXT,
        extra_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

CREATE TABLE rating_history (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        contest_id TEXT,
        contest_name TEXT,
        rank INTEGER,
        rating_before INTEGER,
        rating_after INTEGER,
        delta INTEGER,
        contest_at TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL
      , updated_at TEXT, deleted_at TEXT);

CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

CREATE TABLE site_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domains_json TEXT NOT NULL,
        home_url TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        problem_url_patterns_json TEXT,
        submit_url_patterns_json TEXT,
        cookie_policy TEXT,
        adapter TEXT,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      , deleted_at TEXT);

CREATE TABLE study_sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_seconds INTEGER,
        active_seconds INTEGER,
        main_platform TEXT,
        end_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      , deleted_at TEXT);

CREATE TABLE submissions (
        id TEXT PRIMARY KEY,
        problem_id TEXT,
        platform TEXT NOT NULL,
        platform_submission_id TEXT NOT NULL,
        verdict TEXT NOT NULL,
        raw_verdict TEXT,
        language TEXT,
        submitted_at TEXT NOT NULL,
        is_first_ac INTEGER NOT NULL DEFAULT 0,
        runtime_ms INTEGER,
        memory_kb INTEGER,
        source_url TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, deleted_at TEXT,
        FOREIGN KEY (problem_id) REFERENCES problems(id)
      );

CREATE TABLE sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload_hash TEXT,
        created_at TEXT NOT NULL,
        synced_at TEXT,
        error_message TEXT
      );

CREATE TABLE user_daily_stats (
        local_day TEXT PRIMARY KEY,
        active_seconds INTEGER NOT NULL DEFAULT 0,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        visited_problem_count INTEGER NOT NULL DEFAULT 0,
        solved_problem_count INTEGER NOT NULL DEFAULT 0,
        submission_count INTEGER NOT NULL DEFAULT 0,
        ac_submission_count INTEGER NOT NULL DEFAULT 0,
        platform_distribution_json TEXT,
        recomputed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      , deleted_at TEXT);

CREATE TABLE user_scripts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        version TEXT,
        match_urls_json TEXT NOT NULL,
        code TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      , file_path TEXT, site_ids_json TEXT DEFAULT '[]', deleted_at TEXT);

CREATE INDEX ai_outputs_created_idx ON ai_outputs(created_at DESC);

CREATE INDEX ai_outputs_type_idx ON ai_outputs(output_type);

CREATE INDEX coach_events_created_idx ON coach_events(created_at DESC);

CREATE INDEX coach_events_problem_idx ON coach_events(problem_id);

CREATE INDEX coach_events_session_idx ON coach_events(session_id);

CREATE INDEX coach_events_type_idx ON coach_events(event_type);

CREATE INDEX coach_feedback_day_idx ON coach_feedback(local_day);

CREATE INDEX coach_feedback_intervention_idx ON coach_feedback(intervention_id);

CREATE INDEX coach_feedback_type_idx ON coach_feedback(feedback_type);

CREATE INDEX coach_interventions_contest_idx ON coach_interventions(is_contest_mode, contest_url);

CREATE INDEX coach_interventions_created_idx ON coach_interventions(created_at DESC);

CREATE INDEX coach_interventions_event_idx ON coach_interventions(event_id);

CREATE INDEX coach_interventions_source_idx ON coach_interventions(source_type);

CREATE INDEX cookie_records_domain_idx ON cookie_records(domain);

CREATE INDEX cookie_records_expires_at_idx ON cookie_records(expires_at);

CREATE INDEX cookie_records_site_idx ON cookie_records(site_id);

CREATE INDEX idx_ae_local_day ON activity_events(local_day);

CREATE INDEX idx_ae_problem ON activity_events(problem_id);

CREATE INDEX idx_ae_time ON activity_events(occurred_at);

CREATE INDEX idx_ae_type_time ON activity_events(event_type, occurred_at);

CREATE INDEX idx_contest_results_account_time
        ON contest_results(account_id, contest_at);

CREATE UNIQUE INDEX idx_contest_results_unique
        ON contest_results(platform, contest_id, account_id);

CREATE UNIQUE INDEX idx_platform_accounts_handle
        ON platform_accounts(platform, handle);

CREATE INDEX idx_problems_last_visited ON problems(last_visited_at);

CREATE UNIQUE INDEX idx_problems_platform_id ON problems(platform, platform_problem_id);

CREATE INDEX idx_problems_source ON problems(source_platform, source_problem_id);

CREATE INDEX idx_problems_status ON problems(status);

CREATE INDEX idx_pv_entered ON problem_visits(entered_at);

CREATE INDEX idx_pv_problem_time ON problem_visits(problem_id, entered_at);

CREATE INDEX idx_pv_session ON problem_visits(session_id);

CREATE INDEX idx_rating_history_account_time
        ON rating_history(account_id, contest_at);

CREATE UNIQUE INDEX idx_rating_history_unique
        ON rating_history(platform, account_id, contest_id);

CREATE INDEX idx_site_configs_enabled ON site_configs(enabled);

CREATE INDEX idx_ss_ended ON study_sessions(ended_at);

CREATE INDEX idx_ss_started ON study_sessions(started_at);

CREATE UNIQUE INDEX idx_submissions_platform_id ON submissions(platform, platform_submission_id);

CREATE INDEX idx_submissions_problem_time ON submissions(problem_id, submitted_at);

CREATE INDEX idx_submissions_submitted_at ON submissions(submitted_at);

CREATE INDEX idx_submissions_verdict ON submissions(verdict);

CREATE INDEX idx_user_daily_stats_recomputed
        ON user_daily_stats(recomputed_at);

CREATE INDEX notes_problem ON notes(problem_id);

CREATE INDEX notes_updated_at ON notes(updated_at);

CREATE UNIQUE INDEX snapshots_date_unique ON ai_context_snapshots(snapshot_date);

CREATE UNIQUE INDEX sync_queue_entity_operation_created_idx
        ON sync_queue(entity_type, entity_id, operation, created_at);

CREATE INDEX sync_queue_status_created_idx ON sync_queue(status, created_at);

INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'initial_schema', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'add_submissions_table', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (3, 'fix_codeforces_canonical_urls', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (4, 'fix_codeforces_gym_page_urls', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (5, 'add_user_daily_stats', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (6, 'add_rating_tables', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (7, 'add_site_configs', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (8, 'add_user_scripts', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (9, 'user_scripts_add_file_path', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (10, 'notes', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (11, 'notes_add_content_cache', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (12, 'submission_code_snippets', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (13, 'drop_submission_code_snippets', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (14, 'ai_context_snapshots', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (15, 'ai_outputs', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (16, 'clear_codeforces_placeholder_titles', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (17, 'backfill_problem_context', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (18, 'normalize_codeforces_submission_ids', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (19, 'cookie_records', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (20, 'sync_queue', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (21, 'sync_metadata_fields', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (22, 'coach_events', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (23, 'coach_interventions', '2000-01-01T00:00:00.000');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (24, 'coach_feedback', '2000-01-01T00:00:00.000');

