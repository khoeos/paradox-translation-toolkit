import './assets/main.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import App from './App'
import { Toaster } from '@renderer/components/ui/Sonner'
import { ThemeProvider } from '@renderer/components/theme-provider'
import { BrowserRouter } from 'react-router'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <App />
        <Toaster />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
