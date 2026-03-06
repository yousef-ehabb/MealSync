import { useState, useEffect, useMemo } from 'react';
import {
    LayoutDashboard, Settings as SettingsIcon, Cpu, Clock, CheckCircle,
    XCircle, Trash2, History as HistoryIcon, User, ChevronDown,
    Calendar, Filter, Zap, AlertCircle, ChevronRight
} from 'lucide-react';
import appLogo from '../../assets/icons/MainAppLogo.png';

function History({ onNavigate, showToast, studentName }) {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [filterOpen, setFilterOpen] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [expandedId, setExpandedId] = useState(null);

    useEffect(() => {
        loadHistory();
    }, []);

    async function loadHistory() {
        setIsLoading(true);
        const data = await window.electronAPI.getHistory();
        setHistory(data);
        setIsLoading(false);
    }

    const handleClearHistory = async () => {
        await window.electronAPI.clearHistory();
        setHistory([]);
        setConfirmClear(false);
        showToast('History cleared successfully', 'success');
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && confirmClear) {
                setConfirmClear(false);
            }
        };

        if (confirmClear) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [confirmClear]);

    // ─── Derive entry status ───
    const getEntryInfo = (entry) => {
        const isPending = entry.status === 'pending';
        const isFailed = entry.status === 'failed' || (!isPending && !entry.success && entry.status !== 'success');
        const booked = entry.bookedCount || 0;
        const already = entry.alreadyBookedCount || 0;
        const failed = (entry.failedDates?.length) || 0;

        let statusKey = 'success';
        let label = '';
        let badgeClass = 'hbadge-green';
        let Icon = CheckCircle;

        if (isPending) {
            statusKey = 'pending';
            label = 'In Progress';
            badgeClass = 'hbadge-amber';
            Icon = Clock;
        } else if (isFailed) {
            statusKey = 'failed';
            label = 'Failed';
            badgeClass = 'hbadge-red';
            Icon = XCircle;
        } else if (booked > 0 && failed > 0) {
            statusKey = 'partial';
            label = 'Partial';
            badgeClass = 'hbadge-amber';
            Icon = AlertCircle;
        } else if (booked > 0) {
            statusKey = 'booked';
            label = 'Booked';
            badgeClass = 'hbadge-green';
            Icon = CheckCircle;
        } else if (already > 0) {
            statusKey = 'already';
            label = 'Already Booked';
            badgeClass = 'hbadge-blue';
            Icon = CheckCircle;
        } else if (failed > 0) {
            statusKey = 'failed';
            label = 'Failed';
            badgeClass = 'hbadge-red';
            Icon = XCircle;
        } else {
            statusKey = 'empty';
            label = 'No Meals';
            badgeClass = 'hbadge-neutral';
            Icon = Calendar;
        }

        // Build summary message
        let message = entry.message || '';
        if (!isPending && !isFailed) {
            if (booked > 0 && failed > 0) message = `Booked ${booked}, ${failed} failed`;
            else if (booked > 0) message = `Successfully booked ${booked} meal(s)`;
            else if (already > 0) message = 'All meals were already booked';
            else if (failed > 0) message = 'Booking failed';
            else message = 'No meals available';
        }

        return { statusKey, label, badgeClass, Icon, message, booked, already, failed };
    };

    // ─── Summary stats (today) ───
    const todayStats = useMemo(() => {
        const today = new Date().toDateString();
        const todayEntries = history.filter(e => new Date(e.date || e.timestamp).toDateString() === today);
        let booked = 0, already = 0, failed = 0;
        todayEntries.forEach(e => {
            booked += (e.bookedCount || 0);
            already += (e.alreadyBookedCount || 0);
            failed += (e.failedDates?.length || 0);
        });
        return { booked, already, failed, total: todayEntries.length };
    }, [history]);

    // ─── Filtered entries ───
    const filteredHistory = useMemo(() => {
        if (filter === 'all') return history;
        return history.filter(e => {
            const info = getEntryInfo(e);
            if (filter === 'booked') return info.statusKey === 'booked' || info.statusKey === 'partial';
            if (filter === 'already') return info.statusKey === 'already';
            if (filter === 'failed') return info.statusKey === 'failed';
            if (filter === 'manual') return e.type === 'manual';
            if (filter === 'auto') return e.type !== 'manual';
            return true;
        });
    }, [history, filter]);

    // ─── Group by date ───
    const grouped = useMemo(() => {
        const groups = {};
        filteredHistory.forEach(entry => {
            const dateKey = new Date(entry.date || entry.timestamp).toDateString();
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(entry);
        });
        return Object.entries(groups).sort(([a], [b]) => new Date(b) - new Date(a));
    }, [filteredHistory]);

    const formatTime = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const formatGroupDate = (dateStr) => {
        const d = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === today.toDateString()) return 'Today';
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };

    const FILTER_OPTIONS = [
        { key: 'all', label: 'All' },
        { key: 'booked', label: 'Booked' },
        { key: 'already', label: 'Already Booked' },
        { key: 'failed', label: 'Failed' },
        { key: 'manual', label: 'Manual' },
        { key: 'auto', label: 'Auto' },
    ];

    return (
        <div className="dash-layout">
            {/* ─── Sidebar ─── */}
            <aside className="dash-sidebar">
                <div className="dash-sidebar-top" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center' }}>
                    <img src={appLogo} alt="MealSync" style={{ height: '32px', width: 'auto' }} />
                    <nav className="dash-nav">
                        <button className="dash-nav-item" onClick={() => onNavigate('dashboard')}>
                            <LayoutDashboard size={18} /> Dashboard
                        </button>
                        <button className="dash-nav-item active" onClick={() => onNavigate('history')}>
                            <HistoryIcon size={18} /> History
                        </button>
                        <button className="dash-nav-item" onClick={() => onNavigate('settings')}>
                            <SettingsIcon size={18} /> Settings
                        </button>
                    </nav>
                </div>
                <div className="dash-sidebar-bottom">
                    <div className="dash-user">
                        <div className="dash-user-avatar"><User size={16} /></div>
                        <div className="dash-user-info">
                            <span className="dash-user-name">
                                {studentName && studentName !== 'Student User'
                                    ? `Hi, ${studentName.split(' ').filter(p => p.trim()).slice(0, 2).join(' ')}`
                                    : 'Student User'}
                            </span>
                            <button className="dash-logout" onClick={() => onNavigate('settings')}>Log out</button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* ─── Main ─── */}
            <div className="dash-main">
                <header className="dash-header">
                    <div>
                        <h1 className="dash-page-title">Booking History</h1>
                        <p className="dash-page-subtitle">View and manage your past booking attempts.</p>
                    </div>
                    <div className="dash-header-actions">
                        {history.length > 0 && (
                            <button className="settings-danger-btn hist-clear-btn" onClick={() => setConfirmClear(true)}>
                                <Trash2 size={14} /> Clear All
                            </button>
                        )}
                    </div>
                </header>

                {isLoading ? (
                    <div className="dash-empty" style={{ padding: '80px 0' }}>
                        <div className="spinner"></div>
                        <p>Loading history...</p>
                    </div>
                ) : history.length === 0 ? (
                    <div className="dash-card">
                        <div className="dash-empty" style={{ padding: '60px 0' }}>
                            <div className="dash-account-icon-circle" style={{ width: 56, height: 56 }}>
                                <HistoryIcon size={28} />
                            </div>
                            <h3 style={{ fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4 }}>No History Yet</h3>
                            <p>Your booking attempts will appear here once they occur.</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* ─── Summary Stats ─── */}
                        <div className="hist-summary-row">
                            <div className="hist-stat-card">
                                <div className="hist-stat-icon icon-green"><CheckCircle size={16} /></div>
                                <div className="hist-stat-body">
                                    <span className="hist-stat-value">{todayStats.booked}</span>
                                    <span className="hist-stat-label">Booked Today</span>
                                </div>
                            </div>
                            <div className="hist-stat-card">
                                <div className="hist-stat-icon icon-blue"><Calendar size={16} /></div>
                                <div className="hist-stat-body">
                                    <span className="hist-stat-value">{todayStats.already}</span>
                                    <span className="hist-stat-label">Already Booked</span>
                                </div>
                            </div>
                            <div className="hist-stat-card">
                                <div className="hist-stat-icon icon-red"><XCircle size={16} /></div>
                                <div className="hist-stat-body">
                                    <span className="hist-stat-value">{todayStats.failed}</span>
                                    <span className="hist-stat-label">Failed Today</span>
                                </div>
                            </div>
                            <div className="hist-stat-card">
                                <div className="hist-stat-icon icon-purple"><Zap size={16} /></div>
                                <div className="hist-stat-body">
                                    <span className="hist-stat-value">{todayStats.total}</span>
                                    <span className="hist-stat-label">Total Runs</span>
                                </div>
                            </div>
                        </div>

                        {/* ─── Filter Bar ─── */}
                        <div className="hist-filter-bar">
                            <div className="hist-filter-wrapper">
                                <button className="hist-filter-trigger" onClick={() => setFilterOpen(o => !o)}>
                                    <Filter size={14} />
                                    <span>{FILTER_OPTIONS.find(o => o.key === filter)?.label || 'All'}</span>
                                    <ChevronDown size={14} className={`tp-chevron ${filterOpen ? 'tp-chevron-open' : ''}`} />
                                </button>
                                {filterOpen && (
                                    <div className="hist-filter-dropdown">
                                        {FILTER_OPTIONS.map(opt => (
                                            <button
                                                key={opt.key}
                                                className={`hist-filter-option ${filter === opt.key ? 'active' : ''}`}
                                                onClick={() => { setFilter(opt.key); setFilterOpen(false); }}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <span className="hist-count">{filteredHistory.length} {filteredHistory.length === 1 ? 'entry' : 'entries'}</span>
                        </div>

                        {/* ─── Grouped Entries ─── */}
                        {grouped.length === 0 ? (
                            <div className="dash-card">
                                <div className="dash-empty"><Filter size={28} /><p>No entries match this filter.</p></div>
                            </div>
                        ) : (
                            grouped.map(([dateKey, entries]) => (
                                <div key={dateKey} className="hist-group">
                                    <div className="hist-group-header">
                                        <Calendar size={14} />
                                        <span>{formatGroupDate(dateKey)}</span>
                                    </div>
                                    <div className="dash-card hist-entries-card">
                                        {entries.map((entry, idx) => {
                                            const info = getEntryInfo(entry);
                                            const Icon = info.Icon;
                                            const hasDetails = entry.newlyBookedDates?.length > 0 ||
                                                entry.alreadyBookedDates?.length > 0 ||
                                                entry.failedDates?.length > 0;
                                            const isExpanded = expandedId === (entry.id || idx + dateKey);

                                            return (
                                                <div key={entry.id || idx} className="hist-entry">
                                                    <div className="hist-entry-main" onClick={() => hasDetails && setExpandedId(isExpanded ? null : (entry.id || idx + dateKey))}>
                                                        <div className={`hist-entry-icon ${info.badgeClass}`}>
                                                            <Icon size={16} />
                                                        </div>
                                                        <div className="hist-entry-body">
                                                            <div className="hist-entry-top">
                                                                <span className="hist-entry-type">
                                                                    {entry.type === 'manual' ? 'Manual' : 'Auto'}
                                                                </span>
                                                                <span className={`hist-entry-badge ${info.badgeClass}`}>
                                                                    {info.label}
                                                                </span>
                                                            </div>
                                                            <p className="hist-entry-msg">{info.message}</p>
                                                        </div>
                                                        <div className="hist-entry-right">
                                                            <span className="hist-entry-time">{formatTime(entry.date || entry.timestamp)}</span>
                                                            {hasDetails && (
                                                                <ChevronRight size={14} className={`hist-expand-icon ${isExpanded ? 'expanded' : ''}`} />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {isExpanded && hasDetails && (
                                                        <div className="hist-entry-details">
                                                            {entry.newlyBookedDates?.length > 0 && (
                                                                <div className="hist-detail-section">
                                                                    <span className="hist-detail-label label-green">Booked</span>
                                                                    <div className="hist-detail-dates">
                                                                        {entry.newlyBookedDates.map((d, i) => <span key={i} className="hist-date-chip chip-green">{d}</span>)}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {entry.alreadyBookedDates?.length > 0 && (
                                                                <div className="hist-detail-section">
                                                                    <span className="hist-detail-label label-blue">Already Booked</span>
                                                                    <div className="hist-detail-dates">
                                                                        {entry.alreadyBookedDates.map((d, i) => <span key={i} className="hist-date-chip chip-blue">{d}</span>)}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {entry.failedDates?.length > 0 && (
                                                                <div className="hist-detail-section">
                                                                    <span className="hist-detail-label label-red">Failed</span>
                                                                    <div className="hist-detail-dates">
                                                                        {entry.failedDates.map((item, i) => (
                                                                            <span key={i} className="hist-date-chip chip-red">{typeof item === 'string' ? item : item.date}</span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
            </div>

            {/* ─── Clear Confirmation Modal ─── */}
            {confirmClear && (
                <div className="modal-overlay" onClick={() => setConfirmClear(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-icon"><Trash2 size={24} /></div>
                        <h3 className="modal-title">Clear All History?</h3>
                        <p className="modal-desc">This action cannot be undone. All booking records will be permanently removed.</p>
                        <div className="modal-actions">
                            <button className="modal-btn-cancel" onClick={() => setConfirmClear(false)}>Cancel</button>
                            <button className="modal-btn-danger" onClick={handleClearHistory}>Delete All</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default History;
