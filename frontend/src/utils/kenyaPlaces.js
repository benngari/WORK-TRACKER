// Approximate coordinates for Kenya's counties and common towns, used to place sites on the map
// when a site has no exact coordinates. Format: [name, latitude, longitude].

const COUNTIES = [
  ['Mombasa', -4.04, 39.67], ['Kwale', -4.17, 39.45], ['Kilifi', -3.63, 39.85], ['Tana River', -1.5, 40.03],
  ['Lamu', -2.27, 40.9], ['Taita Taveta', -3.4, 38.56], ['Garissa', -0.45, 39.65], ['Wajir', 1.75, 40.06],
  ['Mandera', 3.94, 41.86], ['Marsabit', 2.33, 37.99], ['Isiolo', 0.35, 37.58], ['Meru', 0.05, 37.65],
  ['Tharaka Nithi', -0.33, 37.65], ['Embu', -0.53, 37.45], ['Kitui', -1.37, 38.01], ['Machakos', -1.52, 37.26],
  ['Makueni', -1.78, 37.63], ['Nyandarua', -0.27, 36.38], ['Nyeri', -0.42, 36.95], ['Kirinyaga', -0.5, 37.28],
  ['Muranga', -0.72, 37.15], ['Kiambu', -1.17, 36.83], ['Turkana', 3.12, 35.6], ['West Pokot', 1.24, 35.11],
  ['Samburu', 1.1, 36.7], ['Trans Nzoia', 1.02, 35.0], ['Uasin Gishu', 0.51, 35.27], ['Elgeyo Marakwet', 0.67, 35.51],
  ['Nandi', 0.2, 35.1], ['Baringo', 0.49, 35.74], ['Laikipia', 0.01, 37.07], ['Nakuru', -0.3, 36.07],
  ['Narok', -1.08, 35.87], ['Kajiado', -1.85, 36.78], ['Kericho', -0.37, 35.28], ['Bomet', -0.78, 35.34],
  ['Kakamega', 0.28, 34.75], ['Vihiga', 0.08, 34.72], ['Bungoma', 0.57, 34.56], ['Busia', 0.46, 34.11],
  ['Siaya', 0.06, 34.29], ['Kisumu', -0.09, 34.77], ['Homa Bay', -0.53, 34.46], ['Migori', -1.06, 34.47],
  ['Kisii', -0.68, 34.77], ['Nyamira', -0.57, 34.95], ['Nairobi', -1.286, 36.817],
];

const TOWNS = [
  // Nairobi and surroundings
  ['Nairobi CBD', -1.286, 36.82], ['Westlands', -1.27, 36.81], ['Kilimani', -1.29, 36.79], ['Kileleshwa', -1.28, 36.78],
  ['Lavington', -1.28, 36.77], ['Karen', -1.32, 36.71], ['Langata', -1.35, 36.74], ['South B', -1.31, 36.84],
  ['South C', -1.32, 36.82], ['Eastleigh', -1.27, 36.85], ['Industrial Area', -1.31, 36.85], ['Parklands', -1.26, 36.82],
  ['Gigiri', -1.23, 36.8], ['Kangemi', -1.27, 36.75], ['Dagoretti', -1.3, 36.74], ['Kasarani', -1.22, 36.9],
  ['Roysambu', -1.22, 36.88], ['Githurai', -1.19, 36.92], ['Kahawa', -1.18, 36.93], ['Embakasi', -1.32, 36.9],
  ['Utawala', -1.29, 37.0], ['Syokimau', -1.36, 36.94], ['Mlolongo', -1.39, 36.94], ['Athi River', -1.45, 36.98],
  ['Kitengela', -1.47, 36.96], ['Rongai', -1.4, 36.76], ['Ongata Rongai', -1.4, 36.76], ['Ngong', -1.36, 36.66],
  ['Kikuyu', -1.25, 36.66], ['Limuru', -1.11, 36.64], ['Ruaka', -1.2, 36.78], ['Ruiru', -1.15, 36.96],
  ['Juja', -1.1, 37.01], ['Thika', -1.04, 37.09], ['Kiambu', -1.17, 36.83], ['Githunguri', -1.06, 36.77],
  ['Kajiado', -1.85, 36.78], ['Namanga', -2.55, 36.79], ['Isinya', -1.67, 36.85],
  // Central
  ['Murang\'a', -0.72, 37.15], ['Sagana', -0.67, 37.21], ['Karatina', -0.48, 37.13], ['Nyeri', -0.42, 36.95],
  ['Nanyuki', 0.01, 37.07], ['Nyahururu', 0.04, 36.37], ['Ol Kalou', -0.27, 36.38], ['Kerugoya', -0.5, 37.28],
  ['Kutus', -0.57, 37.3], ['Embu', -0.53, 37.45], ['Runyenjes', -0.42, 37.57],
  // Rift Valley
  ['Nakuru', -0.3, 36.07], ['Naivasha', -0.72, 36.43], ['Gilgil', -0.5, 36.32], ['Molo', -0.25, 35.73],
  ['Njoro', -0.33, 35.94], ['Narok', -1.08, 35.87], ['Kericho', -0.37, 35.28], ['Litein', -0.58, 35.19],
  ['Bomet', -0.78, 35.34], ['Sotik', -0.68, 35.12], ['Eldoret', 0.51, 35.27], ['Iten', 0.67, 35.51],
  ['Kapsabet', 0.2, 35.1], ['Kabarnet', 0.49, 35.74], ['Eldama Ravine', 0.05, 35.72], ['Kitale', 1.02, 35.0],
  ['Kapenguria', 1.24, 35.11], ['Maralal', 1.1, 36.7], ['Lodwar', 3.12, 35.6],
  // Western and Nyanza
  ['Kakamega', 0.28, 34.75], ['Mumias', 0.33, 34.49], ['Webuye', 0.61, 34.77], ['Bungoma', 0.57, 34.56],
  ['Busia', 0.46, 34.11], ['Vihiga', 0.08, 34.72], ['Kisumu', -0.09, 34.77], ['Siaya', 0.06, 34.29],
  ['Bondo', 0.23, 34.27], ['Homa Bay', -0.53, 34.46], ['Migori', -1.06, 34.47], ['Kisii', -0.68, 34.77],
  ['Nyamira', -0.57, 34.95], ['Rongo', -0.76, 34.6],
  // Eastern and North Eastern
  ['Machakos', -1.52, 37.26], ['Wote', -1.78, 37.63], ['Emali', -2.08, 37.47], ['Kitui', -1.37, 38.01],
  ['Mwingi', -0.93, 38.06], ['Meru', 0.05, 37.65], ['Maua', 0.23, 37.94], ['Chuka', -0.33, 37.65],
  ['Isiolo', 0.35, 37.58], ['Marsabit', 2.33, 37.99], ['Moyale', 3.52, 39.06], ['Garissa', -0.45, 39.65],
  ['Wajir', 1.75, 40.06], ['Mandera', 3.94, 41.86],
  // Coast
  ['Mombasa', -4.04, 39.67], ['Nyali', -4.03, 39.72], ['Likoni', -4.08, 39.66], ['Mtwapa', -3.95, 39.74],
  ['Kilifi', -3.63, 39.85], ['Malindi', -3.22, 40.12], ['Watamu', -3.35, 40.02], ['Diani', -4.28, 39.59],
  ['Ukunda', -4.29, 39.57], ['Kwale', -4.17, 39.45], ['Lunga Lunga', -4.55, 39.12], ['Voi', -3.4, 38.56],
  ['Mtito Andei', -2.69, 38.17], ['Taveta', -3.4, 37.68], ['Wundanyi', -3.4, 38.36], ['Hola', -1.5, 40.03],
  ['Lamu', -2.27, 40.9],
];

// "Murang'a County", "Nairobi City", "KIKUYU town" -> "muranga", "nairobi", "kikuyu"
export function normalizePlace(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/county|town|city|sub|\./g, '')
    .replace(/[^a-z]/g, '');
}

const TOWN_INDEX = {};
const COUNTY_INDEX = {};
for (const [name, lat, lng] of TOWNS) TOWN_INDEX[normalizePlace(name)] = { name, lat, lng };
for (const [name, lat, lng] of COUNTIES) {
  COUNTY_INDEX[normalizePlace(name)] = { name, lat, lng };
  if (!TOWN_INDEX[normalizePlace(name)]) TOWN_INDEX[normalizePlace(name)] = { name, lat, lng };
}

// look for a known town inside free text such as "Kikuyu town, near the stage"
function findInText(text) {
  const tokens = String(text || '').toLowerCase().split(/[^a-z']+/).filter(Boolean);
  for (let size = 3; size >= 1; size -= 1) {
    for (let i = 0; i + size <= tokens.length; i += 1) {
      const key = normalizePlace(tokens.slice(i, i + size).join(''));
      if (key.length >= 4 && TOWN_INDEX[key]) return TOWN_INDEX[key];
    }
  }
  return null;
}

const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

// Returns { lat, lng, approx, basis } for a site, or null if it cannot be placed.
export function locateSite(site) {
  if (isNum(site.latitude) && isNum(site.longitude)) {
    return { lat: Number(site.latitude), lng: Number(site.longitude), approx: false, basis: 'exact coordinates' };
  }
  const attempts = [
    ['town', () => TOWN_INDEX[normalizePlace(site.town)]],
    ['branch', () => (site.siteType === 'Bank' ? findInText(site.branch) : null)],
    ['location', () => findInText(site.location)],
    ['site name', () => findInText(site.siteName)],
    ['county', () => COUNTY_INDEX[normalizePlace(site.county)]],
    ['Nairobi', () => (site.isNairobi ? COUNTY_INDEX.nairobi : null)],
  ];
  for (const [basis, find] of attempts) {
    const hit = find();
    if (hit) return { lat: hit.lat, lng: hit.lng, approx: true, basis: `${basis}: ${hit.name}` };
  }
  return null;
}