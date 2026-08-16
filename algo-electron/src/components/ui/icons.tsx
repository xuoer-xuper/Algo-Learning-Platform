import type { ReactNode, SVGProps } from 'react'

/**
 * 统一图标集（B1.3）：24 viewBox、1.8 描边、currentColor。
 * 全应用图标唯一来源，禁止再出现 Unicode 符号 / emoji / 内联 SVG 三方混排。
 */
export type IconName =
  | 'home'
  | 'arrow-left'
  | 'arrow-right'
  | 'refresh'
  | 'capture'
  | 'chart'
  | 'bot'
  | 'code'
  | 'settings'
  | 'close'
  | 'plus'
  | 'chevron-left'
  | 'chevron-right'
  | 'edit'
  | 'note'
  | 'trash'
  | 'check'
  | 'more'
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'external'

const ICON_PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.8V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.8" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </>
  ),
  capture: (
    <>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16v-4" />
      <path d="M12 16V6" />
      <path d="M17 16v-7" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <circle cx="9" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 3v4" />
      <circle cx="12" cy="2.5" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  code: (
    <>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h8" />
      <circle cx="15" cy="6" r="2" />
      <path d="M18 6h2" />
      <path d="M4 12h3" />
      <circle cx="10" cy="12" r="2" />
      <path d="M13 12h7" />
      <path d="M4 18h10" />
      <circle cx="17" cy="18" r="2" />
      <path d="M20 18h0.5" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  'chevron-left': <path d="m14 6-6 6 6 6" />,
  'chevron-right': <path d="m10 6 6 6-6 6" />,
  edit: (
    <>
      <path d="m4 20 1.2-4.2L16.8 4.2a2 2 0 0 1 2.9 0l0.1 0.1a2 2 0 0 1 0 2.9L8.2 18.8 4 20Z" />
      <path d="m14.5 6.5 3 3" />
    </>
  ),
  note: (
    <>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="m6 7 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  check: <path d="m5 13 4 4L19 7" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  restore: (
    <>
      <path d="M9 8V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2" />
      <rect x="5" y="9" width="10" height="10" rx="1" />
    </>
  ),
  external: (
    <>
      <path d="M14 5h5v5" />
      <path d="M19 5 10 14" />
      <path d="M9 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
    </>
  ),
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 16, strokeWidth = 1.8, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon={name}
      {...rest}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
