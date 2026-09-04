/**
 * React error boundary.
 *
 * Catches render/lifecycle errors in the subtree, logs them for development,
 * and renders a themed fallback with a "Try Again" button instead of a blank
 * screen or a full-app crash. Wrap major screens (or the whole app) with it.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <HomeScreen />
 *   </ErrorBoundary>
 */

import React, { Component, ReactNode } from 'react';
import { ErrorScreen } from './fallbacks';
import { captureError, addBreadcrumb } from '../monitoring/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback renderer (overrides the default themed error screen). */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
  /** Optional hook for reporting errors (console, Sentry, etc.). */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Development logging + Sentry capture (no-op without a configured DSN).
    console.error('[ErrorBoundary] Uncaught error:', error, info);
    addBreadcrumb({
      category: 'error-boundary',
      message: 'Error boundary caught a render/lifecycle error',
      level: 'error',
      data: { componentStack: info.componentStack },
    });
    captureError(error, {
      extra: { componentStack: info.componentStack },
    });
    this.props.onError?.(error, info);
  }

  /** Clear the error state so children re-render (and refetch). */
  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback({ error: error ?? new Error('Unknown error'), reset: this.reset });
      }
      return <ErrorScreen onRetry={this.reset} />;
    }

    return children;
  }
}