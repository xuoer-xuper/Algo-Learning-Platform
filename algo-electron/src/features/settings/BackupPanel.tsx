import { useState } from 'react'
import {
  confirmLearningDataImport,
  createDatabaseBackup,
  exportLearningData,
  previewLearningDataImport,
  type LearningDataImportPreviewResult,
} from './settingsApi'

function formatCounts(counts?: Record<string, number>): string {
  if (!counts) return ''
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([table, count]) => `${table}: ${count}`)
    .join('，')
}

export function BackupPanel() {
  const [status, setStatus] = useState('')
  const [importPreview, setImportPreview] = useState<LearningDataImportPreviewResult['preview'] | null>(null)
  const [importing, setImporting] = useState(false)

  const handleBackup = async () => {
    setStatus('备份中...')
    const result = await createDatabaseBackup()
    setStatus(result.success ? `备份完成: ${result.path}` : `备份失败: ${result.error}`)
  }

  const handleExport = async () => {
    setStatus('导出中...')
    const result = await exportLearningData()
    setStatus(result.success
      ? `导出完成: ${formatCounts(result.counts)}`
      : `导出失败: ${result.error}`)
  }

  const handlePreviewImport = async () => {
    setStatus('读取导入文件...')
    setImportPreview(null)
    const result = await previewLearningDataImport()
    if (!result.success || !result.preview) {
      setStatus(`导入预览失败: ${result.error}`)
      return
    }
    setImportPreview(result.preview)
    const conflictText = result.preview.conflicts.length > 0
      ? `，冲突 ${result.preview.conflicts.length} 项`
      : ''
    setStatus(`导入预览完成: ${formatCounts(result.preview.counts)}${conflictText}`)
  }

  const handleConfirmImport = async (overwriteConflicts: boolean) => {
    setImporting(true)
    setStatus(overwriteConflicts ? '覆盖冲突并导入...' : '导入中...')
    try {
      const result = await confirmLearningDataImport(overwriteConflicts)
      if (!result.success) {
        setStatus(`导入失败: ${result.error ?? '存在冲突'}`)
        return
      }
      setStatus(`导入完成: 新增 ${formatCounts(result.inserted)}，更新 ${formatCounts(result.updated)}，跳过 ${formatCounts(result.skipped)}`)
      setImportPreview(null)
    } finally {
      setImporting(false)
    }
  }

  const hasConflicts = (importPreview?.conflicts.length ?? 0) > 0

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">备份与导入导出</h3>
      <div className="settings-row">
        <button className="settings-save-btn" onClick={handleBackup}>备份数据库</button>
        <button className="settings-save-btn" onClick={handleExport}>导出 JSON</button>
        <button className="settings-save-btn" onClick={handlePreviewImport}>导入 JSON</button>
      </div>

      {importPreview && (
        <div className="sync-status">
          预览: 新增 {formatCounts(importPreview.new_counts) || '0'}，重复 {formatCounts(importPreview.duplicate_counts) || '0'}，冲突 {importPreview.conflicts.length}
          <div className="settings-row">
            <button
              className="settings-save-btn"
              disabled={importing || hasConflicts}
              onClick={() => handleConfirmImport(false)}
            >
              确认导入
            </button>
            <button
              className="settings-save-btn"
              disabled={importing || !hasConflicts}
              onClick={() => handleConfirmImport(true)}
            >
              覆盖冲突
            </button>
          </div>
        </div>
      )}

      {status && <div className="sync-status">{status}</div>}
      <div className="sync-hint">JSON 导出不包含登录态、原始调试载荷、日志或本机路径；数据库备份仅用于本机恢复。</div>
    </div>
  )
}
