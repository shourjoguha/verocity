/** Root error boundary — catches render-time errors and shows a tokenized fallback. */
import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => this.setState({ error: null });
  goHome = () => window.location.assign("/");

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="mx-auto max-w-xl px-4 pb-24 pt-16 safe-bottom">
        <div className="bg-surface border hairline p-6">
          <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">Error</div>
          <h1 className="mt-2 font-display text-3xl tracking-[-0.04em]">Something broke</h1>
          <pre className="mt-4 border hairline p-3 text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
            {error.message || String(error)}
          </pre>
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={this.reset} className="ll-btn">Try again</button>
            <button onClick={this.goHome} className="ll-btn">Go home</button>
          </div>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;