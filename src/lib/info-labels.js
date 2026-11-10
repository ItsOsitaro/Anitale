import { toPersianDigits } from '@/lib/digits.js';
import { genreLabel } from '@/lib/genre-kinds.js';

// Persian labels (and a few stable values) for the "Information" rows that
// come from the data source in English. Unknown labels/values pass through.
const LABELS = {
  type: 'نوع', episodes: 'قسمت‌ها', chapters: 'فصل‌ها', volumes: 'جلدها', status: 'وضعیت', aired: 'پخش',
  published: 'انتشار', premiered: 'فصل پخش', broadcast: 'زمان پخش', producers: 'تهیه‌کنندگان',
  licensors: 'دارندگان مجوز', studios: 'استودیو', source: 'منبع', genres: 'ژانرها', themes: 'مضمون‌ها',
  demographic: 'مخاطب', duration: 'مدت', rating: 'رده سنی', serialization: 'مجله', authors: 'نویسندگان',
};
const VALUES = {
  status: {
    'finished airing': 'پایان‌یافته', 'currently airing': 'در حال پخش', 'not yet aired': 'هنوز پخش نشده',
    finished: 'پایان‌یافته', publishing: 'در حال انتشار', 'on hiatus': 'متوقف‌شده', discontinued: 'متوقف‌شده',
  },
  source: {
    manga: 'مانگا', 'light novel': 'لایت ‌نوول', novel: 'رمان', original: 'اورجینال', 'web manga': 'وب‌مانگا',
    'visual novel': 'ویژوال نوول', game: 'بازی', 'web novel': 'وب‌نوول', '4-koma manga': 'مانگای چهارپنلی',
  },
  type: { movie: 'فیلم', special: 'ویژه', music: 'موزیک', manga: 'مانگا', 'light novel': 'لایت‌نوول', novel: 'رمان', 'one-shot': 'تک‌قسمتی' },
};

export function infoLabel(label, lang) {
  if (lang !== 'fa') return label;
  return LABELS[String(label).trim().toLowerCase()] || label;
}

const MONTHS = { jan: 'ژانویه', feb: 'فوریه', mar: 'مارس', apr: 'آوریل', may: 'مه', jun: 'ژوئن', jul: 'ژوئیه', aug: 'اوت', sep: 'سپتامبر', oct: 'اکتبر', nov: 'نوامبر', dec: 'دسامبر' };
const SEASONS = { winter: 'زمستان', spring: 'بهار', summer: 'تابستان', fall: 'پاییز', autumn: 'پاییز' };
const DAYS = { monday: 'دوشنبه', tuesday: 'سه‌شنبه', wednesday: 'چهارشنبه', thursday: 'پنجشنبه', friday: 'جمعه', saturday: 'شنبه', sunday: 'یکشنبه' };

// "Oct 3, 2002" / "Jan 2027" / "2002" -> "۳ اکتبر ۲۰۰۲"; "?" -> "؟"
function faDate(part) {
  const text = part.trim();
  if (text === '?') return 'نامشخص';
  let m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/.exec(text);
  if (m && MONTHS[m[1].toLowerCase()]) return toPersianDigits(`${m[2]} ${MONTHS[m[1].toLowerCase()]} ${m[3]}`);
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{4})$/.exec(text);
  if (m && MONTHS[m[1].toLowerCase()]) return toPersianDigits(`${MONTHS[m[1].toLowerCase()]} ${m[2]}`);
  return toPersianDigits(text);
}

function faRange(value) {
  const parts = value.split(/ to /i);
  return parts.length === 2 ? `${faDate(parts[0])} تا ${faDate(parts[1])}` : faDate(value);
}

function faValueByLabel(key, value) {
  const text = value.trim();
  if (key === 'aired' || key === 'published') return faRange(text);
  if (key === 'premiered') {
    const m = /^(winter|spring|summer|fall|autumn) (\d{4})$/i.exec(text);
    return m ? toPersianDigits(`${SEASONS[m[1].toLowerCase()]} ${m[2]}`) : text;
  }
  if (key === 'broadcast') {
    const m = /^([A-Za-z]+?)s? at (\d{1,2}:\d{2}) \(JST\)$/.exec(text);
    if (m && DAYS[m[1].toLowerCase()]) return toPersianDigits(`${DAYS[m[1].toLowerCase()]}‌ها ساعت ${m[2]} (به وقت ژاپن)`);
    return text;
  }
  if (key === 'duration') {
    const hr = /(\d+) hr/.exec(text);
    const min = /(\d+) min/.exec(text);
    if (!hr && !min) return text;
    const bits = [];
    if (hr) bits.push(`${hr[1]} ساعت`);
    if (min) bits.push(`${min[1]} دقیقه`);
    return toPersianDigits(bits.join(' و ') + (/per ep/i.test(text) ? ' در هر قسمت' : ''));
  }
  return null;
}

export function infoValue(label, value, lang) {
  if (lang !== 'fa' || typeof value !== 'string') return value;
  if (['unknown', 'not available', 'tbd'].includes(value.trim().toLowerCase())) return 'نامشخص';
  if (['episodes', 'chapters', 'volumes'].includes(String(label).trim().toLowerCase()) && /^\d+$/.test(value.trim())) return toPersianDigits(value.trim());
  if (['genres', 'themes', 'demographic', 'ژانرها', 'تم‌ها', 'مضمون‌ها', 'مخاطب'].includes(String(label).trim().toLowerCase())) return value.split(/\s*,\s*/).map((name) => genreLabel(name, 'fa')).join('، ');
  const byLabel = faValueByLabel(String(label).trim().toLowerCase(), value);
  if (byLabel) return byLabel;
  const map = VALUES[String(label).trim().toLowerCase()];
  return (map && map[value.trim().toLowerCase()]) || value;
}
