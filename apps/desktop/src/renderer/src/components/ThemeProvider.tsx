import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useTRPC } from '@renderer/lib/trpc'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const trpc = useTRPC()
  const { data: settings } = useQuery(trpc.settings.getAll.queryOptions())
  const theme = settings?.themeOverride ?? 'system'

  useEffect(() => {
    const root = document.documentElement
    const apply = (effective: 'light' | 'dark'): void => {
      root.classList.toggle('dark', effective === 'dark')
    }

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      apply(mql.matches ? 'dark' : 'light')
      const listener = (e: MediaQueryListEvent): void => apply(e.matches ? 'dark' : 'light')
      mql.addEventListener('change', listener)
      return () => mql.removeEventListener('change', listener)
    }

    apply(theme)
    return undefined
  }, [theme])

  return <>{children}</>
}
