// All copy is bilingual: { fa, en } pairs referenced through L(value, lang) in App.jsx.
// Titles/descriptions of catalog entries that come from the server stay as data.

export const primaryNavigation = [
  { label: { fa: 'انیمه', en: 'Anime' }, to: '/anime' },
  { label: { fa: 'مانگا', en: 'Manga' }, to: '/manga' },
  { label: { fa: 'فصل پخش', en: 'Seasonal' }, to: '/seasonal' },
  { label: { fa: 'اجتماع', en: 'Community' }, to: '/community' },
  { label: { fa: 'اخبار', en: 'News' }, to: '/news' },
];

export const sectionPages = {
  '/anime': { kind: 'anime', eyebrow: { fa: 'کشف کنید', en: 'Discover' }, title: { fa: 'کاتالوگ انیمه', en: 'Anime catalog' }, description: { fa: 'کاتالوگ محلی را بر اساس عنوان، ژانر یا سال جستجو کنید.', en: 'Search the local catalog by title, genre, or year.' } },
  '/manga': { kind: 'manga', eyebrow: { fa: 'بخوانید', en: 'Read' }, title: { fa: 'کاتالوگ مانگا', en: 'Manga catalog' }, description: { fa: 'داستان‌های مصور را بر اساس ژانر، دوره و قالب مرور کنید.', en: 'Browse graphic stories by genre, era, and format.' } },
  '/top/anime': { kind: 'anime-ranking', eyebrow: { fa: 'رتبه‌بندی', en: 'Rankings' }, title: { fa: 'برترین انیمه‌ها', en: 'Top anime' }, description: { fa: 'رتبه‌بندی نمونه‌ای بر پایه‌ی عنوان‌های این کاتالوگ محلی.', en: 'A sample ranking built from the titles in this local catalog.' } },
  '/top/manga': { kind: 'manga-ranking', eyebrow: { fa: 'رتبه‌بندی', en: 'Rankings' }, title: { fa: 'برترین مانگا', en: 'Top manga' }, description: { fa: 'یک فهرست خواندنی انتخابی برای این نمونه‌کد.', en: 'A sample reading list ordered for this prototype.' } },
  '/seasonal': { kind: 'seasonal', eyebrow: { fa: 'روی تقویم', en: 'On the calendar' }, title: { fa: 'انیمه‌های فصل', en: 'Seasonal anime' }, description: { fa: 'تقویم فشرده‌ی تماشا برای عنوان‌های این نمونه.', en: 'A compact viewing calendar for the titles in this demo.' } },
  '/adapted': { kind: 'adapted', eyebrow: { fa: 'بر اساس منبع', en: 'Browse by source' }, title: { fa: 'مانگای انیمه‌شده', en: 'Manga adapted to anime' }, description: { fa: 'مدخل‌های محلی انیمه‌ای که نسخه‌ی مانگا هم دارند.', en: 'Explore local anime entries with a manga counterpart.' } },
  '/community': { kind: 'community', eyebrow: { fa: 'با هم', en: 'Together' }, title: { fa: 'اجتماع', en: 'Community' }, description: { fa: 'مردم، گفت‌وگوها، کلوب‌ها و مجموعه‌ها را پیدا کنید.', en: 'Find people, conversations, clubs, and collections.' } },
  '/characters': { kind: 'directory', directory: 'characters', eyebrow: { fa: 'دفترچه', en: 'Directory' } },
  '/people': { kind: 'directory', directory: 'people', eyebrow: { fa: 'دفترچه', en: 'Directory' } },
  '/staff': { kind: 'directory', directory: 'staff', eyebrow: { fa: 'تولید', en: 'Production' } },
  '/companies': { kind: 'directory', directory: 'companies', eyebrow: { fa: 'تولید', en: 'Production' } },
  '/clubs': { kind: 'directory', directory: 'clubs', eyebrow: { fa: 'اجتماع', en: 'Community' } },
  '/members': { kind: 'directory', directory: 'members', eyebrow: { fa: 'اجتماع', en: 'Community' } },
  '/forums': { kind: 'directory', directory: 'forums', eyebrow: { fa: 'اجتماع', en: 'Community' } },
  '/stacks': { kind: 'directory', directory: 'stacks', eyebrow: { fa: 'اجتماع', en: 'Community' } },
  '/news': { kind: 'editorial', storySet: 'news', eyebrow: { fa: 'تحریریه', en: 'Editorial' } },
  '/articles': { kind: 'editorial', storySet: 'articles', eyebrow: { fa: 'تحریریه', en: 'Editorial' } },
  '/reviews': { kind: 'editorial', storySet: 'reviews', eyebrow: { fa: 'اجتماع', en: 'Community' } },
  '/recommendations': { kind: 'editorial', storySet: 'recommendations', eyebrow: { fa: 'کشف کنید', en: 'Discover' } },
  '/videos': { kind: 'editorial', storySet: 'videos', eyebrow: { fa: 'تماشا', en: 'Watch' } },
  '/pictures': { kind: 'editorial', storySet: 'pictures', eyebrow: { fa: 'نگارخانه', en: 'Gallery' } },
  '/blogs': { kind: 'directory', directory: 'blogs', eyebrow: { fa: 'اجتماع', en: 'Community' } },
  '/featured': { kind: 'editorial', storySet: 'articles', eyebrow: { fa: 'منتخب', en: 'Featured' } },
  '/episodes': { kind: 'editorial', storySet: 'videos', eyebrow: { fa: 'تماشا', en: 'Watch' } },
  '/store': { kind: 'editorial', storySet: 'store', eyebrow: { fa: 'مرور', en: 'Browse' } },
  '/support': { kind: 'editorial', storySet: 'support', eyebrow: { fa: 'راهنما', en: 'Help' } },
  '/about': { kind: 'editorial', storySet: 'support', eyebrow: { fa: 'درباره', en: 'About' } },
  '/membership': { kind: 'editorial', storySet: 'membership', eyebrow: { fa: 'عضویت', en: 'Membership' } },
  '/login': { kind: 'editorial', storySet: 'login', eyebrow: { fa: 'حساب', en: 'Account' } },
  '/register': { kind: 'editorial', storySet: 'register', eyebrow: { fa: 'حساب', en: 'Account' } },
  '/advertising': { kind: 'editorial', storySet: 'advertising', eyebrow: { fa: 'درباره', en: 'About' } },
};

export const sidebarSections = [
  {
    title: { fa: 'کشف کنید', en: 'Discover' },
    links: [
      { label: { fa: 'کاتالوگ انیمه', en: 'Anime catalog' }, to: '/anime' },
      { label: { fa: 'کاتالوگ مانگا', en: 'Manga catalog' }, to: '/manga' },
      { label: { fa: 'فصل پخش', en: 'Seasonal lineup' }, to: '/seasonal' },
      { label: { fa: 'برترین انیمه‌ها', en: 'Top anime' }, to: '/top/anime' },
      { label: { fa: 'برترین مانگا', en: 'Top manga' }, to: '/top/manga' },
    ],
  },
  {
    title: { fa: 'اجتماع', en: 'Community' },
    links: [
      { label: { fa: 'شخصیت‌ها', en: 'Characters' }, to: '/characters' },
      { label: { fa: 'مردم و تولید', en: 'People & staff' }, to: '/people' },
      { label: { fa: 'کلوب‌ها', en: 'Clubs' }, to: '/clubs' },
      { label: { fa: 'اعضا', en: 'Members' }, to: '/members' },
      { label: { fa: 'گفت‌وگوها', en: 'Discussions' }, to: '/forums' },
      { label: { fa: 'فهرست‌های علاقه', en: 'Interest stacks' }, to: '/stacks' },
    ],
  },
  {
    title: { fa: 'تحریریه', en: 'Editorial' },
    links: [
      { label: { fa: 'اخبار', en: 'News' }, to: '/news' },
      { label: { fa: 'مقالات', en: 'Features' }, to: '/articles' },
      { label: { fa: 'نقد و بررسی‌ها', en: 'Reviews' }, to: '/reviews' },
      { label: { fa: 'پیشنهادها', en: 'Recommendations' }, to: '/recommendations' },
      { label: { fa: 'ویدیوها', en: 'Videos' }, to: '/videos' },
      { label: { fa: 'عکس‌ها', en: 'Pictures' }, to: '/pictures' },
    ],
  },
  {
    title: { fa: 'بیشتر', en: 'More' },
    links: [
      { label: { fa: 'انیمه‌سازی مانگا', en: 'Manga adaptations' }, to: '/adapted' },
      { label: { fa: 'وبلاگ‌های اعضا', en: 'Member blogs' }, to: '/blogs' },
      { label: { fa: 'مطالب منتخب', en: 'Featured stories' }, to: '/featured' },
      { label: { fa: 'قسمت‌ها و پیش‌نمایش‌ها', en: 'Episodes & previews' }, to: '/episodes' },
    ],
  },
  {
    title: { fa: 'درباره و تبلیغات', en: 'About & advertising' },
    links: [
      { label: { fa: 'درباره و پشتیبانی', en: 'About & support' }, to: '/about' },
      { label: { fa: 'تبلیغات', en: 'Advertising' }, to: '/advertising' },
    ],
  },
];

// Manga catalog data lives in the database (table `manga`, seeded from public/data/manga.json).
// It is served via GET /api/manga and loaded with loadMangaCatalog() in catalog.js.

export const communitySections = [
  { title: { fa: 'دفتر شخصیت‌ها', en: 'Character directory' }, to: '/characters', description: { fa: 'شخصیت‌های به‌یادماندنی و سریال‌هایشان را مرور کنید.', en: 'Browse memorable cast members and the series they belong to.' } },
  { title: { fa: 'مردم و تیم تولید', en: 'People & staff' }, to: '/people', description: { fa: 'سازندگان، صداپیشگان، استودیوها و تیم‌های تولید.', en: 'Explore creators, performers, studios, and production teams.' } },
  { title: { fa: 'کلوب‌ها', en: 'Clubs' }, to: '/clubs', description: { fa: 'گروه‌های کوچک علاقه برای ژانرها، سازندگان و سریال‌های در حال پخش.', en: 'Find small-interest groups for genres, creators, and ongoing shows.' } },
  { title: { fa: 'فضاهای اعضا', en: 'Member spaces' }, to: '/members', description: { fa: 'پروفایل‌های عمومی و فعالیت‌های تماشای دیگران.', en: 'Discover public profiles, list styles, and current watch activity.' } },
  { title: { fa: 'بازوی گفت‌وگو', en: 'Discussion boards' }, to: '/forums', description: { fa: 'گفت‌وگوی قسمت‌ها، پیشنهادها و موضوع‌های فصدی.', en: 'Join episode conversations, recommendations, and seasonal threads.' } },
  { title: { fa: 'فهرست‌های علاقه', en: 'Interest stacks' }, to: '/stacks', description: { fa: 'عنوان‌ها را در فهرست‌های موضوعی تماشا و خواندن جمع کنید.', en: 'Collect titles into themed reading and viewing lists.' } },
];

export const editorialContent = {
  news: {
    eyebrow: { fa: 'رومیزار تحریریه', en: 'News desk' },
    title: { fa: 'اخبار انیمه و مانگا', en: 'Anime & manga news' },
    description: { fa: 'اعلام‌های تازه، جزئیات انتشار و داستان‌های صنعت از سراسر این دنیا.', en: 'Fresh announcements, release notes, and industry stories from across the medium.' },
    items: [
      { title: { fa: 'فصل تازه در یک نگاه', en: 'The new season at a glance' }, category: { fa: 'پیش‌نمایش فصل', en: 'Season preview' }, body: { fa: 'راهنمای فشرده برای داستان‌های برگشتی، جهان‌های تازه و پیش‌درآمدهای هفتگی.', en: 'A compact guide to the returning stories, new worlds, and weekly premieres worth tracking.' } },
      { title: { fa: 'استودیوها چطور دوره‌ی دوبل می‌چینند', en: 'How studios plan a split cour' }, category: { fa: 'تولید', en: 'Production' }, body: { fa: 'نگاهی به تصمیم‌های زمان‌بندی پشت انیمه‌سازی‌های بلند و وقفه‌های میانه‌ی فصل.', en: 'A look at the scheduling choices behind longer adaptations and mid-season pauses.' } },
      { title: { fa: 'از برگه تا پرده: چه چیزی تغییر می‌کند', en: 'From page to screen: what changes' }, category: { fa: 'انیمه‌سازی', en: 'Adaptations' }, body: { fa: 'مقایسه‌ی انتخاب‌هایی که کمک می‌کنند داستان در پرده ریتم تازه‌ای پیدا کند.', en: 'Comparing the creative decisions that help a story find a different rhythm on screen.' } },
    ],
  },
  articles: {
    eyebrow: { fa: 'مقالات ویژه', en: 'Features' },
    title: { fa: 'همچنگیِ پشت سریال‌ها', en: 'Stories behind the series' },
    description: { fa: 'خواندنی‌های بلندتر درباره‌ی هنر، فرهنگ و ایده‌هایی که انیمه را به‌یادماندنی می‌کند.', en: 'Longer reads on craft, culture, and the ideas that make animation memorable.' },
    items: [
      { title: { fa: 'جهان‌سازی، جزء به جزء', en: 'Building a world one detail at a time' }, category: { fa: 'هنر', en: 'Craft' }, body: { fa: 'طراحی صحنه می‌تواند یک مکان خیالی را پیش از نخستین دیالوگ، ساکن‌شده نشان دهد.', en: 'Production design can make a fictional place feel lived in before a character says a word.' } },
      { title: { fa: 'توان آرامِ جمع داستانِ قوی', en: 'The quiet power of a strong ensemble' }, category: { fa: 'شخصیت‌ها', en: 'Characters' }, body: { fa: 'چرا پیش‌آهنگ‌های خوب اغلب یک فرض خوب را به جهانی تبدیل می‌کنند که هواداران به آن برمی‌گردند.', en: 'Why supporting casts often turn a good premise into a world fans want to revisit.' } },
      { title: { fa: 'موسیقی، راوی دوم', en: 'Music as a second narrator' }, category: { fa: 'صدا', en: 'Sound' }, body: { fa: 'تِم‌ها و سکوت نقشه‌ی احساسی داستان را همچون دیالوگ، دقیق شکل می‌دهند.', en: 'Themes and silence shape the emotional map of a story just as carefully as dialogue.' } },
    ],
  },
  reviews: {
    eyebrow: { fa: 'صدای اعضا', en: 'Member voices' },
    title: { fa: 'نقد و برداشت‌های آغازین', en: 'Reviews & first impressions' },
    description: { fa: 'یادداشت‌های کوتاه و بی‌اسپویل از تماشاگران با سلیقه‌ها و سابقه‌های مختلف.', en: 'Short, spoiler-aware notes from viewers with different tastes and watch histories.' },
    items: [
      { title: { fa: 'شروعی آرام که وسعتش را می‌سازد', en: 'A slow start that earns its scale' }, category: { fa: 'ماجرایی', en: 'Adventure' }, body: { fa: 'قسمت‌های آغازین به تنظیم فضا زمان می‌دهند و بعد با یک افق تازه پاداش می‌دهند.', en: 'The early episodes take time to establish the setting, then reward that patience with a confident shift in perspective.' } },
      { title: { fa: 'بازی‌های بزرگ، شخصیت‌های بزرگ‌تر', en: 'Big matches, bigger personalities' }, category: { fa: 'ورزشی', en: 'Sports' }, body: { fa: 'بهترین لحظه‌ها بیش از کنش روی زمین، از رقابت‌ها و شرط‌بندی‌های تاکتیکی می‌آید.', en: 'The best moments come from the rivalries and tactical gambles as much as the action on the field.' } },
      { title: { fa: 'سفری فانتزی که خودش گرم است', en: 'A warmer kind of fantasy journey' }, category: { fa: 'فانتزی', en: 'Fantasy' }, body: { fa: 'دیدارهای کوچک و ریتم اندیشمند، این سرگذشت را ماندگار می‌کند.', en: 'Small encounters and a thoughtful pace give this road story its lasting charm.' } },
    ],
  },
  recommendations: {
    eyebrow: { fa: 'تماشای بعدی را پیدا کن', en: 'Find your next watch' },
    title: { fa: 'پیشنهادها', en: 'Recommendations' },
    description: { fa: 'یک حال‌وهوا، ژانر یا عنوان محبوب را دنبال کن تا سریالی با همان کشش پیدا کنی.', en: 'Follow a mood, genre, or favorite title to find another series with a similar pull.' },
    items: [
      { title: { fa: 'برای جهانی‌سازها', en: 'For the world-builders' }, category: { fa: 'ماجرایی', en: 'Adventure' }, body: { fa: 'سریال‌هایی را ببین که سفر، نقشه و شخصیت‌ها را هم‌زمان عوض می‌کند.', en: 'Try stories where travel changes the map and the characters at the same time.' } },
      { title: { fa: 'برای رقابت‌های پرتنش', en: 'For high-stakes rivalries' }, category: { fa: 'رقابت', en: 'Competition' }, body: { fa: 'سریال‌هایی که بر بلندپروازی، کار تیمی و چالش بعدی بنا شده‌اند.', en: 'Explore series built around ambition, teamwork, and a clear next challenge.' } },
      { title: { fa: 'برای ریتی آرام‌تر', en: 'For a gentler pace' }, category: { fa: 'درام شخصیت', en: 'Character drama' }, body: { fa: 'سفرهای اندیشمند با جزئیات روزمره و دوستی‌های بلندمدت را برگزین.', en: 'Choose reflective journeys focused on everyday details and long friendships.' } },
    ],
  },
  videos: {
    eyebrow: { fa: 'تماشا', en: 'Watch' },
    title: { fa: 'تریلر و ویدیوهای ویژه', en: 'Trailers & video features' },
    description: { fa: 'قفسه‌ای انتخابی برای پیش‌نمایش‌ها، تم‌های آغازین، گفت‌وگوها و ویدیوهای تولید.', en: 'A curated shelf for previews, opening themes, interviews, and production features.' },
    items: [
      { title: { fa: 'تریلرهای فصل', en: 'Season trailers' }, category: { fa: 'پیش‌نمایش', en: 'Preview' }, body: { fa: 'معرفی‌های کوتاه سریال‌های در راه و محبوب‌های در حال برگشت را ببینید.', en: 'Browse short introductions to upcoming shows and returning favorites.' } },
      { title: { fa: 'گفت‌وگو با سازندگان', en: 'Creator conversations' }, category: { fa: 'مصاحبه', en: 'Interview' }, body: { fa: 'هنرمندان و تیم‌های تولید از انتخاب‌های پشت کارشان می‌گویند.', en: 'Hear artists and production teams talk about the choices behind their work.' } },
      { title: { fa: 'تم‌های آغازین و پایانی', en: 'Opening and ending themes' }, category: { fa: 'موسیقی', en: 'Music' }, body: { fa: 'قفسه‌ی شنیداری برای آن توالی‌هایی که پیش از هر قسمت حالم را می‌سازند.', en: 'A listening shelf for the sequences that set the tone before and after each episode.' } },
    ],
  },
  pictures: {
    eyebrow: { fa: 'نگارخانه', en: 'Gallery' },
    title: { fa: 'نگارخانه‌ی تصاویر انیمه', en: 'Anime picture gallery' },
    description: { fa: 'نگارخانه‌ای با طرح‌های جلد و یادداشت‌های بصری محلی.', en: 'A locally illustrated gallery of original cover studies and visual notes.' },
    items: [
      { title: { fa: 'مطالع‌ه‌های رنگ', en: 'Color studies' }, category: { fa: 'طراحی', en: 'Artwork' }, body: { fa: 'مجموعه‌ای از جستجوهای پالتی با الهام از قلمرو فانتزی، ورزش و ماجراجویی.', en: 'A set of original palette explorations inspired by fantasy, sports, and adventure.' } },
      { title: { fa: 'مودبوردهای فصلی', en: 'Seasonal moodboards' }, category: { fa: 'مجموعه', en: 'Collection' }, body: { fa: 'تم‌های بصری برای شب‌های زمستان، جشن‌های تابستان و همه‌ی آن‌چه در میان است.', en: 'Visual themes for winter nights, summer festivals, and everything between.' } },
      { title: { fa: 'نکات طراحی جلد', en: 'Cover design notes' }, category: { fa: 'فرایند', en: 'Process' }, body: { fa: 'چگونه شکل، تضاد و حروف می‌توانند بدون تصویر شخصیت‌ها، حسی از داستان را برسند.', en: 'How shape, contrast, and type can hint at a story without depicting its characters.' } },
    ],
  },
  store: {
    eyebrow: { fa: 'قفسه‌ی خواندن', en: 'Reading shelf' },
    title: { fa: 'قفسه‌ی مانگا', en: 'Manga shelf' },
    description: { fa: 'ایده‌ی یک مغازه‌ی محلی برای یافتن پیشنهاد خواندنی و دریافت سریال‌ها.', en: 'A local storefront concept for finding reading picks and collecting series.' },
    items: [
      { title: { fa: 'رسیدن‌های جدید', en: 'New volume arrivals' }, category: { fa: 'تازه', en: 'New' }, body: { fa: 'قفسه‌ای برای جلدهای تازه، فصل‌های نو و سریال‌هایی که ارزش کشف دارند.', en: 'A shelf for recent volumes, fresh first chapters, and series worth discovering.' } },
      { title: { fa: 'محبوب‌های خوانندگان', en: 'Readers’ favorites' }, category: { fa: 'محبوب', en: 'Popular' }, body: { fa: 'ماجراهای کوتاه‌مدت، داستان‌های کامل و گرم‌های پنهان.', en: 'Browse long-running adventures, complete stories, and hidden gems.' } },
      { title: { fa: 'راهنماهای خواندن', en: 'Reading guides' }, category: { fa: 'مجموعه‌ها', en: 'Collections' }, body: { fa: 'از یک دور کوتاه شروع کن، یک سازنده را دنبال کن، یا ژانری را از آغاز مرور کن.', en: 'Start with a short arc, follow a creator, or explore a genre from the beginning.' } },
    ],
  },
  support: {
    eyebrow: { fa: 'گویا', en: 'Help center' },
    title: { fa: 'پشتیبانی و کمک حساب', en: 'Support & account help' },
    description: { fa: 'پاسخ برای استفاده از این نمونه‌ی محلی و مدیریت تنضیمات مرورگر.', en: 'Answers for using this local prototype and managing its browser-stored preferences.' },
    items: [
      { title: { fa: 'لیست شما در همین مرورگر می‌ماند', en: 'Your list stays in this browser' }, category: { fa: 'فهرست‌ها', en: 'Lists' }, body: { fa: 'انیمه‌های ذخیره‌شده روی همین دستگاه نگه‌داری می‌شوند و به سروری ارسال نمی‌شوند.', en: 'Saved anime are stored locally on this device and are not sent to a server.' } },
      { title: { fa: 'تنضیمات پوسته', en: 'Theme preferences' }, category: { fa: 'تنضیمات', en: 'Settings' }, body: { fa: 'از سربرگ، حالت روشن یا تیره را انتخاب کن. انتخاب محلی حفظ می‌شود.', en: 'Choose light or dark mode from the header. The selection is remembered locally.' } },
      { title: { fa: 'پوشش کاتالوگ', en: 'Catalog coverage' }, category: { fa: 'درباره', en: 'About' }, body: { fa: 'این نمونه از یک مجموعه‌ی کوچک منتخب دستی بهره می‌برد و به دیتابیس زنده‌ای وصل نیست.', en: 'This prototype uses a small hand-curated sample and does not connect to a live database.' } },
    ],
  },
  membership: {
    eyebrow: { fa: 'عضویت', en: 'Membership' },
    title: { fa: 'راهی بی‌سروصدا برای پشتیبانی از اجتماعات انیمه', en: 'A quieter way to support anime communities' },
    description: { fa: 'ایده‌ی صفحه‌ی اطلاعات عضویت، بدون خدمات صورت‌حساب و حساب.', en: 'A membership information page concept, without billing or account services connected.' },
    items: [
      { title: { fa: 'پشتیبانی از اجتماعات مستقل', en: 'Support independent communities' }, category: { fa: 'اجتماع', en: 'Community' }, body: { fa: 'عضویت می‌تواند ناظرگری، بهبود دسترس‌پذیری و ابزارهای اجتماع را تأمین کند.', en: 'Membership can fund moderation, accessibility improvements, and community tools.' } },
      { title: { fa: 'تم‌های شخصی فهرست', en: 'Personal list themes' }, category: { fa: 'پروفایل', en: 'Profile' }, body: { fa: 'طبقه‌ی آتی عضویت می‌تواند روش‌های بیشتری برای چینش و نمایش لیست‌ها بگذارد.', en: 'A future membership tier could offer more ways to organize and present personal lists.' } },
      { title: { fa: 'گرفت پول در اینجا نیست', en: 'No payment collection here' }, category: { fa: 'نمونه‌کد', en: 'Prototype' }, body: { fa: 'این نمونه‌ی ظاهری پردازشگر پرداخت و بک‌اند عضویت ندارد.', en: 'This front-end sample has no payment processor or membership backend.' } },
    ],
  },
  login: {
    eyebrow: { fa: 'حساب', en: 'Account' },
    title: { fa: 'ورود به پروفایل محلی شما', en: 'Sign in to your local profile' },
    description: { fa: 'ورودِ حساب در این نمونه‌ی ظاهری وصل نیست.', en: 'Account authentication is not connected in this front-end prototype.' },
    items: [
      { title: { fa: 'عنوان‌های ذخیره روی همان دستگاه', en: 'Saved titles stay on this device' }, category: { fa: 'پسند خصوصی', en: 'Privacy' }, body: { fa: 'تغییرات لیست از نگه‌داری محلی مرورگر استفاده می‌کند و به سرویس حسابی فرستاده نمی‌شود.', en: 'List changes use local browser storage and are not sent to an account service.' } },
      { title: { fa: 'فیلد گذرواژه جمع‌آوری نمی‌شود', en: 'No password fields are collected' }, category: { fa: 'امنیت', en: 'Security' }, body: { fa: 'این دمو گذرواژه را نمی‌پذیرد، ذخیره یا ارسال نمی‌کند.', en: 'This demo does not accept, store, or transmit credentials.' } },
      { title: { fa: 'بدون حساب مرور کنید', en: 'Browse without an account' }, category: { fa: 'کاوش', en: 'Explore' }, body: { fa: 'کاتالوگ، رتبه‌بندی‌ها، گفت‌وگوها و جزئیات برای هر بازدیدکننده باز است.', en: 'The catalog, rankings, discussions, and detail pages are open to every visitor.' } },
    ],
  },
  register: {
    eyebrow: { fa: 'حساب', en: 'Account' },
    title: { fa: 'ساخت پروفایل اجتماعی', en: 'Create a community profile' },
    description: { fa: 'صفحه‌ی اطلاعات ثبت‌نام برای نمونه‌کد؛ هیچ سرویس حسابی وصل نیست.', en: 'A registration information page for the prototype; no account service is connected.' },
    items: [
      { title: { fa: 'نام نمایشی برگزین', en: 'Choose a display name' }, category: { fa: 'پروفایل', en: 'Profile' }, body: { fa: 'پروفایل آینده می‌تواند نقد‌های عمومی، فهرست‌ها و انتخاب‌های فصل را بگیرد.', en: 'A future profile could collect public reviews, lists, and seasonal picks.' } },
      { title: { fa: 'لیست تماشای خود را مرتب نگه دار', en: 'Keep your watchlist organized' }, category: { fa: 'فهرست‌ها', en: 'Lists' }, body: { fa: 'عنوان‌ها را ذخیره کن و از صفحه‌ی جزئیاتشان به آن‌ها برگرد.', en: 'Save titles locally and return to them from their detail pages.' } },
      { title: { fa: 'ورود فعال نیست', en: 'Authentication is not active' }, category: { fa: 'نمونه‌کد', en: 'Prototype' }, body: { fa: 'این صفحه هیچ داده‌ی شخصی یا گذرواژه جمع‌آوری نمی‌کند.', en: 'No personal details or passwords are collected by this page.' } },
    ],
  },
  advertising: {
    eyebrow: { fa: 'درباره', en: 'About' },
    title: { fa: 'تبلیغات و همکاری‌ها', en: 'Advertising & partnerships' },
    description: { fa: 'صفحه‌ی اطلاعات برای تجربه‌یِ پاکِ کاتالوگ؛ این نمونه تبلیغ سرو نمی‌کند.', en: 'An information page for a clean catalog experience; this prototype serves no advertisements.' },
    items: [
      { title: { fa: 'بدون ردیاب تبلیغات', en: 'No ad trackers' }, category: { fa: 'پسند خصوصی', en: 'Privacy' }, body: { fa: 'این اپ محلی شبکه‌ی تبلیغ، ریتارگتینگ یا بیکن تحلیل ندارد.', en: 'The local app does not include ad networks, retargeting, or analytics beacons.' } },
      { title: { fa: 'همکاری‌های تحریریه', en: 'Editorial partnerships' }, category: { fa: 'همکاری', en: 'Partnerships' }, body: { fa: 'هر محتوای شریکی آتی باید برچسب شفاف داشته باشد و جدا از نقد‌ها بماند.', en: 'Any future partner content should be labeled clearly and kept separate from reviews.' } },
      { title: { fa: 'تماس با مالک پروژه', en: 'Contact the project owner' }, category: { fa: 'تماس', en: 'Contact' }, body: { fa: 'فرم تماس واقعی به نقطه‌ی پایانی سمت سرور نیاز دارد که این نمونه ندارد.', en: 'A real contact form requires a server-side endpoint, which this prototype does not have.' } },
    ],
  },
};

export const directoryContent = {
  characters: {
    title: { fa: 'دفتر شخصیت‌ها', en: 'Character directory' },
    description: { fa: 'شخصیت‌های درخشان را بر اساس سریال، ژانر و نقش مرور کنید.', en: 'Browse standout personalities by series, genre, and role.' },
    items: [
      { fa: 'رهبر بی‌رغبت', en: 'The reluctant leader' }, { fa: 'استاد صبور', en: 'The patient mentor' },
      { fa: 'تاکتيکر زیرک', en: 'The brilliant tactician' }, { fa: 'رقیب وفادار', en: 'The loyal rival' },
      { fa: 'مخترع شاد', en: 'The cheerful inventor' }, { fa: 'جادوگر سرگردان', en: 'The wandering mage' },
    ],
  },
  people: {
    title: { fa: 'مردم و سازندگان', en: 'People & creators' },
    description: { fa: 'ریزنمای صدونیان و تیم‌های خلاق پشت انیمه.', en: 'A guide to the voices and creative teams behind animated stories.' },
    items: [
      { fa: 'صداپیشگان', en: 'Voice performers' }, { fa: 'کارگردانان انیمه', en: 'Animation directors' },
      { fa: 'طراحان شخصیت', en: 'Character designers' }, { fa: 'آهنگسازان سریال', en: 'Series composers' },
      { fa: 'نمایشنامه‌نویسان', en: 'Screenwriters' }, { fa: 'تیم‌های استودیو', en: 'Studio teams' },
    ],
  },
  clubs: {
    title: { fa: 'کلوب‌ها', en: 'Clubs' },
    description: { fa: 'اجتماعات کوچک برای واچ‌لیست، ژانر و انتخاب‌های فصل مشترک.', en: 'Small communities for shared watchlists, genres, and seasonal picks.' },
    items: [
      { fa: 'ساعت پس از فانتزی', en: 'Fantasy after hours' }, { fa: 'کلوب قسمتی هفتگی', en: 'Weekly episode club' },
      { fa: 'خوانندگان مانگا به انیمه', en: 'Manga-to-anime readers' }, { fa: 'یادداشت‌های هنر انیمه', en: 'Animation craft notes' },
      { fa: 'هوادار سریال ورزشی', en: 'Sports series fans' }, { fa: 'مبادله ساندترک', en: 'Soundtrack exchange' },
    ],
  },
  members: {
    title: { fa: 'فضاهای اعضا', en: 'Member spaces' },
    description: { fa: 'پروفایل‌های عمومی را ببین و ببین دیگران چه می‌تماشا‌کنند.', en: 'Find public profiles and compare what other viewers are watching.' },
    items: [
      { fa: 'AnimeFan', en: 'AnimeFan' }, { fa: 'FrameByFrame', en: 'FrameByFrame' },
      { fa: 'PaperLantern', en: 'PaperLantern' }, { fa: 'OrbitingComet', en: 'OrbitingComet' },
      { fa: 'QuietFinale', en: 'QuietFinale' }, { fa: 'PanelCollector', en: 'PanelCollector' },
    ],
  },
  forums: {
    title: { fa: 'بازوهای گفت‌وگو', en: 'Discussion boards' },
    description: { fa: 'گفت‌وگوهای باز برای قسمت‌های تازه‌، محبوب‌های قدیمی و گروه‌های تماشای مشترک.', en: 'Open conversations for new episodes, old favorites, and watch-along groups.' },
    items: [
      { fa: 'موضوع قسمت این هفته', en: 'This week’s episode thread' }, { fa: 'اکنون چه می‌تماشاکنی؟', en: 'What are you watching?' },
      { fa: 'سریال‌های با ساندترک عالی', en: 'Series with great soundtracks' }, { fa: 'کمک: سریال فانتزی می‌خواهم', en: 'Help me find a fantasy show' },
      { fa: 'گفت‌وگوی فینال فصل', en: 'Season finale discussion' }, { fa: 'حلقه‌ی خواندن مانگا', en: 'Manga reading circle' },
    ],
  },
  stacks: {
    title: { fa: 'فهرست‌های علاقه', en: 'Interest stacks' },
    description: { fa: 'فهرست‌های موضوعی برای ثبت یک حال‌وهوا، ژانر یا آخرهفته‌ی خیلی خاص.', en: 'Themed lists made to capture a mood, a genre, or a very specific weekend.' },
    items: [
      { fa: 'یک قسمت بیشتر', en: 'One more episode' }, { fa: 'سفرهای آرام', en: 'Quiet journeys' },
      { fa: 'رقابت‌های با احساس', en: 'Rivalries with heart' }, { fa: 'جهان‌های فانتزی نامتعارف', en: 'Unusual fantasy worlds' },
      { fa: 'سریال‌های کوتاه آخرهفته', en: 'Short series for a weekend' }, { fa: 'قسمت‌های آغازین عالی', en: 'Great first episodes' },
    ],
  },
  staff: {
    title: { fa: 'تیم تولید', en: 'Production staff' },
    description: { fa: 'نقش‌ها، همکاری‌ها و استودیوهای درگیر در ساخت سریال.', en: 'Explore the roles, collaborations, and studios involved in bringing a series to life.' },
    items: [
      { fa: 'کارگردانی سریال', en: 'Series direction' }, { fa: 'تولید انیمه', en: 'Animation production' },
      { fa: 'کارگردانی هنری', en: 'Art direction' }, { fa: 'تولید صدا', en: 'Sound production' },
      { fa: 'موسیقی اورجینال', en: 'Original music' }, { fa: 'نمایشنامه و داستان', en: 'Script and story' },
    ],
  },
  companies: {
    title: { fa: 'استودیوها و ناشران', en: 'Studios & publishers' },
    description: { fa: 'دفتر تیم‌ها و ناشران در ارتباط با انیمه و مانگا.', en: 'A directory of the teams and publishers connected to anime and manga.' },
    items: [
      { fa: 'استودیوهای انیمه', en: 'Animation studios' }, { fa: 'ناشران مانگا', en: 'Manga publishers' },
      { fa: 'لیبل‌های موسیقی', en: 'Music labels' }, { fa: 'شریکان پخش', en: 'Distribution partners' },
      { fa: 'کمیته‌های تولید', en: 'Production committees' }, { fa: 'سازندگان مستقل', en: 'Independent creators' },
    ],
  },
  blogs: {
    title: { fa: 'وبلاگ‌های اعضا', en: 'Member blogs' },
    description: { fa: 'نوشته‌های شخصی و ژورنال‌های تماشای اجتماع.', en: 'Personal essays and watch journals from the community.' },
    items: [
      { fa: 'یک فصل در سه قسمت', en: 'A season in three shows' }, { fa: 'واچ‌لیست آخرهفته', en: 'Keeping a weekend watchlist' },
      { fa: 'اولین قسمتی که به دامم انداخت', en: 'The first episode that hooked me' }, { fa: 'چه چیزی یک پایان عالی می‌سازد', en: 'What makes a great ending' },
      { fa: 'یادداشت از قفسه‌ی مانگا', en: 'Notes from a manga shelf' }, { fa: 'یک سال جهان فانتزی', en: 'A year of fantasy worlds' },
    ],
  },
};

export const homeContent = {
  discussions: [
    { title: { fa: 'دوباره‌تماشا چطور «تازه» می‌شود؟', en: 'What makes a rewatch feel new?' }, category: { fa: 'گفت‌وگو', en: 'Discussion' }, body: { fa: 'اعضا جزئیات کوچکی را مقایسه می‌کنند که تنها پس از بازگشت به سریال محبوبشان دیدند.', en: 'Members compare the small details they noticed only after returning to a favorite series.' } },
    { title: { fa: 'برای آخرهفته‌ی آرام سریالی انتخاب کن', en: 'Pick a series for a quiet weekend' }, category: { fa: 'تماشای جمعی', en: 'Watch together' }, body: { fa: 'موضوعی بی‌اسپویل برای سریال‌های کوتاه، ریتی مهربان و درست رفتن.', en: 'A spoiler-free thread for short shows, gentle pacing, and good company.' } },
    { title: { fa: 'یادداشت‌های قسمتی هفته', en: 'Weekly episode notes' }, category: { fa: 'فصل', en: 'Seasonal' }, body: { fa: 'واکنش‌ها و نظریه‌ها را در پشت هشدار اسپویل به‌اشتراک بگذار.', en: 'Share reactions and theories while keeping major plot details behind spoiler warnings.' } },
  ],
  episodeUpdates: [
    { slug: 'frieren', label: { fa: 'گفت‌وگوی قسمت', en: 'Episode conversation' }, note: { fa: 'یادداشت‌های تازه‌ی اعضا', en: 'New member notes' } },
    { slug: 'blue-lock', label: { fa: 'گفت‌وگوی میدان', en: 'Match discussion' }, note: { fa: 'موضوع اجتماعی', en: 'Community thread' } },
    { slug: 'solo-leveling', label: { fa: 'راهنمای قسمت', en: 'Episode guide' }, note: { fa: 'به‌تازگی به‌روز شد', en: 'Updated recently' } },
    { slug: 'my-hero-academia', label: { fa: 'تماشای مشترک', en: 'Watch-along' }, note: { fa: 'گفت‌وگوی باز', en: 'Open discussion' } },
  ],
  friendUpdates: [
    { name: 'PaperLantern', action: { fa: 'عنوانی به فهرستش افزود', en: 'added a title to their list' }, slug: 'frieren' },
    { name: 'FrameByFrame', action: { fa: 'نقدی به اشتراک گذاشت', en: 'shared a review' }, slug: 'blue-lock' },
    { name: 'QuietFinale', action: { fa: 'سریال تازه‌ای را آغاز کرد', en: 'started a new series' }, slug: 'solo-leveling' },
  ],
};
