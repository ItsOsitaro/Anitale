// Extra admin texts for the system pages (merged into src/admin/i18n.js).
export default {
  en: {
    // Login
    loginSub: 'Enter your admin account to continue.', loginShow: 'Show password', loginHide: 'Hide password', loginCaps: 'Caps Lock is on', loginEmpty: 'Enter both username and password.',
    loginFailedN: 'Wrong username or password ({n} failed tries). Too many tries lock the form for 15 minutes.', loginBack: 'Back to the site', loginServerDown: 'The server answered with an error. Try again in a minute.',
    // Activity log
    logFilters: 'Filters', logSearch: 'Search in path…', logAdmin: 'Admin', logAllAdmins: 'All admins', logStatusAll: 'All results', logStatusOk: 'Done only', logStatusFail: 'Failed only',
    logMethodAll: 'All actions', logFrom: 'From', logTo: 'To', logClear: 'Clear filters', logExport: 'Download CSV', logAuto: 'Auto-refresh', logRefresh: 'Refresh',
    logPageOf: '{from}–{to} of {total}', logPrev: 'Previous', logNext: 'Next', logWho: 'Admin', logMs: '{n} ms', logNoMatch: 'Nothing matches these filters.', logLoadFail: 'Could not load the log.', logRetry: 'Try again',
    logVerbPOST: 'Add', logVerbEdit: 'Edit', logVerbDELETE: 'Delete', logUnknownAdmin: '—', logTotalNote: '{n} records',
    // Health
    hlRefresh: 'Refresh now', hlPause: 'Pause', hlResume: 'Resume', hlEvery: 'Refresh every', hlEvery5: '5 seconds', hlEvery15: '15 seconds', hlEvery60: '1 minute', hlUpdated: 'Updated {time}', hlPaused: 'Paused',
    hlStale: 'Could not update. Showing the last data from {time}.', hlAllGood: 'Everything looks healthy.', hlProblems: 'Needs attention',
    hlWarnMem: 'Memory is almost full ({n}%).', hlWarnDisk: 'Disk is almost full ({n}%).', hlWarnLoad: 'The CPU is overloaded.', hlWarnLag: 'The site is responding slowly (delay {n} ms).', hlWarnTenrai: 'Tenrai is paused after failures.', hlWarnVpn: 'The VPN is set up but not running.', hlWarnWal: 'The database log file is large ({size}).',
    hlLag: 'Response delay', hlLagSub: 'event loop', hlHeap: 'Site memory in use', hlChecked: 'Checked {time}', hlSlow: 'slow', hlErrAll: 'All', hlErrErrors: 'Errors', hlErrWarns: 'Warnings', hlCopy: 'Copy', hlCopied: 'Copied.', hlSkipped: 'Not used',
    hlLoadFail: 'Could not load the health data.', hlWarnSwap: 'Swap is heavily used ({n}%).',
    // VPN
    vpnNoEdit: 'You can only view this page. Changing the VPN needs edit access.', vpnSteps: 'How it works: 1) pick the type, 2) paste the config, 3) press Apply. The site tests it and goes back to the old setting if it fails.',
    vpnCount: '{n} characters', vpnHide: 'Hide text', vpnShow: 'Show text', vpnPaste: 'Paste', vpnPasteFail: 'Could not read the clipboard. Paste with Ctrl+V.', vpnClear: 'Clear',
    vpnBadV2ray: 'The link must start with vless://, vmess:// or trojan://.', vpnBadWg: 'A WireGuard config must contain an [Interface] section.', vpnTooLong: 'This text is too long to be a VPN config.',
    vpnReplaceConfirm: 'The VPN is on now. Replace it with the new {name} config? If the new one fails, the old one is restored.', vpnUnsavedConfirm: 'The text you pasted will be lost. Continue?', vpnSwitchConfirm: 'Switch the site to {name}? Imports pause for a few seconds.',
    vpnServerMasked: 'Server (partly hidden)', vpnTestedAt: 'Tested {time}', vpnShortcut: 'Ctrl+Enter applies', vpnStatusLoadFail: 'Could not load the VPN status.', vpnRetry: 'Try again', vpnChecking: 'Checking…',
    vpnSlow: 'slow', vpnTargets: 'Sites tested through the VPN', vpnProfiles: 'Saved profiles', vpnNoProfile: 'Nothing saved', vpnBusyNote: 'Working… this can take up to a minute.',
  },
  fa: {
    loginSub: 'برای ادامه، حساب مدیر را وارد کن.', loginShow: 'نمایش گذرواژه', loginHide: 'پنهان کردن گذرواژه', loginCaps: 'Caps Lock روشن است', loginEmpty: 'نام کاربری و گذرواژه را وارد کن.',
    loginFailedN: 'نام کاربری یا گذرواژه اشتباه است ({n} تلاش ناموفق). با تلاش‌های زیاد فرم ۱۵ دقیقه قفل می‌شود.', loginBack: 'بازگشت به سایت', loginServerDown: 'سرور خطا داد. یک دقیقه‌ی دیگر دوباره امتحان کن.',
    logFilters: 'فیلترها', logSearch: 'جستجو در مسیر…', logAdmin: 'مدیر', logAllAdmins: 'همه‌ی مدیرها', logStatusAll: 'همه‌ی نتیجه‌ها', logStatusOk: 'فقط موفق', logStatusFail: 'فقط ناموفق',
    logMethodAll: 'همه‌ی کارها', logFrom: 'از', logTo: 'تا', logClear: 'پاک‌کردن فیلترها', logExport: 'دانلود CSV', logAuto: 'به‌روزرسانی خودکار', logRefresh: 'به‌روزرسانی',
    logPageOf: '{from} تا {to} از {total}', logPrev: 'قبلی', logNext: 'بعدی', logWho: 'مدیر', logMs: '{n} میلی‌ثانیه', logNoMatch: 'چیزی با این فیلترها پیدا نشد.', logLoadFail: 'گزارش بارگذاری نشد.', logRetry: 'دوباره امتحان کن',
    logVerbPOST: 'افزودن', logVerbEdit: 'ویرایش', logVerbDELETE: 'حذف', logUnknownAdmin: '—', logTotalNote: '{n} مورد',
    hlRefresh: 'همین حالا به‌روز کن', hlPause: 'توقف', hlResume: 'ادامه', hlEvery: 'به‌روزرسانی هر', hlEvery5: '۵ ثانیه', hlEvery15: '۱۵ ثانیه', hlEvery60: '۱ دقیقه', hlUpdated: 'به‌روز شد {time}', hlPaused: 'متوقف',
    hlStale: 'به‌روزرسانی نشد. آخرین داده‌ی {time} نمایش داده می‌شود.', hlAllGood: 'همه‌چیز سالم به نظر می‌رسد.', hlProblems: 'نیازمند رسیدگی',
    hlWarnMem: 'حافظه تقریباً پر است ({n}٪).', hlWarnDisk: 'دیسک تقریباً پر است ({n}٪).', hlWarnLoad: 'پردازنده زیر فشار زیاد است.', hlWarnLag: 'سایت کند جواب می‌دهد (تأخیر {n} میلی‌ثانیه).', hlWarnTenrai: 'Tenrai بعد از چند خطا موقتاً کنار گذاشته شده.', hlWarnVpn: 'وی‌پی‌ان تنظیم شده ولی روشن نیست.', hlWarnWal: 'فایل لاگ دیتابیس بزرگ است ({size}).',
    hlLag: 'تأخیر پاسخ‌گویی', hlLagSub: 'event loop', hlHeap: 'حافظه‌ی در حال استفاده‌ی سایت', hlChecked: 'بررسی شد {time}', hlSlow: 'کند', hlErrAll: 'همه', hlErrErrors: 'خطاها', hlErrWarns: 'هشدارها', hlCopy: 'کپی', hlCopied: 'کپی شد.', hlSkipped: 'استفاده نمی‌شود',
    hlLoadFail: 'اطلاعات سلامت بارگذاری نشد.', hlWarnSwap: 'swap خیلی پر شده ({n}٪).',
    vpnNoEdit: 'فقط می‌توانی این صفحه را ببینی. تغییر وی‌پی‌ان به دسترسی ویرایش نیاز دارد.', vpnSteps: 'روش کار: ۱) نوع را انتخاب کن، ۲) تنظیمات را بچسبان، ۳) «اعمال» را بزن. سایت آن را تست می‌کند و اگر کار نکرد به تنظیم قبلی برمی‌گردد.',
    vpnCount: '{n} نویسه', vpnHide: 'پنهان کردن متن', vpnShow: 'نمایش متن', vpnPaste: 'چسباندن', vpnPasteFail: 'به کلیپ‌بورد دسترسی نبود. با Ctrl+V بچسبان.', vpnClear: 'پاک کن',
    vpnBadV2ray: 'لینک باید با vless:// یا vmess:// یا trojan:// شروع شود.', vpnBadWg: 'تنظیمات WireGuard باید بخش [Interface] داشته باشد.', vpnTooLong: 'این متن برای تنظیمات وی‌پی‌ان بیش از حد طولانی است.',
    vpnReplaceConfirm: 'الان وی‌پی‌ان روشن است. با تنظیمات جدید {name} جایگزین شود؟ اگر جدید کار نکند، قبلی برمی‌گردد.', vpnUnsavedConfirm: 'متنی که چسباندی از بین می‌رود. ادامه بدهیم؟', vpnSwitchConfirm: 'سایت به {name} تغییر کند؟ ایمپورت چند ثانیه متوقف می‌شود.',
    vpnServerMasked: 'سرور (بخشی پنهان)', vpnTestedAt: 'تست شد {time}', vpnShortcut: 'Ctrl+Enter اعمال می‌کند', vpnStatusLoadFail: 'وضعیت وی‌پی‌ان بارگذاری نشد.', vpnRetry: 'دوباره امتحان کن', vpnChecking: 'در حال بررسی…',
    vpnSlow: 'کند', vpnTargets: 'سایت‌هایی که از طریق وی‌پی‌ان تست شدند', vpnProfiles: 'پروفایل‌های ذخیره‌شده', vpnNoProfile: 'چیزی ذخیره نشده', vpnBusyNote: 'در حال انجام… تا یک دقیقه طول می‌کشد.',
  },
};
