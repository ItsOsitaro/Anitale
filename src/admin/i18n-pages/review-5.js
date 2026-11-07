// Texts added by review pass 5 (merged into src/admin/i18n.js): reviews, recommendations, suggestions, missing titles.
export default {
  en: {
    // reviews / recs
    rvScore: 'Score', rvHelpfulOnly: 'Has helpful votes', rvLong: '{n} characters', rvDeleteConfirmText: 'Delete the review by {name}? “{text}” This cannot be undone.',
    rcDeleteConfirmText: 'Delete the recommendation by {name}? “{text}” This cannot be undone.', rcGone: 'Title removed', rvGone: 'Title removed',
    cmExportN: 'Export CSV ({n})', cmRowsHint: 'Press / to search. Esc clears the box.', cmDeleting: 'Deleting…',
    // suggestions
    sgSort_old: 'Oldest first', sgSort_new: 'Newest first', sgWaiting: 'Waiting {n} days', sgSent: 'Sent', sgReviewed: 'Reviewed',
    sgPreset4: 'Please write it in your own words', sgWorking: 'Working…', sgCurrent: 'Current', sgSuggested: 'Suggested', sgNoCurrent: 'Empty now',
    sgReportLabel: 'Report', sgReasonLabel: 'Reason sent to the member', sgReasonMin: 'At least 3 characters', sgBulkReject: 'Reject selected',
    // missing titles
    missRequestsOne: '1 request', missAddOne: 'Add', missDismissOne: 'Dismiss', missAdded: 'Added', missFirstSeen: 'First asked {date}', missBy: 'Asked by {names}', missByMore: 'Asked by {names} and {n} more',
    missSortNew: 'Newest asked', missExport: 'Export CSV', missDismissOneConfirm: 'Remove “{title}” from the list?', missRetryFailed: 'Retry failed ones',
    missFailRow: 'Failed: {why}', missNoTitle: 'Unknown title', missCancel: 'Stop after this batch', missSelectedOf: '{n} of {total} selected',
  },
  fa: {
    rvScore: 'امتیاز', rvHelpfulOnly: 'دارای رأی «مفید»', rvLong: '{n} نویسه', rvDeleteConfirmText: 'نظر «{name}» حذف شود؟ «{text}» این کار برگشت ندارد.',
    rcDeleteConfirmText: 'پیشنهاد «{name}» حذف شود؟ «{text}» این کار برگشت ندارد.', rcGone: 'عنوان حذف شده', rvGone: 'عنوان حذف شده',
    cmExportN: 'خروجی CSV ({n})', cmRowsHint: 'برای جستجو / را بزنید. Esc کادر را خالی می‌کند.', cmDeleting: 'در حال حذف…',
    sgSort_old: 'قدیمی‌ترین اول', sgSort_new: 'جدیدترین اول', sgWaiting: '{n} روز در انتظار', sgSent: 'ارسال', sgReviewed: 'بررسی',
    sgPreset4: 'لطفاً با کلمات خودتان بنویسید', sgWorking: 'در حال انجام…', sgCurrent: 'فعلی', sgSuggested: 'پیشنهادی', sgNoCurrent: 'فعلاً خالی',
    sgReportLabel: 'گزارش', sgReasonLabel: 'دلیلی که برای کاربر فرستاده شد', sgReasonMin: 'حداقل ۳ حرف', sgBulkReject: 'رد انتخاب‌شده‌ها',
    missRequestsOne: '۱ درخواست', missAddOne: 'افزودن', missDismissOne: 'حذف از صف', missAdded: 'اضافه شد', missFirstSeen: 'اولین درخواست {date}', missBy: 'درخواست از {names}', missByMore: 'درخواست از {names} و {n} نفر دیگر',
    missSortNew: 'تازه‌ترین درخواست', missExport: 'خروجی CSV', missDismissOneConfirm: '«{title}» از فهرست برداشته شود؟', missRetryFailed: 'تلاش دوباره برای ناموفق‌ها',
    missFailRow: 'ناموفق: {why}', missNoTitle: 'عنوان نامشخص', missCancel: 'توقف بعد از این دسته', missSelectedOf: '{n} از {total} انتخاب شد',
  },
};
