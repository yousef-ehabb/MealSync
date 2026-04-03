import { useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X, XCircle } from 'lucide-react';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Settings from './pages/Settings';

function App() {
    const [currentView, setCurrentView] = useState('loading');
    const [toast, setToast] = useState(null);
    const [bookingProgress, setBookingProgress] = useState(null);
    const [studentName, setStudentName] = useState(null);
    const [isOnline, setIsOnline] = useState(true);

    // Lifted Meal Report State
    const [mealReport, setMealReport] = useState(null);
    const [mealReportLoading, setMealReportLoading] = useState(false);
    const [mealReportError, setMealReportError] = useState(null);
    const [bookingResult, setBookingResult] = useState(() => {
        try {
            const stored = localStorage.getItem('lastBookingResult');
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });
    const initializedRef = useRef(false);
    useEffect(() => {
        if (!initializedRef.current) {
            initializedRef.current = true;
            checkUserStatus();
        }

        // De-register any stale listeners first — critical for Dev HMR where this
        // effect runs repeatedly without App ever fully unmounting. Without this,
        // each hot-reload adds ANOTHER set of handlers on top of the existing ones.
        window.electronAPI.removeAllListeners('booking:progress');
        window.electronAPI.removeAllListeners('booking:done');
        window.electronAPI.removeAllListeners('booking:error');
        window.electronAPI.removeAllListeners('trigger-book-now');
        window.electronAPI.removeAllListeners('history:updated');
        window.electronAPI.removeAllListeners('connectivity:changed');
        window.electronAPI.removeAllListeners('catchup:starting');

        // Sync initial connectivity status
        window.electronAPI.getConnectivityStatus().then((status) => {
            setIsOnline(status === 'online');
        });

        // Progress streaming listeners
        window.electronAPI.onBookingProgress((data) => {
            setBookingProgress(data);
        });

        window.electronAPI.onBookingDone((data) => {
            setBookingProgress(null);
            setBookingResult(data);
            localStorage.setItem('lastBookingResult', JSON.stringify(data));
            if (data.success) {
                showToast(data.message || 'Meal booked successfully', 'success');
                fetchMealReport(); // Refresh report silently on success
            } else {
                showToast(data.message || 'Booking failed', 'error');
            }
        });

        window.electronAPI.onBookingError((data) => {
            setBookingProgress(null);
            const errResult = { success: false, message: data.message };
            setBookingResult(errResult);
            localStorage.setItem('lastBookingResult', JSON.stringify(errResult));
            showToast(data.message || 'Booking failed', 'error');
        });

        window.electronAPI.onTriggerBookNow(() => {
            handleBookNow();
        });

        // P1-1: Real-time history updates from scheduled bookings
        window.electronAPI.onHistoryUpdated((updatedHistory) => {
            // This allows History page to reflect scheduled booking results immediately
            window.__latestHistory = updatedHistory;
            window.dispatchEvent(new CustomEvent('history-updated', { detail: updatedHistory }));
        });

        // Connectivity updates
        window.electronAPI.onConnectivityChanged((status) => {
            setIsOnline(status === 'online');
        });

        // Catch-up notification
        window.electronAPI.onCatchUpStarting(({ reason }) => {
            const reasonText = reason === 'app-start' 
                ? 'Missed booking detected — booking now'
                : 'Connection restored — booking now';
            showToast(reasonText, 'info');
        });

        return () => {
            window.electronAPI.removeAllListeners('booking:progress');
            window.electronAPI.removeAllListeners('booking:done');
            window.electronAPI.removeAllListeners('booking:error');
            window.electronAPI.removeAllListeners('trigger-book-now');
            window.electronAPI.removeAllListeners('history:updated');
            window.electronAPI.removeAllListeners('connectivity:changed');
            window.electronAPI.removeAllListeners('catchup:starting');
        };
    }, []);


    // fetchMealReport is intentionally NOT called on bare mount.
    // It is triggered after credentials are confirmed (see checkUserStatus & handleRegistrationComplete).

    async function fetchMealReport() {
        if (mealReportLoading) return;
        setMealReportLoading(true);
        setMealReportError(null);
        try {
            const result = await window.electronAPI.getMealReport();
            if (result.success) {
                setMealReport(result);
            } else {
                setMealReportError(result.error || 'Unknown error');
            }
        } catch (err) {
            setMealReportError(err.message || 'Failed to load meal report');
        } finally {
            setMealReportLoading(false);
        }
    }

    async function checkUserStatus() {
        const status = await window.electronAPI.getStatus();
        if (status.hasCredentials) {
            const name = await window.electronAPI.getStudentName();
            setStudentName(name || null);
            setCurrentView('dashboard');
            // Credentials are confirmed — fetch report after a short delay
            // to ensure the store is fully readable before the service hits IPC.
            setTimeout(() => fetchMealReport(), 500);
        } else {
            setStudentName(null);
            setCurrentView('onboarding');
        }
    }

    const showToast = (message, type = 'info', title) => {
        setToast({ message, type, title });
        setTimeout(() => setToast(null), 3000);
    };

    const handleBookNow = async () => {
        setBookingResult(null);
        setBookingProgress({ step: 'starting', message: 'Starting booking...' });
        await window.electronAPI.bookNow();
    };

    const handleLogout = async () => {
        setBookingProgress(null);
        setBookingResult(null);
        setStudentName(null);
        setMealReport(null);
        setMealReportError(null);
        localStorage.removeItem('lastBookingResult');
        setToast(null);
        await window.electronAPI.logout();
        showToast('You have been logged out. Automation has been stopped.', 'info');
        setCurrentView('loading'); // ensure a visual reset flush
        // Small delay to ensure any animations/promises clear before mounting onboarding
        setTimeout(() => {
            setCurrentView('onboarding');
        }, 50);
    };

    const handleResetCredentials = async () => {
        setBookingProgress(null);
        setBookingResult(null);
        setStudentName(null);
        setMealReport(null);
        setMealReportError(null);
        localStorage.removeItem('lastBookingResult');
        setToast(null);
        await window.electronAPI.resetCredentials();
        showToast('Account reset successfully. Please set up your account again.', 'info');
        setCurrentView('loading'); // ensure a visual reset flush
        setTimeout(() => {
            setCurrentView('onboarding');
        }, 50);
    };

    const handleRegistrationComplete = () => {
        // checkUserStatus will set the view to 'dashboard' and then
        // trigger fetchMealReport() with a 500ms delay internally.
        checkUserStatus();
    };

    const getToastIcon = (type) => {
        switch (type) {
            case 'success': return <CheckCircle size={18} />;
            case 'error': return <XCircle size={18} />;
            case 'warning': return <AlertTriangle size={18} />;
            default: return <Info size={18} />;
        }
    };

    if (currentView === 'loading') {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>Loading...</p>
            </div>
        );
    }

    return (
        <div className="app">
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    <div className="toast-icon-circle">
                        {getToastIcon(toast.type)}
                    </div>
                    <div className="toast-content">
                        <span className="toast-title">
                            {toast.title || toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}
                        </span>
                        <span className="toast-message">{toast.message}</span>
                    </div>
                    <button className="toast-close" onClick={() => setToast(null)}>
                        <X size={14} />
                    </button>
                </div>
            )}



            {currentView === 'onboarding' && (
                <div className="page-content" key="onboarding">
                    <Onboarding onComplete={handleRegistrationComplete} showToast={showToast} />
                </div>
            )}

            {currentView === 'dashboard' && (
                <div className="page-content" key="dashboard">
                    <Dashboard
                        onNavigate={setCurrentView}
                        onBookNow={handleBookNow}
                        showToast={showToast}
                        bookingProgress={bookingProgress}
                        bookingResult={bookingResult}
                        mealReport={mealReport}
                        mealReportLoading={mealReportLoading}
                        mealReportError={mealReportError}
                        fetchMealReport={fetchMealReport}
                        studentName={studentName}
                        isOnline={isOnline}
                    />
                </div>
            )}

            {currentView === 'history' && (
                <div className="page-content" key="history">
                    <History
                        onNavigate={setCurrentView}
                        showToast={showToast}
                        studentName={studentName}
                    />
                </div>
            )}

            {currentView === 'settings' && (
                <div className="page-content" key="settings">
                    <Settings
                        onNavigate={setCurrentView}
                        onLogout={handleLogout}
                        onReset={handleResetCredentials}
                        showToast={showToast}
                        studentName={studentName}
                        isOnline={isOnline}
                    />
                </div>
            )}
        </div>
    );
}

export default App;
