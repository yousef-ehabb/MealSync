// electron/portalConstants.js
// Central config for all university portal URLs, selectors, and Arabic text.
// Update here when the portal changes — nowhere else.

export const PORTAL = {
    BASE_URL: 'https://al-zahraa.mans.edu.eg',
    LOGIN_URL: 'https://al-zahraa.mans.edu.eg/studentLogin',
    HOME_URL: 'https://al-zahraa.mans.edu.eg/studentHome',
    HOME_URL_PATTERN: '**/studentHome**',

    SELECTORS: {
        STUDENT_ID_INPUT: 'input[name="txtStudentID"]',
        PASSWORD_INPUT: 'input[name="txtStudentPassword"]',
        MEAL_CHECKBOX: 'input[name="chkMeals"]',
        SAVE_BUTTON: 'input[type="submit"], button[type="submit"]',
        NAV_PROFILE_NAME: '.nav-profile-text .font-weight-bold',
        ERROR_SPAN: '#spErr',
    },

    TEXT: {
        LOGIN_BUTTON: 'دخول',
        LOGIN_ERROR: 'بيانات غير صحيحة',
        MEALS_NAV: 'الوجبـــــات',
        MEALS_NAV_SHORT: 'الوجبات',
        BOOK_MEALS_LINK: 'حجز الوجبات',
        SAVE_BUTTON: 'حفظ',
        MEAL_REPORT_LINK: 'تقرير الوجبات',
        REPORT_KEYWORD: 'تقرير',
    },

    // Multiple known error patterns the portal may show on invalid login.
    // loginHelper.js checks ALL of these to catch credential failures.
    LOGIN_ERROR_PATTERNS: [
        'بيانات غير صحيحة',
        'خطأ فى البيانات',
        'خطأ في البيانات',
        'غير صحيح',
        'Invalid',
    ],
};