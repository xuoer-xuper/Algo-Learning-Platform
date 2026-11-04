import { lazy, Suspense } from 'react'
import { DataRefreshProvider } from './context/DataRefreshContext'

const App = lazy(() => import('./App.tsx'))
const CoachPet = lazy(() =>
  import('./features/coach/CoachPet').then((module) => ({
    default: module.CoachPet,
  })),
)

export function RendererRoot() {
  const isCoachPet = window.location.hash.startsWith('#/coach-pet')

  return (
    <Suspense fallback={null}>
      {isCoachPet ? (
        <CoachPet />
      ) : (
        <DataRefreshProvider>
          <App />
        </DataRefreshProvider>
      )}
    </Suspense>
  )
}
