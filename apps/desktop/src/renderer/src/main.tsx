import '@ptt/ui/globals.css'
import './lib/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'

import { Toaster } from '@ptt/ui/components/sonner'

import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './components/ThemeProvider'
import { createQueryClient } from './lib/query-client'
import { trpc, trpcClient } from './lib/trpc'
import { router } from './router'

function App() {
  const [queryClient] = useState(() => createQueryClient())
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('No root element')

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
