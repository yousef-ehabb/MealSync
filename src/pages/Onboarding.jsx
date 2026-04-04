import { useState, useEffect } from 'react';
import {
    Clock, Bell, Settings as SettingsIcon, Shield,
    ChevronRight, ChevronLeft, Calendar, Monitor,
    Cpu, Check, User, Lock, ShieldCheck, Rocket,
    Zap, Database, Layout, UserPlus, Eye, EyeOff,
    ArrowRight, CreditCard
} from 'lucide-react';
import TimePicker from '../components/TimePicker';
import AppSecondryIcon from '../../assets/AppSecondryIcon.ico';

function Onboarding({ onComplete, showToast }) {
    const [step, setStep] = useState(0);
    const [studentId, setStudentId] = useState('');
    const [password, setPassword] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [validationMessageIdx, setValidationMessageIdx] = useState(0);
    const [isSlow, setIsSlow] = useState(false);
    const [isShaking, setIsShaking] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        const checkCreds = async () => {
            const status = await window.electronAPI.getStatus();
            if (status.hasCredentials && status.studentId) {
                setStudentId(status.studentId);
                // Do NOT pre-fill password or automatically login for security reasons
                setPassword('');
                setStep(2);
            } else {
                setStep(1);
            }
        };
        checkCreds();
    }, []);

    const messages = [
        "Connecting to portal...",
        "Verifying credentials...",
        "Just a moment..."
    ];

    useEffect(() => {
        let messageInterval;
        let slowTimeout;

        if (isValidating) {
            setValidationMessageIdx(0);
            setIsSlow(false);

            messageInterval = setInterval(() => {
                setValidationMessageIdx(prev => (prev + 1) % messages.length);
            }, 2000);

            slowTimeout = setTimeout(() => {
                setIsSlow(true);
            }, 5000);
        }

        return () => {
            clearInterval(messageInterval);
            clearTimeout(slowTimeout);
        };
    }, [isValidating]);

    // Settings
    const [autoBook, setAutoBook] = useState(true);
    const [scheduleTime, setScheduleTime] = useState('08:00');
    const [notifications, setNotifications] = useState(true);
    const [startWithWindows, setStartWithWindows] = useState(false);

    const handleRegister = async () => {
        if (!studentId || !password) {
            setErrorMsg('Please enter your National ID and Password');
            triggerShake();
            return;
        }

        if (studentId.length !== 14) {
            setErrorMsg('National ID must be exactly 14 digits');
            triggerShake();
            return;
        }

        setErrorMsg('');
        setIsValidating(true);

        let result;
        try {
            result = await window.electronAPI.saveCredentials({ studentId, password });
        } catch (ipcError) {
            setIsValidating(false);
            setErrorMsg('Unexpected error — please try again');
            triggerShake();
            return;
        }

        setIsValidating(false);

        // STRICT check — only proceed on explicit true, never on truthy/undefined
        if (result && result.success === true) {
            setIsSuccess(true);
            setTimeout(() => {
                setIsSuccess(false);
                setStep(3);
            }, 600);
        } else {
            // Map error to user-friendly message using both type and error string
            const errorType = result?.type || '';
            const errorStr = result?.error || '';

            let friendlyError;
            if (errorType === 'invalid_credentials' || errorStr.includes('خطأ فى البيانات') || errorStr.includes('بيانات غير صحيحة') || errorStr.includes('Invalid')) {
                friendlyError = 'Invalid credentials — please check your Student ID and password';
            } else if (errorType === 'timeout' || errorStr.toLowerCase().includes('timeout') || errorStr.toLowerCase().includes('too long')) {
                friendlyError = 'Could not reach portal — check your internet connection';
            } else if (errorStr.includes('Browser component') || errorStr.includes('reinstall')) {
                friendlyError = 'Browser component missing — please reinstall MealSync';
            } else if (errorStr.includes('unexpected page')) {
                friendlyError = 'Portal returned an unexpected page — please try again later';
            } else {
                friendlyError = 'Login failed — please try again';
            }

            setErrorMsg(friendlyError);
            triggerShake();
        }
    };

    const triggerShake = () => {
        setIsShaking(false);
        // Small delay to allow react to re-trigger the animation if it was already shaking
        setTimeout(() => setIsShaking(true), 10);
    };

    const handleSaveSettings = async () => {
        await window.electronAPI.saveSettings({
            autoBook,
            scheduleTime,
            notifications,
            startWithWindows,
            debugMode: false,
        });

        showToast('Setup complete! 🎉', 'success');
        setTimeout(() => onComplete(), 1000);
    };

    return (
        <div className="onboarding">
            <div className="onboarding-container">


                {/* Step 0: Loading */}
                {step === 0 && (
                    <div className="onboarding-step fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
                        <div className="spinner"></div>
                    </div>
                )}

                {/* Step 1: Welcome */}
                {step === 1 && (
                    <div className="onboarding-step fade-in">
                        <div className="onboarding-icon-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <img src={AppSecondryIcon} alt="MealSync" style={{ height: '48px', width: '48px', userSelect: 'none' }} />
                        </div>
                        <h1>Welcome to MealSync</h1>
                        <p className="subtitle">Never miss a meal booking again.</p>

                        <div className="feature-list">
                            <div className="feature-item">
                                <div className="feature-icon-flat">
                                    <Zap size={20} />
                                </div>
                                <div>
                                    <h3>Auto Booking</h3>
                                    <p>Set it once and forget it. We handle the rest.</p>
                                </div>
                            </div>
                            <div className="feature-item">
                                <div className="feature-icon-flat">
                                    <Bell size={20} />
                                </div>
                                <div>
                                    <h3>Smart Notifications</h3>
                                    <p>Get notified when your meal is booked.</p>
                                </div>
                            </div>
                            <div className="feature-item">
                                <div className="feature-icon-flat">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h3>Secure Storage</h3>
                                    <p>Your data stays on your machine, encrypted.</p>
                                </div>
                            </div>
                        </div>

                        <button className="btn btn-primary" onClick={() => setStep(2)}>
                            Get Started
                            <ChevronRight size={18} style={{ marginLeft: '8px' }} />
                        </button>
                    </div>
                )}

                {/* Step 2: Login */}
                {step === 2 && (
                    <div className={`onboarding-step fade-in ${isShaking ? 'shake' : ''}`} onAnimationEnd={() => setIsShaking(false)}>
                        <div className="onboarding-icon-circle">
                            <img src={AppSecondryIcon} alt="MealSync" style={{ height: '48px', width: '48px', userSelect: 'none' }} />
                        </div>
                        <h1>Account Setup</h1>
                        <p className="subtitle">Enter your university portal credentials to sync your meal plan.</p>

                        <div className="form-group">
                            <label>Student ID</label>
                            <div className="input-wrapper">
                                <CreditCard size={18} className="input-icon-left" />
                                <input
                                    type="text"
                                    placeholder="Enter 14-digit National ID"
                                    value={studentId}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, ''); // Numeric only
                                        setStudentId(val);
                                        if (errorMsg) setErrorMsg('');
                                    }}
                                    disabled={isValidating || isSuccess}
                                    maxLength={14}
                                    autoComplete="off"
                                    className="input-with-icon"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Portal Password</label>
                            <div className="input-wrapper">
                                <Lock size={18} className="input-icon-left" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••••"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (errorMsg) setErrorMsg('');
                                    }}
                                    disabled={isValidating || isSuccess}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                                    autoComplete="new-password"
                                    className="input-with-icon input-with-toggle"
                                />
                                <button
                                    type="button"
                                    className="input-toggle-btn"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="encryption-badge">
                            <ShieldCheck size={14} />
                            <span>AES-256-GCM ENCRYPTION ACTIVE</span>
                        </div>

                        <button
                            className={`btn btn-gradient-primary ${isValidating ? 'btn-loading' : ''} ${isSuccess ? 'btn-verified' : ''}`}
                            onClick={handleRegister}
                            disabled={isValidating || isSuccess}
                            style={{ marginTop: '24px' }}
                        >
                            {isSuccess ? (
                                <><Check size={18} /> Verified!</>
                            ) : isValidating ? (
                                <><span className="btn-spinner" />{isSlow ? 'Still connecting...' : 'Verifying...'}</>
                            ) : (
                                <>Verify & Login <ArrowRight size={18} style={{ marginLeft: '8px' }} /></>
                            )}
                        </button>

                        {errorMsg && (
                            <div className="error-text-below">
                                {errorMsg}
                            </div>
                        )}

                        <button
                            className="back-link"
                            onClick={() => setStep(1)}
                            disabled={isValidating || isSuccess}
                        >
                            <ChevronLeft size={14} style={{ marginRight: '4px' }} />
                            Back to Welcome
                        </button>
                    </div>
                )}

                {/* Step 3: Settings */}
                {step === 3 && (
                    <div className="onboarding-step fade-in">
                        <div className="onboarding-icon-circle">
                            <SettingsIcon size={32} color="var(--color-primary)" />
                        </div>
                        <h1>Automation Setup</h1>
                        <p className="subtitle">Configure your booking preferences.</p>

                        <div className="settings-list">
                            {/* Auto-Booking */}
                            <div className="setting-row">
                                <div className="setting-left">
                                    <div className="setting-icon-circle">
                                        <Cpu size={18} />
                                    </div>
                                    <div className="setting-info">
                                        <span className="setting-title">Auto-Booking</span>
                                        <span className="setting-desc">Automatically reserve meals at your selected time.</span>
                                    </div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={autoBook}
                                        onChange={(e) => setAutoBook(e.target.checked)}
                                    />
                                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                                </label>
                            </div>

                            <div className="setting-divider" />

                            {/* Booking Time */}
                            <div className={`setting-row ${!autoBook ? 'setting-disabled' : ''}`}>
                                <div className="setting-left">
                                    <div className="setting-icon-circle">
                                        <Clock size={18} />
                                    </div>
                                    <div className="setting-info">
                                        <span className="setting-title">Booking Time</span>
                                        <span className="setting-desc">When to auto-book your meals daily.</span>
                                    </div>
                                </div>
                                <TimePicker
                                    value={scheduleTime}
                                    onChange={setScheduleTime}
                                    disabled={!autoBook}
                                />
                            </div>

                            <div className="setting-divider" />

                            {/* Notifications */}
                            <div className="setting-row">
                                <div className="setting-left">
                                    <div className="setting-icon-circle">
                                        <Bell size={18} />
                                    </div>
                                    <div className="setting-info">
                                        <span className="setting-title">Notifications</span>
                                        <span className="setting-desc">Receive alerts about booking status.</span>
                                    </div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={notifications}
                                        onChange={(e) => setNotifications(e.target.checked)}
                                    />
                                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                                </label>
                            </div>

                            <div className="setting-divider" />

                            {/* Start with Windows */}
                            <div className="setting-row">
                                <div className="setting-left">
                                    <div className="setting-icon-circle">
                                        <Monitor size={18} />
                                    </div>
                                    <div className="setting-info">
                                        <span className="setting-title">Start with Windows</span>
                                        <span className="setting-desc">Launch app automatically on system startup.</span>
                                    </div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={startWithWindows}
                                        onChange={(e) => setStartWithWindows(e.target.checked)}
                                    />
                                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                                </label>
                            </div>
                        </div>

                        <div className="setup-footer">
                            <button className="btn btn-outline-back" onClick={() => setStep(2)}>
                                <ChevronLeft size={16} />
                                Back
                            </button>
                            <button className="btn btn-gradient-primary" onClick={handleSaveSettings}>
                                <Check size={18} />
                                Finish Setup
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Onboarding;
