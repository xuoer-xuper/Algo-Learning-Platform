import type { ReactElement } from 'react'
import { render as renderComponent, type RenderOptions } from '@testing-library/react'
import { DataRefreshProvider } from '../../src/context/DataRefreshContext'

const subscribe = () => () => {}

export function render(ui: ReactElement, options?: RenderOptions) {
  return renderComponent(ui, {
    wrapper: ({ children }) => (
      <DataRefreshProvider subscribe={subscribe}>{children}</DataRefreshProvider>
    ),
    ...options,
  })
}
