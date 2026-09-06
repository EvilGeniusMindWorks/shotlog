// Root error boundary (Round S3): a render error must never white-screen
// the PWA — the user could not even tell us what happened. Shows what broke,
// offers Reload / Home, and a crash report prefilled with the stack.
//
// The ONE class component in the codebase: React exposes getDerivedState-
// FromError / componentDidCatch only on classes (no hook equivalent).
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logError, currentRoute } from '@/lib/diagnostics';
import { getSession } from '@/lib/session';
import { FeedbackComposer } from './FeedbackComposer';

interface State {
  error: Error | null;
  reporting: boolean;
  reported: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, reporting: false, reported: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError({
      kind: 'render',
      msg: `${error.name}: ${error.message}`,
      stack: `${error.stack ?? ''}\n--- component stack ---${info.componentStack ?? ''}`,
    });
  }

  render() {
    const { error, reporting, reported } = this.state;
    if (!error) return this.props.children;
    const route = currentRoute();
    const canReport = getSession().loggedIn;
    return (
      <div
        data-error-boundary
        className="min-h-screen bg-gray-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Something broke</h1>
                <p className="text-sm text-gray-500">
                  ShotLog hit an error on this screen. Everything you saved is still on this device.
                </p>
              </div>
            </div>
            <p className="text-xs font-mono text-gray-500 bg-gray-50 rounded-lg p-2 break-words">
              {error.name}: {error.message}
              <span className="block text-gray-400 mt-1">on {route || '/'}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => window.location.reload()}>
                <RotateCcw className="h-4 w-4 mr-1.5" /> Reload
              </Button>
              <Button variant="outline" onClick={() => window.location.assign('/')}>
                <Home className="h-4 w-4 mr-1.5" /> Go home
              </Button>
              {canReport && !reported && !reporting && (
                <Button
                  variant="safety"
                  onClick={() => this.setState({ reporting: true })}
                  data-error-report
                >
                  <Send className="h-4 w-4 mr-1.5" /> Send a report
                </Button>
              )}
            </div>
            {reported && (
              <p className="text-sm text-green-700">Report sent — thank you. Reload to keep working.</p>
            )}
          </div>
          {reporting && (
            <FeedbackComposer
              embedded
              initialKind="crash"
              initialMessage={`Crash on ${route || '/'}: ${error.message}\n\nWhat I was doing: `}
              screenshot={null}
              onClose={() => this.setState({ reporting: false, reported: true })}
            />
          )}
        </div>
      </div>
    );
  }
}
