// P1-4: Extracted shared Sidebar component — replaces ~30 lines of duplicated JSX
// across Dashboard.jsx, History.jsx, and Settings.jsx
import {
    LayoutDashboard, Settings as SettingsIcon,
    History as HistoryIcon, User
} from 'lucide-react';
import appLogo from '../../assets/MainAppLogo.png';

function Sidebar({ activePage, onNavigate, studentName }) {
    return (
        <aside className="dash-sidebar">
            <div className="dash-sidebar-top" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center' }}>
                <img src={appLogo} alt="MealSync" style={{ height: '32px', width: 'auto' }} />
                <nav className="dash-nav">
                    <button className={`dash-nav-item ${activePage === 'dashboard' ? 'active' : ''}`} onClick={() => onNavigate('dashboard')} data-testid="nav-dashboard">
                        <LayoutDashboard size={18} /> Dashboard
                    </button>
                    <button className={`dash-nav-item ${activePage === 'history' ? 'active' : ''}`} onClick={() => onNavigate('history')}>
                        <HistoryIcon size={18} /> History
                    </button>
                    <button className={`dash-nav-item ${activePage === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')}>
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
    );
}

export default Sidebar;
