import { useState, useEffect, useRef } from 'react';
import {
    CheckCircle, XCircle, Clock, Calendar,
    RefreshCw, Zap, BellOff, Cpu,
    CreditCard, LogIn, Search, BookOpen, Save, AlertCircle,
    Loader, UtensilsCrossed, ArrowRight,
    Mail, X
} from 'lucide-react';
import Sidebar from '../components/Sidebar';

// ─── Smart Meal Status Logic (Cairo Timezone) ───
function parseMealDate(dateStr) {
    // Portal date format: "D/M/YYYY" e.g. "3/3/2026"
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(Number);
    return new Date(year, month - 1, day);
}

function getCairoNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
}

function formatPortalDate(d) {
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function getTargetDates() {
    const now = getCairoNow();
    const todayStr = formatPortalDate(now);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatPortalDate(yesterday);

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatPortalDate(tomorrow);

    return [yesterdayStr, todayStr, tomorrowStr];
}

function getMealStatus(meal) {
    const mealDate = parseMealDate(meal.date);
    if (!mealDate) return { label: meal.received ? 'Received' : 'Unknown', color: 'gray' };

    const now = getCairoNow();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mealDay = new Date(mealDate.getFullYear(), mealDate.getMonth(), mealDate.getDate());

    const isToday = mealDay.getTime() === today.getTime();
    const isPast = mealDay < today;
    const isFuture = mealDay > today;
    const currentHour = now.getHours();
    const collectionCutoff = 17; // 5PM

    if (meal.received) {
        return { label: 'Received', color: 'green' };
    }

    if (isFuture) {
        return { label: 'Upcoming', color: 'gray' };
    }

    if (isToday) {
        if (currentHour < collectionCutoff) {
            return { label: 'Today', color: 'blue' };
        } else {
            return { label: 'Missed', color: 'red' };
        }
    }

    // Past and not received
    return { label: 'Missed', color: 'red' };
}

function computeSmartSummary(meals) {
    const now = getCairoNow();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentHour = now.getHours();

    let received = 0, missed = 0, upcoming = 0;
    for (const meal of meals) {
        const status = getMealStatus(meal);
        if (status.label === 'Received') received++;
        else if (status.color === 'red') missed++;
        else upcoming++;
    }
    return { total: meals.length, received, missed, upcoming };
}

const STEPS = [
    { key: 'idle', label: 'Idle', icon: Clock },
    { key: 'login', label: 'Authenticating', icon: LogIn },
    { key: 'navigating', label: 'Fetching Meals', icon: Search },
    { key: 'booking', label: 'Booking Meals', icon: BookOpen },
    { key: 'saving', label: 'Saving', icon: Save },
    { key: 'completed', label: 'Completed', icon: CheckCircle },
];

function getStepIndex(step) {
    if (!step) return 0;
    const map = { starting: 1, login: 1, navigating: 2, booking: 3, retrying: 3, saving: 4, completed: 5 };
    return map[step] ?? 0;
}

function Dashboard({ onNavigate, onBookNow, showToast, bookingProgress, bookingResult, mealReport, mealReportLoading, mealReportError, fetchMealReport, studentName, isOnline }) {
    const [status, setStatus] = useState(null);
    const [settings, setSettings] = useState(null);
    const [history, setHistory] = useState([]);
    const [isBooking, setIsBooking] = useState(false);
    const [silentMode, setSilentMode] = useState(false);
    const [trackerState, setTrackerState] = useState('idle');
    const [trackerFailed, setTrackerFailed] = useState(false);
    const successTimerRef = useRef(null);
    const [bookCompleted, setBookCompleted] = useState(false);
    const bookCompletedRef = useRef(null);
    const [hasBookedThisSession, setHasBookedThisSession] = useState(false);
    const [showTracker, setShowTracker] = useState(false);
    const [trackerExiting, setTrackerExiting] = useState(false);
    const trackerExitRef = useRef(null);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const lastValidStepIdxRef = useRef(0);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (bookingProgress) {
            // Cancelled step: show briefly then auto-dismiss
            if (bookingProgress.step === 'cancelled') {
                setCancelling(false);
                setIsBooking(false);
                setTrackerFailed(true);
                setTrackerState('cancelled');
                // Auto-dismiss after 2 seconds
                const cancelTimer = setTimeout(() => {
                    setTrackerExiting(true);
                    trackerExitRef.current = setTimeout(() => {
                        setShowTracker(false);
                        setTrackerExiting(false);
                        setTrackerFailed(false);
                        setTrackerState('idle');
                    }, 280);
                }, 2000);
                return () => clearTimeout(cancelTimer);
            }

            setIsBooking(true);
            setTrackerFailed(false);
            setTrackerState(bookingProgress.step || 'starting');
            setTrackerExiting(false);
            setShowTracker(true);
            if (trackerExitRef.current) clearTimeout(trackerExitRef.current);
        }
    }, [bookingProgress]);

    useEffect(() => {
        if (!bookingResult) return;
        setCancelling(false);

        setHasBookedThisSession(true);

        if (bookingResult.success) {
            setTrackerState('completed');
            setTrackerFailed(false);
            setBookCompleted(true);
            successTimerRef.current = setTimeout(() => {
                setTrackerState('idle');
                setIsBooking(false);
                setBookCompleted(false);
                // Start exit animation
                setTrackerExiting(true);
                trackerExitRef.current = setTimeout(() => {
                    setShowTracker(false);
                    setTrackerExiting(false);
                }, 280);
            }, 1500);
        } else {
            setTrackerFailed(true);
            setIsBooking(false);
            // Keep tracker visible on failure (user needs to see the error)
        }

        return () => {
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
        };
    }, [bookingResult]);

    useEffect(() => {
        if (settings) {
            setSilentMode(!settings.notifications);
        }
    }, [settings]);

    async function loadData() {
        const [statusData, settingsData, historyData] = await Promise.all([
            window.electronAPI.getStatus(),
            window.electronAPI.getSettings(),
            window.electronAPI.getHistory(),
        ]);
        setStatus(statusData);
        setSettings(settingsData);
        setHistory(historyData.slice(0, 10));
    }

    const handleBook = async () => {
        setIsBooking(true);
        setTrackerFailed(false);
        setTrackerState('starting');
        lastValidStepIdxRef.current = 0;
        try {
            await onBookNow();
        } finally {
            loadData();
        }
    };

    const handleSilentToggle = async (checked) => {
        setSilentMode(checked);
        const newSettings = { ...settings, notifications: !checked };
        await window.electronAPI.saveSettings(newSettings);
        setSettings(newSettings);
    };

    const handleCancelBooking = async () => {
        try {
            setCancelling(true);
            const result = await window.electronAPI.cancelBooking();
            if (result.success) {
                // booking:error will fire from the aborted browser and update the tracker naturally
            } else {
                setCancelling(false);
            }
        } catch (err) {
            console.error('[Dashboard] Cancel booking error:', err);
            setCancelling(false);
        }
    };
    const formatNextRun = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = date - now;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        if (diffHours < 1 && diffMs > 0) {
            return `In ${Math.floor(diffMs / (1000 * 60))} minutes`;
        } else if (diffHours < 24 && diffHours >= 0) {
            return `Today at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
        } else if (diffHours < 48) {
            return `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Derive active step index for the tracker
    const rawStepIdx = getStepIndex(trackerState);
    if (rawStepIdx > 0) {
        lastValidStepIdxRef.current = rawStepIdx;
    }
    const activeStepIdx = trackerFailed
        ? lastValidStepIdxRef.current
        : rawStepIdx;
    const progressPercent = (activeStepIdx / (STEPS.length - 1)) * 100;



    return (
        <div className="dash-layout">
            {/* ─── Sidebar ─── */}
            <Sidebar activePage="dashboard" onNavigate={onNavigate} studentName={studentName} />

            {/* ─── Main Area ─── */}
            <div className="dash-main">
                {!isOnline && (
                    <div className="offline-banner">
                        <span className="offline-banner-dot"></span>
                        You're offline — automatic booking will resume when you reconnect
                    </div>
                )}
                <header className="dash-header">
                    <div>
                        <h1 className="dash-page-title">Dashboard Overview</h1>
                        <p className="dash-page-subtitle">Manage your automated meal bookings.</p>
                    </div>
                    <div className="dash-header-actions">
                        <button
                            className={`dash-booknow-btn ${bookCompleted ? 'btn-completed' : ''}`}
                            onClick={handleBook}
                            disabled={isBooking || !isOnline}
                            title={isBooking ? 'Booking already in progress' : !isOnline ? 'Offline - cannot book' : 'Start manual booking'}
                            data-testid="book-now-button"
                        >
                            {bookCompleted ? (
                                <><CheckCircle size={16} /> Completed</>
                            ) : isBooking ? (
                                <><span className="btn-spinner" /> Booking...</>
                            ) : (
                                <><Zap size={16} /> Book Now</>
                            )}
                        </button>
                    </div>
                </header>

                <div className="dash-content-grid">
                    {/* ─── Left Column ─── */}
                    <div className="dash-col-left">
                        {/* System Status Card */}
                        <div className={`dash-card dash-status-card ${settings?.autoBook ? 'status-on' : 'status-off'}`}>
                            <div className="dash-status-left">
                                <div className="dash-status-badge">
                                    <span className={`status-dot-sm ${settings?.autoBook ? 'dot-green' : 'dot-gray'}`} />
                                    <span className="status-badge-text">
                                        {settings?.autoBook ? 'SYSTEM OPERATIONAL' : 'PAUSED'}
                                    </span>
                                </div>
                                <h3 className="dash-status-title">
                                    {settings?.autoBook ? 'Auto-Booking Active' : 'Auto-Booking Paused'}
                                </h3>
                                <p className="dash-status-sub">
                                    {settings?.autoBook && status?.scheduler?.nextRunTime
                                        ? <>Next Run: {formatNextRun(status.scheduler.nextRunTime)}</>
                                        : 'Automation is currently disabled'}
                                </p>
                            </div>
                            <div className="dash-status-icon-circle">
                                <Zap size={22} />
                            </div>
                        </div>

                        {/* Current Operation — Live State Tracker */}
                        {showTracker && (
                            <div className={`dash-card dash-tracker-card ${trackerExiting ? 'tracker-exit' : 'tracker-enter'}`}>
                                <div className="dash-card-header">
                                    <h3 className="dash-card-title">Current Operation</h3>
                                    {isBooking && (
                                        <span className="dash-tracker-live-badge">LIVE</span>
                                    )}
                                </div>

                                {/* Progress Bar */}
                                <div className="dash-progress-bar-bg">
                                    <div
                                        className={`dash-progress-bar-fill ${trackerFailed ? 'bar-failed' : trackerState === 'completed' ? 'bar-success' : ''}`}
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>

                                {/* Step Indicators */}
                                <div className="dash-tracker-steps">
                                    {STEPS.filter(s => s.key !== 'idle').map((s, i) => {
                                        const stepIdx = i + 1;
                                        let state = 'pending';
                                        if (trackerFailed && stepIdx <= activeStepIdx) state = 'failed';
                                        else if (stepIdx < activeStepIdx) state = 'done';
                                        else if (stepIdx === activeStepIdx) state = trackerState === 'completed' ? 'done' : 'active';

                                        const Icon = s.icon;
                                        return (
                                            <div key={s.key} className={`dash-tracker-step step-${state}`}>
                                                <div className="tracker-step-icon">
                                                    {state === 'done' ? <CheckCircle size={14} /> :
                                                        state === 'failed' ? <XCircle size={14} /> :
                                                            <Icon size={14} />}
                                                </div>
                                                <span className="tracker-step-label">{s.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Retry Badge */}
                                {bookingProgress?.step === 'retrying' && (
                                    <div className="dash-tracker-retry-badge">
                                        <RefreshCw size={13} className="spin-icon" />
                                        <span>
                                            {bookingProgress.message || 'Retrying...'}
                                        </span>
                                    </div>
                                )}

                                {/* Status Message */}
                                {trackerFailed && bookingResult?.message && (
                                    <div className="dash-tracker-error">
                                        <AlertCircle size={14} />
                                        <span>
                                            {(() => {
                                                const msg = bookingResult.message || '';
                                                if (msg.includes('خطأ فى البيانات')) return 'Invalid credentials — please check your Student ID and password';
                                                if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('too long')) return 'Could not reach portal — check your internet connection';
                                                return msg;
                                            })()}
                                        </span>
                                    </div>
                                )}

                                {/* Show cancel button only while booking is actively running */}
                                {isBooking && !trackerFailed && trackerState !== 'completed' && (
                                    <button
                                        className="dash-tracker-cancel-btn"
                                        onClick={handleCancelBooking}
                                        title="Cancel booking"
                                        disabled={cancelling}
                                    >
                                        <X size={14} />
                                        <span>{cancelling ? 'Cancelling...' : 'Cancel'}</span>
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Meal Report */}
                        <div className="dash-card dash-report-card">
                            <div className="dash-card-header">
                                <div>
                                    <h3 className="dash-card-title">
                                        <UtensilsCrossed size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                        Meal Report
                                    </h3>
                                    {mealReport?.period && !mealReportLoading && !mealReportError && (
                                        <p className="dash-report-period">
                                            {mealReport.period}
                                        </p>
                                    )}
                                </div>
                                <button
                                    className="dash-report-refresh-btn"
                                    onClick={fetchMealReport}
                                    disabled={mealReportLoading}
                                    title="Refresh meal report"
                                >
                                    <RefreshCw size={14} className={mealReportLoading ? 'spin-icon' : ''} />
                                </button>
                            </div>

                            {mealReportLoading ? (
                                <div className="dash-report-skeleton">
                                    <div className="skeleton-line" style={{ width: '60%', marginBottom: 16 }} />
                                    <div className="skeleton-line" />
                                    <div className="skeleton-line" />
                                    <div className="skeleton-line" />
                                </div>
                            ) : mealReportError ? (
                                <div className="dash-report-error">
                                    <AlertCircle size={22} />
                                    <p>Could not load meal report</p>
                                    <button className="dash-report-retry-btn" onClick={fetchMealReport}>
                                        <RefreshCw size={14} /> Retry
                                    </button>
                                </div>
                            ) : mealReport ? (
                                <>
                                    {(() => {
                                        const smart = computeSmartSummary(mealReport.meals);
                                        return (
                                            <div className="dash-report-inline-summary">
                                                <span className="summary-item">
                                                    <span className="summary-dot dot-green" /> {smart.received} Received
                                                </span>
                                                <span className="summary-item">
                                                    <span className="summary-dot dot-red" /> {smart.missed} Missed
                                                </span>
                                                <span className="summary-item">
                                                    <span className="summary-dot dot-gray" /> {smart.upcoming} Upcoming
                                                </span>
                                            </div>
                                        );
                                    })()}

                                    {(() => {
                                        const targetDates = getTargetDates();
                                        const previewMeals = mealReport.meals.filter(m => targetDates.includes(m.date));

                                        return previewMeals.length > 0 ? (
                                            <div className="dash-report-table">
                                                {previewMeals.map((meal, idx) => {
                                                    const status = getMealStatus(meal);
                                                    return (
                                                        <div key={`meal-preview-${meal.date}`} className="dash-report-row">
                                                            <span className="dash-report-date">{meal.date === targetDates[1] ? 'Today' : meal.date === targetDates[0] ? 'Yesterday' : 'Tomorrow'} <span style={{ fontSize: '14px', color: '#6b7280', marginLeft: '4px', fontWeight: 'normal' }}>({meal.date})</span></span>
                                                            <span className={`pill-badge pill-${status.label.toLowerCase()}`}>
                                                                {status.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="dash-empty">
                                                <UtensilsCrossed size={28} />
                                                <p>No meals scheduled for these 3 days</p>
                                            </div>
                                        );
                                    })()}

                                    <button
                                        className="dash-report-view-all-btn"
                                        onClick={() => setIsReportModalOpen(true)}
                                    >
                                        View Full Report
                                    </button>
                                </>
                            ) : null}
                        </div>

                        {/* Recent Activity */}
                        <div className="dash-card">
                            <h3 className="dash-card-title">Recent Activity</h3>
                            {history.length > 0 ? (
                                <div className="dash-activity-list">
                                    {history.slice(0, 5).map((item, idx) => {
                                        const isPending = item.status === 'pending';
                                        const isCancelled = item.status === 'cancelled';
                                        const isFailed = !isCancelled && (item.status === 'failed' || (!isPending && !item.success && item.status !== 'success'));

                                        // Derive message and dot color from real counts
                                        let activityMsg = '';
                                        let dotClass = 'dot-green';

                                        if (isPending) {
                                            activityMsg = 'Booking in progress...';
                                            dotClass = 'dot-amber';
                                        } else if (isCancelled) {
                                            activityMsg = 'Booking cancelled by user';
                                            dotClass = 'dot-cancelled';
                                        } else if (isFailed) {
                                            activityMsg = `Failed to book — ${item.message || 'unknown error'}`;
                                            dotClass = 'dot-red';
                                        } else {
                                            const booked = item.bookedCount || 0;
                                            const already = item.alreadyBookedCount || 0;
                                            const failed = (item.failedDates?.length) || 0;

                                            if (booked > 0 && failed > 0) {
                                                activityMsg = `Booked ${booked} meal(s), ${failed} failed`;
                                                dotClass = 'dot-amber';
                                            } else if (booked > 0) {
                                                activityMsg = `Successfully booked ${booked} meal(s)`;
                                                dotClass = 'dot-green';
                                            } else if (already > 0) {
                                                activityMsg = 'All meals were already booked';
                                                dotClass = 'dot-blue';
                                            } else if (failed > 0) {
                                                activityMsg = 'Booking failed';
                                                dotClass = 'dot-red';
                                            } else {
                                                activityMsg = 'No meals available today';
                                                dotClass = 'dot-neutral';
                                            }
                                        }

                                        return (
                                            <div key={item.id} className="dash-activity-row">
                                                <span className={`dash-activity-dot ${dotClass}`} />
                                                <div className="dash-activity-info">
                                                    <p className="dash-activity-title">
                                                        <strong>{activityMsg}</strong>
                                                    </p>
                                                    <span className="dash-activity-time">{formatTime(item.timestamp)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="dash-empty">
                                    <Clock size={28} />
                                    <p>No activity recorded yet</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ─── Right Column ─── */}
                    <div className="dash-col-right">
                        {/* University Account */}
                        <div className="dash-card dash-account-card">
                            <div className="dash-card-header">
                                <h3 className="dash-card-title">University Account</h3>
                                <span className={`dash-connected-badge ${isOnline ? '' : 'badge-disconnected'}`}>
                                    {isOnline ? 'Connected' : 'Disconnected'}
                                </span>
                            </div>
                            <div className="dash-account-body">
                                <div className="dash-account-icon-circle">
                                    <CreditCard size={22} />
                                </div>
                                <span className="dash-account-label">ACTIVE STUDENT ID</span>
                                <span className="dash-account-id">{status?.studentId || '—'}</span>
                                {studentName && (
                                    <span className="dash-account-name">{studentName}</span>
                                )}
                            </div>
                        </div>

                        {/* Quick Preferences */}
                        <div className="dash-card">
                            <h3 className="dash-card-title">Quick Preferences</h3>
                            <div className="dash-pref-row">
                                <div className="dash-pref-col">
                                    <div className="dash-pref-label">
                                        <BellOff size={16} /> Silent Mode
                                    </div>
                                    <span className="dash-pref-hint">Shortcut to notification settings</span>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={silentMode}
                                        onChange={(e) => handleSilentToggle(e.target.checked)}
                                    />
                                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                                </label>
                            </div>
                            <div className="dash-pref-row">
                                <div className="dash-pref-label">
                                    <Cpu size={16} /> Auto-Book
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={settings?.autoBook ?? false}
                                        onChange={async (e) => {
                                            const newSettings = { ...settings, autoBook: e.target.checked };
                                            await window.electronAPI.saveSettings(newSettings);
                                            setSettings(newSettings);
                                        }}
                                    />
                                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                                </label>
                            </div>
                        </div>

                        <div className="dash-card dash-dev-card">
                            <h3 className="dash-dev-title">Have Feedback?</h3>
                            <p className="dash-dev-desc">
                                Spotted a bug or got an idea?<br />
                                We'd love to hear from you.
                            </p>
                            <div className="dash-contact-actions">
                                <button
                                    className="dash-contact-btn"
                                    onClick={() => window.electronAPI?.openExternal?.('mailto:yousef.ehab.k@gmail.com')}
                                >
                                    Contact Support
                                </button>
                            </div>
                            <a
                                className="dash-github-link"
                                onClick={() => window.electronAPI?.openExternal?.('https://github.com/yousef-ehabb/MealSync')}
                            >
                                View on GitHub →
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Meal Report Full Modal */}
            {isReportModalOpen && mealReport && (
                <div className="modal-overlay" onClick={() => setIsReportModalOpen(false)}>
                    <div className="modal-content dash-report-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title">Full Meal Report</h3>
                                <p className="modal-subtitle">{mealReport.period}</p>
                            </div>
                            <button className="modal-close-btn" onClick={() => setIsReportModalOpen(false)}>
                                <XCircle size={24} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {mealReport.meals.length > 0 ? (
                                <div className="dash-report-table full-table">
                                    {mealReport.meals.map((meal, idx) => {
                                        const status = getMealStatus(meal);
                                        return (
                                            <div key={`meal-full-${meal.date}`} className="dash-report-row">
                                                <span className="dash-report-date">{meal.date}</span>
                                                <span className={`pill-badge pill-${status.label.toLowerCase()}`}>
                                                    {status.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="dash-empty">
                                    <UtensilsCrossed size={28} />
                                    <p>No meals in this period</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
