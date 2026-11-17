import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DataRefreshProvider } from '../../src/context/DataRefreshContext'
import { Dashboard } from '../../src/features/analytics/Dashboard'
import { ProblemDetail } from '../../src/features/problems/ProblemDetail'
import '../../src/index.css'
import '../../src/App.css'

const root = document.getElementById('root')
const problemId = new URLSearchParams(window.location.search).get('problemId')
if (!root || !problemId)
  throw new Error('The refresh fixture requires a root and persisted problem')

createRoot(root).render(
  <StrictMode>
    <DataRefreshProvider>
      <section data-testid="data-refresh-dashboard">
        <Dashboard onClose={() => {}} onNavigate={() => {}} />
      </section>
      <section data-testid="data-refresh-detail">
        <ProblemDetail problemId={problemId} onClose={() => {}} />
      </section>
    </DataRefreshProvider>
  </StrictMode>,
)
