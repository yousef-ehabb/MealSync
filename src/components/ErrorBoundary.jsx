// P1-3: React ErrorBoundary — catches render crashes and shows a recovery UI
import { Component } from 'react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif',
                    background: '#f9fafb', color: '#111827', padding: '32px', textAlign: 'center',
                }}>
                    <div style={{
                        background: '#ffffff', borderRadius: '16px', padding: '40px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '440px',
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
                            Something went wrong
                        </h1>
                        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px', lineHeight: 1.6 }}>
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '10px 24px', borderRadius: '8px', border: 'none',
                                background: '#4F46E5', color: '#ffffff', fontSize: '14px',
                                fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Reload App
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
