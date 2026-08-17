import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Qianxun render failed', error, info.componentStack);
  }

  override render() {
    if (this.state.failed) {
      return (
        <main className="fatal-state">
          <div className="fatal-state__icon"><AlertTriangle size={24} /></div>
          <span className="eyebrow">LOCAL DATA IS SAFE</span>
          <h1>工作台暂时无法显示</h1>
          <p>页面遇到了意外问题，本地 IndexedDB 数据不会因此被清除。</p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            <RefreshCw size={17} /> 重新载入
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
