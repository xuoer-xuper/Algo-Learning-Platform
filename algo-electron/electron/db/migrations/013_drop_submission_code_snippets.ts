import type Database from 'better-sqlite3'

// P6-003 代码片段管理功能已移除（用户反馈手动维护成本高，且 AI 模块不依赖此表）
// 保留 migration 012 历史，新增 013 物理删除表结构，保证已应用 012 的库也能清理
export const migration013 = {
  version: 13,
  name: 'drop_submission_code_snippets',
  up: (db: Database.Database) => {
    db.exec(`DROP TABLE IF EXISTS submission_code_snippets`)
  },
  down: (db: Database.Database) => {
    // 回滚不重建：该功能已下线，无需恢复空表
    void db
  },
}
