import { useState, useEffect, useRef } from 'react';
import {
    LayoutDashboard, Settings as SettingsIcon, Cpu, Clock, Bell,
    Monitor, User, LogOut, Bug, Github,
    History as HistoryIcon, ShieldCheck, CreditCard, ChevronDown, X
} from 'lucide-react';
import appLogo from '../../assets/icons/MainAppLogo.png';

function Settings({ onNavigate, onLogout, onReset, showToast, studentName }) {
    const [settings, setSettings] = useState(null);
    const [credentials, setCredentials] = useState(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerHour, setPickerHour] = useState(8);
    const [pickerMinute, setPickerMinute] = useState(0);
    const [pickerPeriod, setPickerPeriod] = useState('AM');
    const pickerRef = useRef(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [logoutAction, setLogoutAction] = useState('logout'); // 'logout' or 'reset'

    // Auto-save helper
    const autoSave = async (newSettings) => {
        setSettings(newSettings);
        await window.electronAPI.saveSettings(newSettings);
        showToast('Settings updated', 'info');
    };

    // Parse 24h "HH:MM" to 12h picker state
    const openPicker = () => {
        const time24 = settings.scheduleTime || '08:00';
        const [hStr, mStr] = time24.split(':');
        let h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        const period = h >= 12 ? 'PM' : 'AM';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        setPickerHour(h);
        setPickerMinute(m);
        setPickerPeriod(period);
        setPickerOpen(true);
    };

    const confirmPicker = () => {
        let h24 = pickerHour;
        if (pickerPeriod === 'AM' && h24 === 12) h24 = 0;
        else if (pickerPeriod === 'PM' && h24 !== 12) h24 += 12;
        const timeStr = `${String(h24).padStart(2, '0')}:${String(pickerMinute).padStart(2, '0')}`;
        autoSave({ ...settings, scheduleTime: timeStr });
        setPickerOpen(false);
    };

    const formatDisplay = () => {
        const time24 = settings?.scheduleTime || '08:00';
        const [hStr, mStr] = time24.split(':');
        let h = parseInt(hStr, 10);
        const period = h >= 12 ? 'PM' : 'AM';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        return `${String(h).padStart(2, '0')}:${mStr} ${period}`;
    };

    useEffect(() => {
        loadSettings();
        const handleClickOutside = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                setPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    async function loadSettings() {
        const [settingsData, credsData] = await Promise.all([
            window.electronAPI.getSettings(),
            window.electronAPI.getCredentials(),
        ]);
        setSettings(settingsData);
        setCredentials(credsData);
    }

    const handleLogout = (action) => {
        setLogoutAction(action);
        setShowLogoutConfirm(true);
    };

    const confirmLogout = () => {
        if (logoutAction === 'reset') {
            onReset();
        } else {
            onLogout();
        }
        setShowLogoutConfirm(false);
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && showLogoutConfirm) {
                setShowLogoutConfirm(false);
            }
        };

        if (showLogoutConfirm) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showLogoutConfirm]);

    if (!settings) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>Loading settings...</p>
            </div>
        );
    }

    return (
        <div className="dash-layout">
            {/* ─── Sidebar (identical to Dashboard) ─── */}
            <aside className="dash-sidebar">
                <div className="dash-sidebar-top" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center' }}>
                    <img src={appLogo} alt="MealSync" style={{ height: '32px', width: 'auto' }} />
                    <nav className="dash-nav">
                        <button className="dash-nav-item" onClick={() => onNavigate('dashboard')}>
                            <LayoutDashboard size={18} /> Dashboard
                        </button>
                        <button className="dash-nav-item" onClick={() => onNavigate('history')}>
                            <HistoryIcon size={18} /> History
                        </button>
                        <button className="dash-nav-item active" onClick={() => onNavigate('settings')}>
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
                            <button className="dash-logout" onClick={() => onNavigate('settings')}>
                                Log out
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* ─── Main Area ─── */}
            <div className="dash-main">
                <header className="dash-header">
                    <div>
                        <h1 className="dash-page-title">Settings</h1>
                        <p className="dash-page-subtitle">Manage your automation and account preferences.</p>
                    </div>
                </header>

                <div className="dash-content-grid">
                    {/* ─── Left Column: Account + Automation ─── */}
                    <div className="dash-col-left">
                        {/* University Account Card */}
                        <div className="dash-card">
                            <div className="dash-card-header">
                                <h3 className="dash-card-title">
                                    <User size={18} className="settings-title-icon" /> University Account
                                </h3>
                            </div>

                            <div className="settings-account-detail">
                                <div className="settings-account-detail-row">
                                    <span className="settings-account-label">Student ID</span>
                                    <span className="settings-account-value">{credentials?.studentId || 'Not set'}</span>
                                </div>
                                <div className="settings-account-detail-row">
                                    <span className="settings-account-label">Student Name</span>
                                    <span className="settings-account-value student-name-arabic">
                                        {studentName && studentName !== 'Student User' ? studentName : '—'}
                                    </span>
                                </div>
                                <div className="settings-account-detail-row">
                                    <span className="settings-account-label">Status</span>
                                    <span className="settings-status-badge">Connected</span>
                                </div>
                            </div>

                            <div className="settings-account-actions">
                                <button className="settings-btn-logout" onClick={() => handleLogout('logout')}>
                                    <LogOut size={16} />
                                    Log Out
                                </button>
                                <button className="settings-btn-reset" onClick={() => handleLogout('reset')}>
                                    Reset Credentials
                                </button>
                            </div>
                            <p className="settings-danger-hint">
                                This will permanently delete stored credentials and stop automation.
                            </p>
                        </div>

                        {/* Automation Card */}
                        <div className="dash-card">
                            <div className="dash-card-header">
                                <h3 className="dash-card-title">
                                    <Cpu size={18} className="settings-title-icon" /> Automation
                                </h3>
                            </div>

                            <div className="settings-row">
                                <div className="settings-row-left">
                                    <div className="settings-row-icon"><Cpu size={16} /></div>
                                    <div className="settings-row-text">
                                        <span className="settings-row-title">Enable Auto-Booking</span>
                                        <span className="settings-row-desc">Schedule meals automatically without manual intervention.</span>
                                    </div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={settings.autoBook}
                                        onChange={(e) => autoSave({ ...settings, autoBook: e.target.checked })}
                                    />
                                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                                </label>
                            </div>

                            <div className={`settings-row ${!settings.autoBook ? 'row-disabled' : ''}`}>
                                <div className="settings-row-left">
                                    <div className="settings-row-icon"><Clock size={16} /></div>
                                    <div className="settings-row-text">
                                        <span className="settings-row-title">Daily Booking Time</span>
                                        <span className="settings-row-desc">Local Time (Cairo)</span>
                                    </div>
                                </div>
                                <div className="tp-wrapper" ref={pickerRef}>
                                    <button
                                        className="tp-trigger"
                                        onClick={openPicker}
                                        disabled={!settings.autoBook}
                                    >
                                        <Clock size={14} />
                                        <span>{formatDisplay()}</span>
                                        <ChevronDown size={14} className={`tp-chevron ${pickerOpen ? 'tp-chevron-open' : ''}`} />
                                    </button>

                                    {pickerOpen && (
                                        <div className="tp-popover">
                                            <div className="tp-popover-header">
                                                <span className="tp-popover-title">Set Time</span>
                                                <button className="tp-close" onClick={() => setPickerOpen(false)}>
                                                    <X size={14} />
                                                </button>
                                            </div>

                                            <div className="tp-selectors">
                                                {/* Hour */}
                                                <div className="tp-col">
                                                    <button className="tp-arrow" onClick={() => setPickerHour(h => h >= 12 ? 1 : h + 1)}>▲</button>
                                                    <span className="tp-value">{String(pickerHour).padStart(2, '0')}</span>
                                                    <button className="tp-arrow" onClick={() => setPickerHour(h => h <= 1 ? 12 : h - 1)}>▼</button>
                                                </div>

                                                <span className="tp-separator">:</span>

                                                {/* Minute */}
                                                <div className="tp-col">
                                                    <button className="tp-arrow" onClick={() => setPickerMinute(m => m >= 59 ? 0 : m + 1)}>▲</button>
                                                    <span className="tp-value">{String(pickerMinute).padStart(2, '0')}</span>
                                                    <button className="tp-arrow" onClick={() => setPickerMinute(m => m <= 0 ? 59 : m - 1)}>▼</button>
                                                </div>

                                                {/* AM/PM */}
                                                <div className="tp-period">
                                                    <button
                                                        className={`tp-period-btn ${pickerPeriod === 'AM' ? 'active' : ''}`}
                                                        onClick={() => setPickerPeriod('AM')}
                                                    >AM</button>
                                                    <button
                                                        className={`tp-period-btn ${pickerPeriod === 'PM' ? 'active' : ''}`}
                                                        onClick={() => setPickerPeriod('PM')}
                                                    >PM</button>
                                                </div>
                                            </div>

                                            <div className="tp-actions">
                                                <button className="tp-cancel" onClick={() => setPickerOpen(false)}>Cancel</button>
                                                <button className="tp-confirm" onClick={confirmPicker}>Confirm</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Right Column: Preferences + Advanced + Footer ─── */}
                    <div className="dash-col-right">
                        {/* Preferences Card */}
                        <div className="dash-card">
                            <div className="dash-card-header">
                                <h3 className="dash-card-title">
                                    <SettingsIcon size={18} className="settings-title-icon" /> Preferences
                                </h3>
                            </div>

                            <div className="settings-row">
                                <div className="settings-row-left">
                                    <div className="settings-row-icon"><Bell size={16} /></div>
                                    <div className="settings-row-text">
                                        <span className="settings-row-title">Notifications</span>
                                        <span className="settings-row-desc">Desktop alerts on booking events.</span>
                                    </div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={settings.notifications}
                                        onChange={(e) => autoSave({ ...settings, notifications: e.target.checked })}
                                    />
                                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                                </label>
                            </div>

                            <div className="settings-row">
                                <div className="settings-row-left">
                                    <div className="settings-row-icon"><Monitor size={16} /></div>
                                    <div className="settings-row-text">
                                        <span className="settings-row-title">Launch at Startup</span>
                                        <span className="settings-row-desc">Start MealSync when Windows boots.</span>
                                    </div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={settings.startWithWindows}
                                        onChange={(e) => autoSave({ ...settings, startWithWindows: e.target.checked })}
                                    />
                                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                                </label>
                            </div>
                        </div>

                        {/* Advanced Card */}
                        <div className="dash-card">
                            <div className="dash-card-header">
                                <h3 className="dash-card-title">
                                    <Bug size={18} className="settings-title-icon" /> Advanced
                                </h3>
                            </div>

                            <div className="settings-row">
                                <div className="settings-row-left">
                                    <div className="settings-row-icon"><Bug size={16} /></div>
                                    <div className="settings-row-text">
                                        <span className="settings-row-title">Debug Mode</span>
                                        <span className="settings-row-desc">Show booking browser for troubleshooting.</span>
                                    </div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={settings.debugMode}
                                        onChange={(e) => autoSave({ ...settings, debugMode: e.target.checked })}
                                    />
                                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '32px', paddingBottom: '16px' }}>
                    <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>
                        MealSync v1.0.0 · Built by Yousef Ehab
                    </p>
                    <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>
                        Please remember my mother in your prayers.
                    </p>
                    <a onClick={() => window.electronAPI.openExternal('https://github.com/yousef-ehabb/MealSync')}
                        style={{ fontSize: '12px', color: '#4F46E5', cursor: 'pointer' }}>
                        View on GitHub →
                    </a>
                </div>
            </div>

            {/* Logout / Reset Confirmation Modal */}
            {showLogoutConfirm && (
                <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-icon">
                            <LogOut size={24} />
                        </div>
                        <h3 className="modal-title">
                            {logoutAction === 'reset' ? 'Reset Account' : 'Confirm Logout'}
                        </h3>
                        <p className="modal-desc">
                            {logoutAction === 'reset'
                                ? 'This will permanently delete your stored credentials and reset MealSync.'
                                : 'This will stop automation and log you out. Your credentials will remain saved.'}
                        </p>
                        <div className="modal-actions">
                            <button
                                className="modal-btn-cancel"
                                onClick={() => setShowLogoutConfirm(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="modal-btn-danger"
                                onClick={confirmLogout}
                            >
                                {logoutAction === 'reset' ? 'Reset' : 'Log Out'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Settings;
