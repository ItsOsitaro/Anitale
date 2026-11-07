// Extra admin texts for the community pages (merged over src/admin/i18n.js).
export default {
  en: {
    // shared
    cmFirst: 'First page', cmLast: 'Last page', cmRetry: 'Retry', cmSelected: '{n} selected', cmClear: 'Clear selection',
    cmMore: 'Show more', cmLess: 'Show less', cmExport: 'Export CSV', cmSort: 'Sort', cmAll: 'All', cmFilters: 'Filters',
    cmReadOnly: 'You can view this page but not change anything.', cmSelectAll: 'Select all on this page', cmSelectRow: 'Select {name}',
    cmClearFilters: 'Clear filters', cmNoMatch: 'Nothing matches these filters.', cmCopied: 'Copied', cmCopyFail: 'Could not copy',
    cmCopyText: 'Copy text', cmCopyName: 'Copy username', cmByUser: 'Show only this user', cmProfile: 'Open profile', cmViewTitle: 'Open title',
    cmDeleteSelected: 'Delete selected', cmBulkConfirm: 'Delete {n} selected items? This cannot be undone.', cmBulkDone: '{n} deleted',
    cmMoreActions: 'More actions', cmShow: 'Show', cmHide: 'Hide', cmDiscard: 'You have unsaved changes. Discard them?', cmReset: 'Undo changes', cmClose: 'Close',
    // reviews
    rvSearch: 'Search user, text or title… (press /)', rvTotal: '{n} reviews', rvHelpful: 'Helpful',
    rvSort_new: 'Newest', rvSort_old: 'Oldest', rvSort_helpful: 'Most helpful', rvSort_high: 'Highest score', rvSort_low: 'Lowest score', rvSort_long: 'Longest',
    rvEmpty: 'No reviews yet.',
    // recommendations
    rcSearch: 'Search user, text or title… (press /)', rcTotal: '{n} recommendations', rcVoted: 'Has helpful votes',
    rcSort_new: 'Newest', rcSort_old: 'Oldest', rcSort_helpful: 'Most helpful', rcSort_long: 'Longest',
    // suggestions
    sgSearch: 'Search user, title or text… (press /)', sgKind: 'Type', sgTotal: '{n} suggestions', sgEmpty: 'Nothing here.',
    sgEmptyPending: 'All caught up. No suggestions are waiting.', sgAlready: 'Someone already handled this one. The list was refreshed.',
    sgBulkApproveConfirm: 'Approve and apply {n} suggestions?', sgBulkDone: '{n} suggestions done', sgBulkPartial: '{ok} of {n} done. The rest failed or were already handled.',
    sgPreset1: 'Not accurate', sgPreset2: 'Duplicate of an existing edit', sgPreset3: 'Not clear enough',
    sgReasonPh: 'Reason shown to the member (3+ characters)…',
    // site users
    usersSearch: 'Search username… (press /)', usersTotal: '{n} users', uExport: 'Export CSV',
    uSort_new: 'Newest', uSort_old: 'Oldest', uSort_name: 'Name', uSort_entries: 'Most titles',
    uFilter_listed: 'Has a list', uFilter_empty: 'Empty list', uFilter_verified: 'Email verified', uFilter_unverified: 'Email not verified',
    uGenerate: 'Generate', uVerified: 'Verified', uUnverified: 'Not verified', uNoEmail: 'No email',
    uRenameConfirm: 'Rename "{from}" to "{to}"? Their profile link will change.', uDeleteLists: 'Their {n} list entries will be removed too.',
    uRemoveEntryConfirm: 'Remove "{slug}" from this list?', uEntrySearch: 'Filter titles…',
    uSumReviews: 'Reviews', uSumRecs: 'Recommendations', uSumSuggestions: 'Suggestions', uSumFollowers: 'Followers', uSumFollowing: 'Following',
    uNameRule: 'Username: 3–24 letters, digits, _ or -.', uPassRule: 'Password: at least {n} characters.',
  },
  fa: {
    // shared
    cmFirst: 'صفحه‌ی اول', cmLast: 'صفحه‌ی آخر', cmRetry: 'تلاش دوباره', cmSelected: '{n} مورد انتخاب شد', cmClear: 'لغو انتخاب',
    cmMore: 'بیشتر', cmLess: 'کمتر', cmExport: 'خروجی CSV', cmSort: 'مرتب‌سازی', cmAll: 'همه', cmFilters: 'فیلترها',
    cmReadOnly: 'فقط می‌توانید این صفحه را ببینید و تغییری نمی‌توانید بدهید.', cmSelectAll: 'انتخاب همه‌ی این صفحه', cmSelectRow: 'انتخاب {name}',
    cmClearFilters: 'پاک‌کردن فیلترها', cmNoMatch: 'چیزی با این فیلترها پیدا نشد.', cmCopied: 'کپی شد', cmCopyFail: 'کپی نشد',
    cmCopyText: 'کپی متن', cmCopyName: 'کپی نام کاربری', cmByUser: 'فقط این کاربر', cmProfile: 'باز کردن پروفایل', cmViewTitle: 'باز کردن عنوان',
    cmDeleteSelected: 'حذف انتخاب‌شده‌ها', cmBulkConfirm: '{n} مورد انتخاب‌شده حذف شود؟ این کار برگشت ندارد.', cmBulkDone: '{n} مورد حذف شد',
    cmMoreActions: 'کارهای بیشتر', cmShow: 'نمایش', cmHide: 'پنهان', cmDiscard: 'تغییرات ذخیره‌نشده دارید. دور ریخته شود؟', cmReset: 'برگرداندن تغییرات', cmClose: 'بستن',
    // reviews
    rvSearch: 'جستجوی کاربر، متن یا عنوان… (کلید /)', rvTotal: '{n} نظر', rvHelpful: 'مفید',
    rvSort_new: 'جدیدترین', rvSort_old: 'قدیمی‌ترین', rvSort_helpful: 'مفیدترین', rvSort_high: 'بالاترین امتیاز', rvSort_low: 'پایین‌ترین امتیاز', rvSort_long: 'بلندترین',
    rvEmpty: 'هنوز نظری ثبت نشده.',
    // recommendations
    rcSearch: 'جستجوی کاربر، متن یا عنوان… (کلید /)', rcTotal: '{n} پیشنهاد', rcVoted: 'دارای رأی «مفید»',
    rcSort_new: 'جدیدترین', rcSort_old: 'قدیمی‌ترین', rcSort_helpful: 'مفیدترین', rcSort_long: 'بلندترین',
    // suggestions
    sgSearch: 'جستجوی کاربر، عنوان یا متن… (کلید /)', sgKind: 'نوع', sgTotal: '{n} پیشنهاد', sgEmpty: 'چیزی اینجا نیست.',
    sgEmptyPending: 'همه‌چیز رسیدگی شده؛ پیشنهادی در انتظار نیست.', sgAlready: 'این مورد را کس دیگری رسیدگی کرده بود. فهرست تازه شد.',
    sgBulkApproveConfirm: '{n} پیشنهاد تأیید و اعمال شود؟', sgBulkDone: '{n} پیشنهاد انجام شد', sgBulkPartial: '{ok} از {n} انجام شد. بقیه خطا دادند یا قبلاً رسیدگی شده بودند.',
    sgPreset1: 'دقیق نیست', sgPreset2: 'تکراری است', sgPreset3: 'کافی روشن نیست',
    sgReasonPh: 'دلیل برای کاربر (حداقل ۳ حرف)…',
    // site users
    usersSearch: 'جستجوی نام کاربری… (کلید /)', usersTotal: '{n} کاربر', uExport: 'خروجی CSV',
    uSort_new: 'جدیدترین', uSort_old: 'قدیمی‌ترین', uSort_name: 'نام', uSort_entries: 'بیشترین عنوان',
    uFilter_listed: 'دارای فهرست', uFilter_empty: 'فهرست خالی', uFilter_verified: 'ایمیل تأییدشده', uFilter_unverified: 'ایمیل تأییدنشده',
    uGenerate: 'ساخت', uVerified: 'تأییدشده', uUnverified: 'تأییدنشده', uNoEmail: 'بدون ایمیل',
    uRenameConfirm: 'نام «{from}» به «{to}» عوض شود؟ نشانی پروفایل او هم تغییر می‌کند.', uDeleteLists: '{n} مورد فهرست او هم پاک می‌شود.',
    uRemoveEntryConfirm: '«{slug}» از این فهرست برداشته شود؟', uEntrySearch: 'فیلتر عنوان‌ها…',
    uSumReviews: 'نظرها', uSumRecs: 'پیشنهادها', uSumSuggestions: 'پیشنهاد ویرایش', uSumFollowers: 'دنبال‌کننده', uSumFollowing: 'دنبال‌شونده',
    uNameRule: 'نام کاربری: ۳ تا ۲۴ حرف انگلیسی، رقم، _ یا -.', uPassRule: 'گذرواژه: حداقل {n} نویسه.',
  },
};
