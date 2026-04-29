import React from 'react'

import { Button } from '@ptt/ui/components/button'

import { trpcClient } from '@renderer/lib/trpc'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/** Renders a recovery screen and forwards the error to the main-process log. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    void trpcClient.app.logRendererError
      .mutate({
        message: error.message,
        stack: error.stack ?? null,
        componentStack: info.componentStack ?? null
      })
      .catch(() => {
        console.error('[ErrorBoundary] failed to forward error to main:', error)
      })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-xl space-y-4 rounded-lg border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold tracking-wide">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error broke this view. The error has been logged. Reloading the window
              will recover the app, your last settings are preserved.
            </p>
            <pre className="max-h-40 overflow-auto rounded bg-muted/50 p-3 font-mono text-xs">
              {this.state.error.message}
            </pre>
            <Button onClick={this.handleReload}>Reload window</Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
