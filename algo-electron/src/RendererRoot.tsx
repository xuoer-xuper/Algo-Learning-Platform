import { lazy, Suspense } from 'react'

const App = lazy(() => import('./App.tsx'))
const CoachPet = lazy(() => import('./features/coach/CoachPet').then((module) => ({
  default: module.CoachPet,
})))

export function RendererRoot() {
  const isCoachPet = window.location.hash.startsWith('#/coach-pet')

  return (
    <Suspense fallback={null}>
      {isCoachPet ? <CoachPet /> : <App />}
    </Suspense>
  )
}
