// P1-5: Extracted shared TimePicker component — replaces ~70 lines of duplicated
// time picker logic in Settings.jsx and Onboarding.jsx
import { useState, useEffect, useRef } from 'react';
import { Clock, ChevronDown, X } from 'lucide-react';

function TimePicker({ value, onChange, disabled }) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerHour, setPickerHour] = useState(8);
    const [pickerMinute, setPickerMinute] = useState(0);
    const [pickerPeriod, setPickerPeriod] = useState('AM');
    const pickerRef = useRef(null);

    const openPicker = () => {
        const time24 = value || '08:00';
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
        onChange(timeStr);
        setPickerOpen(false);
    };

    const formatDisplay = () => {
        const time24 = value || '08:00';
        const [hStr, mStr] = time24.split(':');
        let h = parseInt(hStr, 10);
        const period = h >= 12 ? 'PM' : 'AM';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        return `${String(h).padStart(2, '0')}:${mStr} ${period}`;
    };

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                setPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="tp-wrapper" ref={pickerRef}>
            <button
                className="tp-trigger"
                onClick={openPicker}
                disabled={disabled}
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
                        <div className="tp-col">
                            <button className="tp-arrow" onClick={() => setPickerHour(h => h >= 12 ? 1 : h + 1)}>▲</button>
                            <span className="tp-value">{String(pickerHour).padStart(2, '0')}</span>
                            <button className="tp-arrow" onClick={() => setPickerHour(h => h <= 1 ? 12 : h - 1)}>▼</button>
                        </div>
                        <span className="tp-separator">:</span>
                        <div className="tp-col">
                            <button className="tp-arrow" onClick={() => setPickerMinute(m => m >= 59 ? 0 : m + 1)}>▲</button>
                            <span className="tp-value">{String(pickerMinute).padStart(2, '0')}</span>
                            <button className="tp-arrow" onClick={() => setPickerMinute(m => m <= 0 ? 59 : m - 1)}>▼</button>
                        </div>
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
    );
}

export default TimePicker;
