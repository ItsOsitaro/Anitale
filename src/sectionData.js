export const primaryNavigation = [
  { label: 'Anime', to: '/anime' },
  { label: 'Manga', to: '/manga' },
  { label: 'Seasonal', to: '/seasonal' },
  { label: 'Community', to: '/community' },
  { label: 'News', to: '/news' },
];

export const sectionPages = {
  '/anime': { kind: 'anime', eyebrow: 'Discover', title: 'Anime catalog', description: 'Search the local catalog by title, genre, or year.' },
  '/manga': { kind: 'manga', eyebrow: 'Read', title: 'Manga catalog', description: 'Browse graphic stories by genre, era, and format.' },
  '/top/anime': { kind: 'anime-ranking', eyebrow: 'Rankings', title: 'Top anime', description: 'A sample ranking built from the titles in this local catalog.' },
  '/top/manga': { kind: 'manga-ranking', eyebrow: 'Rankings', title: 'Top manga', description: 'A sample reading list ordered for this prototype.' },
  '/seasonal': { kind: 'seasonal', eyebrow: 'On the calendar', title: 'Seasonal anime', description: 'A compact viewing calendar for the titles in this demo.' },
  '/adapted': { kind: 'adapted', eyebrow: 'Browse by source', title: 'Manga adapted to anime', description: 'Explore local anime entries with a manga counterpart.' },
  '/community': { kind: 'community', eyebrow: 'Together', title: 'Community', description: 'Find people, conversations, clubs, and collections.' },
  '/characters': { kind: 'directory', directory: 'characters', eyebrow: 'Directory' },
  '/people': { kind: 'directory', directory: 'people', eyebrow: 'Directory' },
  '/staff': { kind: 'directory', directory: 'staff', eyebrow: 'Production' },
  '/companies': { kind: 'directory', directory: 'companies', eyebrow: 'Production' },
  '/clubs': { kind: 'directory', directory: 'clubs', eyebrow: 'Community' },
  '/members': { kind: 'directory', directory: 'members', eyebrow: 'Community' },
  '/forums': { kind: 'directory', directory: 'forums', eyebrow: 'Community' },
  '/stacks': { kind: 'directory', directory: 'stacks', eyebrow: 'Community' },
  '/news': { kind: 'editorial', storySet: 'news', eyebrow: 'Editorial' },
  '/articles': { kind: 'editorial', storySet: 'articles', eyebrow: 'Editorial' },
  '/reviews': { kind: 'editorial', storySet: 'reviews', eyebrow: 'Community' },
  '/recommendations': { kind: 'editorial', storySet: 'recommendations', eyebrow: 'Discover' },
  '/videos': { kind: 'editorial', storySet: 'videos', eyebrow: 'Watch' },
  '/pictures': { kind: 'editorial', storySet: 'pictures', eyebrow: 'Gallery' },
  '/blogs': { kind: 'directory', directory: 'blogs', eyebrow: 'Community' },
  '/featured': { kind: 'editorial', storySet: 'articles', eyebrow: 'Featured' },
  '/episodes': { kind: 'editorial', storySet: 'videos', eyebrow: 'Watch' },
  '/store': { kind: 'editorial', storySet: 'store', eyebrow: 'Browse' },
  '/support': { kind: 'editorial', storySet: 'support', eyebrow: 'Help' },
  '/about': { kind: 'editorial', storySet: 'support', eyebrow: 'About' },
  '/membership': { kind: 'editorial', storySet: 'membership', eyebrow: 'Membership' },
  '/login': { kind: 'editorial', storySet: 'login', eyebrow: 'Account' },
  '/register': { kind: 'editorial', storySet: 'register', eyebrow: 'Account' },
  '/advertising': { kind: 'editorial', storySet: 'advertising', eyebrow: 'About' },
};

export const sidebarSections = [
  {
    title: 'Discover',
    links: [
      { label: 'Anime catalog', to: '/anime' },
      { label: 'Manga catalog', to: '/manga' },
      { label: 'Seasonal lineup', to: '/seasonal' },
      { label: 'Top anime', to: '/top/anime' },
      { label: 'Top manga', to: '/top/manga' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Characters', to: '/characters' },
      { label: 'People & staff', to: '/people' },
      { label: 'Clubs', to: '/clubs' },
      { label: 'Members', to: '/members' },
      { label: 'Discussions', to: '/forums' },
      { label: 'Interest stacks', to: '/stacks' },
    ],
  },
  {
    title: 'Editorial',
    links: [
      { label: 'News', to: '/news' },
      { label: 'Features', to: '/articles' },
      { label: 'Reviews', to: '/reviews' },
      { label: 'Recommendations', to: '/recommendations' },
      { label: 'Videos', to: '/videos' },
      { label: 'Pictures', to: '/pictures' },
    ],
  },
  {
    title: 'More',
    links: [
      { label: 'Manga adaptations', to: '/adapted' },
      { label: 'Member blogs', to: '/blogs' },
      { label: 'Featured stories', to: '/featured' },
      { label: 'Episodes & previews', to: '/episodes' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', to: '/login' },
      { label: 'Create account', to: '/register' },
      { label: 'Membership', to: '/membership' },
      { label: 'About & support', to: '/about' },
      { label: 'Advertising', to: '/advertising' },
    ],
  },
];

export const mangaCatalog = [
  {
    slug: 'one-piece',
    title: 'One Piece',
    imageSlug: 'one-piece',
    category: 'Adventure',
    year: '1997',
    format: 'Manga',
    genres: ['Adventure', 'Action', 'Fantasy'],
    synopsis: 'A young pirate and his growing crew sail between strange islands in pursuit of an impossible dream and the treasure said to change the world.',
  },
  {
    slug: 'fullmetal-alchemist',
    title: 'Fullmetal Alchemist',
    imageSlug: 'fullmetal-alchemist',
    category: 'Adventure',
    year: '2001',
    format: 'Manga',
    genres: ['Adventure', 'Fantasy', 'Drama'],
    synopsis: 'Two brothers search for a way to repair the consequences of forbidden alchemy, uncovering a conspiracy that reaches from military halls to the borders of their country.',
  },
  {
    slug: 'frieren',
    title: 'Frieren: Beyond Journey’s End',
    imageSlug: 'frieren',
    category: 'Fantasy',
    year: '2020',
    format: 'Manga',
    genres: ['Adventure', 'Fantasy', 'Drama'],
    synopsis: 'After a legendary quest is over, an elf mage travels again and learns to understand the people and passing moments she once took for granted.',
  },
  {
    slug: 'vinland-saga',
    title: 'Vinland Saga',
    imageSlug: 'vinland-saga',
    category: 'Historical',
    year: '2005',
    format: 'Manga',
    genres: ['Action', 'Adventure', 'Historical'],
    synopsis: 'A young warrior grows up among Viking expeditions and begins to question the cycle of violence that has shaped his life.',
  },
  {
    slug: 'demon-slayer',
    title: 'Demon Slayer',
    imageSlug: 'demon-slayer',
    category: 'Fantasy',
    year: '2016',
    format: 'Manga',
    genres: ['Action', 'Fantasy', 'Historical'],
    synopsis: 'A determined boy joins a secret corps of swordspeople and journeys through a supernatural version of early twentieth-century Japan.',
  },
  {
    slug: 'blue-lock',
    title: 'Blue Lock',
    imageSlug: 'blue-lock',
    category: 'Sports',
    year: '2018',
    format: 'Manga',
    genres: ['Sports', 'Drama'],
    synopsis: 'A national training experiment places young forwards in direct competition, testing their ambition and ability to seize the decisive moment.',
  },
];

export const communitySections = [
  { title: 'Character directory', to: '/characters', description: 'Browse memorable cast members and the series they belong to.' },
  { title: 'People & staff', to: '/people', description: 'Explore creators, performers, studios, and production teams.' },
  { title: 'Clubs', to: '/clubs', description: 'Find small-interest groups for genres, creators, and ongoing shows.' },
  { title: 'Member spaces', to: '/members', description: 'Discover public profiles, list styles, and current watch activity.' },
  { title: 'Discussion boards', to: '/forums', description: 'Join episode conversations, recommendations, and seasonal threads.' },
  { title: 'Interest stacks', to: '/stacks', description: 'Collect titles into themed reading and viewing lists.' },
];

export const editorialContent = {
  news: {
    eyebrow: 'News desk',
    title: 'Anime & manga news',
    description: 'Fresh announcements, release notes, and industry stories from across the medium.',
    items: [
      { title: 'The new season at a glance', category: 'Season preview', body: 'A compact guide to the returning stories, new worlds, and weekly premieres worth tracking.' },
      { title: 'How studios plan a split cour', category: 'Production', body: 'A look at the scheduling choices behind longer adaptations and mid-season pauses.' },
      { title: 'From page to screen: what changes', category: 'Adaptations', body: 'Comparing the creative decisions that help a story find a different rhythm on screen.' },
    ],
  },
  articles: {
    eyebrow: 'Features',
    title: 'Stories behind the series',
    description: 'Longer reads on craft, culture, and the ideas that make animation memorable.',
    items: [
      { title: 'Building a world one detail at a time', category: 'Craft', body: 'Production design can make a fictional place feel lived in before a character says a word.' },
      { title: 'The quiet power of a strong ensemble', category: 'Characters', body: 'Why supporting casts often turn a good premise into a world fans want to revisit.' },
      { title: 'Music as a second narrator', category: 'Sound', body: 'Themes and silence shape the emotional map of a story just as carefully as dialogue.' },
    ],
  },
  reviews: {
    eyebrow: 'Member voices',
    title: 'Reviews & first impressions',
    description: 'Short, spoiler-aware notes from viewers with different tastes and watch histories.',
    items: [
      { title: 'A slow start that earns its scale', category: 'Adventure', body: 'The early episodes take time to establish the setting, then reward that patience with a confident shift in perspective.' },
      { title: 'Big matches, bigger personalities', category: 'Sports', body: 'The best moments come from the rivalries and tactical gambles as much as the action on the field.' },
      { title: 'A warmer kind of fantasy journey', category: 'Fantasy', body: 'Small encounters and a thoughtful pace give this road story its lasting charm.' },
    ],
  },
  recommendations: {
    eyebrow: 'Find your next watch',
    title: 'Recommendations',
    description: 'Follow a mood, genre, or favorite title to find another series with a similar pull.',
    items: [
      { title: 'For the world-builders', category: 'Adventure', body: 'Try stories where travel changes the map and the characters at the same time.' },
      { title: 'For high-stakes rivalries', category: 'Competition', body: 'Explore series built around ambition, teamwork, and a clear next challenge.' },
      { title: 'For a gentler pace', category: 'Character drama', body: 'Choose reflective journeys focused on everyday details and long friendships.' },
    ],
  },
  videos: {
    eyebrow: 'Watch',
    title: 'Trailers & video features',
    description: 'A curated shelf for previews, opening themes, interviews, and production features.',
    items: [
      { title: 'Season trailers', category: 'Preview', body: 'Browse short introductions to upcoming shows and returning favorites.' },
      { title: 'Creator conversations', category: 'Interview', body: 'Hear artists and production teams talk about the choices behind their work.' },
      { title: 'Opening and ending themes', category: 'Music', body: 'A listening shelf for the sequences that set the tone before and after each episode.' },
    ],
  },
  pictures: {
    eyebrow: 'Gallery',
    title: 'Anime picture gallery',
    description: 'A locally illustrated gallery of original cover studies and visual notes.',
    items: [
      { title: 'Color studies', category: 'Artwork', body: 'A set of original palette explorations inspired by fantasy, sports, and adventure.' },
      { title: 'Seasonal moodboards', category: 'Collection', body: 'Visual themes for winter nights, summer festivals, and everything between.' },
      { title: 'Cover design notes', category: 'Process', body: 'How shape, contrast, and type can hint at a story without depicting its characters.' },
    ],
  },
  store: {
    eyebrow: 'Reading shelf',
    title: 'Manga shelf',
    description: 'A local storefront concept for finding reading picks and collecting series.',
    items: [
      { title: 'New volume arrivals', category: 'New', body: 'A shelf for recent volumes, fresh first chapters, and series worth discovering.' },
      { title: 'Readers’ favorites', category: 'Popular', body: 'Browse long-running adventures, complete stories, and hidden gems.' },
      { title: 'Reading guides', category: 'Collections', body: 'Start with a short arc, follow a creator, or explore a genre from the beginning.' },
    ],
  },
  support: {
    eyebrow: 'Help center',
    title: 'Support & account help',
    description: 'Answers for using this local prototype and managing its browser-stored preferences.',
    items: [
      { title: 'Your list stays in this browser', category: 'Lists', body: 'Saved anime are stored locally on this device and are not sent to a server.' },
      { title: 'Theme preferences', category: 'Settings', body: 'Choose light or dark mode from the header. The selection is remembered locally.' },
      { title: 'Catalog coverage', category: 'About', body: 'This prototype uses a small hand-curated sample and does not connect to a live database.' },
    ],
  },
  membership: {
    eyebrow: 'Membership',
    title: 'A quieter way to support anime communities',
    description: 'A membership information page concept, without billing or account services connected.',
    items: [
      { title: 'Support independent communities', category: 'Community', body: 'Membership can fund moderation, accessibility improvements, and community tools.' },
      { title: 'Personal list themes', category: 'Profile', body: 'A future membership tier could offer more ways to organize and present personal lists.' },
      { title: 'No payment collection here', category: 'Prototype', body: 'This front-end sample has no payment processor or membership backend.' },
    ],
  },
  login: {
    eyebrow: 'Account',
    title: 'Sign in to your local profile',
    description: 'Account authentication is not connected in this front-end prototype.',
    items: [
      { title: 'Saved titles stay on this device', category: 'Privacy', body: 'List changes use local browser storage and are not sent to an account service.' },
      { title: 'No password fields are collected', category: 'Security', body: 'This demo does not accept, store, or transmit credentials.' },
      { title: 'Browse without an account', category: 'Explore', body: 'The catalog, rankings, discussions, and detail pages are open to every visitor.' },
    ],
  },
  register: {
    eyebrow: 'Account',
    title: 'Create a community profile',
    description: 'A registration information page for the prototype; no account service is connected.',
    items: [
      { title: 'Choose a display name', category: 'Profile', body: 'A future profile could collect public reviews, lists, and seasonal picks.' },
      { title: 'Keep your watchlist organized', category: 'Lists', body: 'Save titles locally and return to them from their detail pages.' },
      { title: 'Authentication is not active', category: 'Prototype', body: 'No personal details or passwords are collected by this page.' },
    ],
  },
  advertising: {
    eyebrow: 'About',
    title: 'Advertising & partnerships',
    description: 'An information page for a clean catalog experience; this prototype serves no advertisements.',
    items: [
      { title: 'No ad trackers', category: 'Privacy', body: 'The local app does not include ad networks, retargeting, or analytics beacons.' },
      { title: 'Editorial partnerships', category: 'Partnerships', body: 'Any future partner content should be labeled clearly and kept separate from reviews.' },
      { title: 'Contact the project owner', category: 'Contact', body: 'A real contact form requires a server-side endpoint, which this prototype does not have.' },
    ],
  },
};

export const directoryContent = {
  characters: {
    title: 'Character directory',
    description: 'Browse standout personalities by series, genre, and role.',
    items: ['The reluctant leader', 'The patient mentor', 'The brilliant tactician', 'The loyal rival', 'The cheerful inventor', 'The wandering mage'],
  },
  people: {
    title: 'People & creators',
    description: 'A guide to the voices and creative teams behind animated stories.',
    items: ['Voice performers', 'Animation directors', 'Character designers', 'Series composers', 'Screenwriters', 'Studio teams'],
  },
  clubs: {
    title: 'Clubs',
    description: 'Small communities for shared watchlists, genres, and seasonal picks.',
    items: ['Fantasy after hours', 'Weekly episode club', 'Manga-to-anime readers', 'Animation craft notes', 'Sports series fans', 'Soundtrack exchange'],
  },
  members: {
    title: 'Member spaces',
    description: 'Find public profiles and compare what other viewers are watching.',
    items: ['AnimeFan', 'FrameByFrame', 'PaperLantern', 'OrbitingComet', 'QuietFinale', 'PanelCollector'],
  },
  forums: {
    title: 'Discussion boards',
    description: 'Open conversations for new episodes, old favorites, and watch-along groups.',
    items: ['This week’s episode thread', 'What are you watching?', 'Series with great soundtracks', 'Help me find a fantasy show', 'Season finale discussion', 'Manga reading circle'],
  },
  stacks: {
    title: 'Interest stacks',
    description: 'Themed lists made to capture a mood, a genre, or a very specific weekend.',
    items: ['One more episode', 'Quiet journeys', 'Rivalries with heart', 'Unusual fantasy worlds', 'Short series for a weekend', 'Great first episodes'],
  },
  staff: {
    title: 'Production staff',
    description: 'Explore the roles, collaborations, and studios involved in bringing a series to life.',
    items: ['Series direction', 'Animation production', 'Art direction', 'Sound production', 'Original music', 'Script and story'],
  },
  companies: {
    title: 'Studios & publishers',
    description: 'A directory of the teams and publishers connected to anime and manga.',
    items: ['Animation studios', 'Manga publishers', 'Music labels', 'Distribution partners', 'Production committees', 'Independent creators'],
  },
  blogs: {
    title: 'Member blogs',
    description: 'Personal essays and watch journals from the community.',
    items: ['A season in three shows', 'Keeping a weekend watchlist', 'The first episode that hooked me', 'What makes a great ending', 'Notes from a manga shelf', 'A year of fantasy worlds'],
  },
};

export const homeContent = {
  discussions: [
    { title: 'What makes a rewatch feel new?', category: 'Discussion', body: 'Members compare the small details they noticed only after returning to a favorite series.' },
    { title: 'Pick a series for a quiet weekend', category: 'Watch together', body: 'A spoiler-free thread for short shows, gentle pacing, and good company.' },
    { title: 'Weekly episode notes', category: 'Seasonal', body: 'Share reactions and theories while keeping major plot details behind spoiler warnings.' },
  ],
  episodeUpdates: [
    { slug: 'frieren', label: 'Episode conversation', note: 'New member notes' },
    { slug: 'blue-lock', label: 'Match discussion', note: 'Community thread' },
    { slug: 'solo-leveling', label: 'Episode guide', note: 'Updated recently' },
    { slug: 'my-hero-academia', label: 'Watch-along', note: 'Open discussion' },
  ],
  friendUpdates: [
    { name: 'PaperLantern', action: 'added a title to their list', slug: 'frieren' },
    { name: 'FrameByFrame', action: 'shared a review', slug: 'blue-lock' },
    { name: 'QuietFinale', action: 'started a new series', slug: 'solo-leveling' },
  ],
};
