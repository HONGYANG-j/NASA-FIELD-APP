import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface State {
  failed: boolean
}

/** If anything in the page throws while rendering, show a calm message and a way out instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Only the error type and a short stack go to the browser console; nothing is sent anywhere.
    console.error('Crop Rotation Explorer crashed while rendering:', error.name, info.componentStack?.split('\n').slice(0, 4).join('\n'))
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>The page hit an unexpected problem. Your data is safe: nothing was sent or saved. Reloading usually fixes it.</p>
        <p>
          <button type="button" onClick={() => window.location.reload()}>Reload the page</button>{' '}
          <a href="#/start" onClick={() => window.location.reload()}>Back to the start screen</a>
        </p>
      </main>
    )
  }
}
