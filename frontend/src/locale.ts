/**
 * Localization helpers for displaying crime data in Kannada.
 *
 * The database stores crime types, districts, and descriptions in English.
 * When the UI language is Kannada, these helpers translate the displayed
 * values so a Kannada-only user can read the results. Unknown values fall
 * back to the original English text.
 */

type Lang = 'en' | 'kn';

// Crime types (the 10 categories in the dataset)
const CRIME_TYPE_KN: Record<string, string> = {
  'theft': 'ಕಳ್ಳತನ',
  'murder': 'ಕೊಲೆ',
  'snatching': 'ಸೆಳೆದುಕೊಳ್ಳುವಿಕೆ',
  'robbery': 'ದರೋಡೆ',
  'assault': 'ಹಲ್ಲೆ',
  'burglary': 'ಮನೆಗಳ್ಳತನ',
  'rioting': 'ಗಲಭೆ',
  'cheating': 'ವಂಚನೆ',
  'forgery': 'ನಕಲಿ ದಾಖಲೆ',
  'counterfeiting': 'ಖೋಟಾ ನೋಟು',
};

// Districts (10 in the dataset)
const DISTRICT_KN: Record<string, string> = {
  'bengaluru urban': 'ಬೆಂಗಳೂರು ನಗರ',
  'bengaluru rural': 'ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ',
  'mysuru': 'ಮೈಸೂರು',
  'belagavi': 'ಬೆಳಗಾವಿ',
  'kalaburagi': 'ಕಲಬುರಗಿ',
  'mangaluru': 'ಮಂಗಳೂರು',
  'hubli': 'ಹುಬ್ಬಳ್ಳಿ',
  'dharwad': 'ಧಾರವಾಡ',
  'tumakuru': 'ತುಮಕೂರು',
  'raichur': 'ರಾಯಚೂರು',
};

// Crime descriptions (the fixed set used to seed the data)
const DESCRIPTION_KN: Record<string, string> = {
  // Theft
  'mobile phone theft from public bus': 'ಸಾರ್ವಜನಿಕ ಬಸ್‌ನಲ್ಲಿ ಮೊಬೈಲ್ ಫೋನ್ ಕಳ್ಳತನ',
  'laptop theft from parked vehicle': 'ನಿಲ್ಲಿಸಿದ ವಾಹನದಿಂದ ಲ್ಯಾಪ್‌ಟಾಪ್ ಕಳ್ಳತನ',
  'bike theft from parking lot': 'ಪಾರ್ಕಿಂಗ್ ಸ್ಥಳದಿಂದ ಬೈಕ್ ಕಳ್ಳತನ',
  'jewelry theft from residence': 'ಮನೆಯಿಂದ ಆಭರಣ ಕಳ್ಳತನ',
  'wallet theft from shopping mall': 'ಶಾಪಿಂಗ್ ಮಾಲ್‌ನಲ್ಲಿ ಪರ್ಸ್ ಕಳ್ಳತನ',
  'cash theft from auto rickshaw': 'ಆಟೋ ರಿಕ್ಷಾದಿಂದ ನಗದು ಕಳ್ಳತನ',
  'two-wheeler theft at night': 'ರಾತ್ರಿ ವೇಳೆ ದ್ವಿಚಕ್ರ ವಾಹನ ಕಳ್ಳತನ',
  // Murder
  'homicide investigation ongoing': 'ಕೊಲೆ ತನಿಖೆ ಪ್ರಗತಿಯಲ್ಲಿದೆ',
  'murder case under investigation': 'ಕೊಲೆ ಪ್ರಕರಣ ತನಿಖೆಯಲ್ಲಿದೆ',
  'suspect arrested in murder case': 'ಕೊಲೆ ಪ್ರಕರಣದಲ್ಲಿ ಶಂಕಿತ ಬಂಧನ',
  'fatal assault leading to death': 'ಮಾರಣಾಂತಿಕ ಹಲ್ಲೆಯಿಂದ ಸಾವು',
  // Snatching
  'chain snatching by bike-borne assailants': 'ಬೈಕ್ ಸವಾರರಿಂದ ಸರ ಸೆಳೆತ',
  'mobile phone snatching on road': 'ರಸ್ತೆಯಲ್ಲಿ ಮೊಬೈಲ್ ಫೋನ್ ಸೆಳೆತ',
  'bag snatching incident': 'ಬ್ಯಾಗ್ ಸೆಳೆತ ಘಟನೆ',
  'gold chain snatched from pedestrian': 'ಪಾದಚಾರಿಯಿಂದ ಚಿನ್ನದ ಸರ ಸೆಳೆತ',
  // Robbery
  'armed robbery at shop': 'ಅಂಗಡಿಯಲ್ಲಿ ಸಶಸ್ತ್ರ ದರೋಡೆ',
  'house robbery during daytime': 'ಹಗಲಿನಲ್ಲಿ ಮನೆ ದರೋಡೆ',
  'atm robbery attempt': 'ಎಟಿಎಂ ದರೋಡೆ ಯತ್ನ',
  'bank robbery investigation': 'ಬ್ಯಾಂಕ್ ದರೋಡೆ ತನಿಖೆ',
  // Assault
  'physical assault after argument': 'ವಾಗ್ವಾದದ ನಂತರ ದೈಹಿಕ ಹಲ್ಲೆ',
  'assault case registered': 'ಹಲ್ಲೆ ಪ್ರಕರಣ ದಾಖಲು',
  'group assault incident': 'ಗುಂಪು ಹಲ್ಲೆ ಘಟನೆ',
  'assault with deadly weapon': 'ಮಾರಕ ಆಯುಧದಿಂದ ಹಲ್ಲೆ',
  // Burglary
  'residential burglary reported': 'ವಸತಿ ಮನೆಗಳ್ಳತನ ವರದಿ',
  'shop burglary at night': 'ರಾತ್ರಿ ವೇಳೆ ಅಂಗಡಿ ಕನ್ನ',
  'office burglary during weekend': 'ವಾರಾಂತ್ಯದಲ್ಲಿ ಕಚೇರಿ ಕನ್ನ',
  'house breaking and theft': 'ಮನೆ ಕನ್ನ ಮತ್ತು ಕಳ್ಳತನ',
  // Rioting
  'public riot and disturbance': 'ಸಾರ್ವಜನಿಕ ಗಲಭೆ ಮತ್ತು ಗೊಂದಲ',
  'group clash incident': 'ಗುಂಪು ಘರ್ಷಣೆ ಘಟನೆ',
  'unlawful assembly case': 'ಕಾನೂನುಬಾಹಿರ ಸಭೆ ಪ್ರಕರಣ',
  // Cheating
  'online fraud case': 'ಆನ್‌ಲೈನ್ ವಂಚನೆ ಪ್ರಕರಣ',
  'investment scam reported': 'ಹೂಡಿಕೆ ವಂಚನೆ ವರದಿ',
  'credit card fraud': 'ಕ್ರೆಡಿಟ್ ಕಾರ್ಡ್ ವಂಚನೆ',
  'business fraud investigation': 'ವ್ಯಾಪಾರ ವಂಚನೆ ತನಿಖೆ',
  // Forgery
  'document forgery case': 'ದಾಖಲೆ ನಕಲಿ ಪ್ರಕರಣ',
  'signature forgery detected': 'ಸಹಿ ನಕಲಿ ಪತ್ತೆ',
  'certificate forgery': 'ಪ್ರಮಾಣಪತ್ರ ನಕಲಿ',
  // Counterfeiting
  'fake currency seized': 'ನಕಲಿ ನೋಟು ವಶ',
  'counterfeit notes recovered': 'ಖೋಟಾ ನೋಟುಗಳ ವಶ',
  'currency counterfeiting racket busted': 'ನೋಟು ನಕಲಿ ಜಾಲ ಭೇದ',
};

// Tokens used inside taluk / police-station names
const PLACE_TOKEN_KN: Record<string, string> = {
  'taluk': 'ತಾಲೂಕು',
  'station': 'ಠಾಣೆ',
  'city': 'ನಗರ',
  'urban': 'ನಗರ',
  'rural': 'ಗ್ರಾಮಾಂತರ',
  'bengaluru': 'ಬೆಂಗಳೂರು',
  'mysuru': 'ಮೈಸೂರು',
  'belagavi': 'ಬೆಳಗಾವಿ',
  'kalaburagi': 'ಕಲಬುರಗಿ',
  'mangaluru': 'ಮಂಗಳೂರು',
  'hubli': 'ಹುಬ್ಬಳ್ಳಿ',
  'dharwad': 'ಧಾರವಾಡ',
  'tumakuru': 'ತುಮಕೂರು',
  'raichur': 'ರಾಯಚೂರು',
};

export const localizeCrimeType = (value: string | undefined, lang: Lang): string => {
  if (!value) return value || '';
  if (lang === 'en') return value;
  return CRIME_TYPE_KN[value.toLowerCase().trim()] || value;
};

export const localizeDistrict = (value: string | undefined, lang: Lang): string => {
  if (!value) return value || '';
  if (lang === 'en') return value;
  return DISTRICT_KN[value.toLowerCase().trim()] || value;
};

export const localizeDescription = (value: string | undefined, lang: Lang): string => {
  if (!value) return value || '';
  if (lang === 'en') return value;
  return DESCRIPTION_KN[value.toLowerCase().trim()] || value;
};

/** Translate taluk / police-station names token-by-token (best effort). */
export const localizePlace = (value: string | undefined, lang: Lang): string => {
  if (!value) return value || '';
  if (lang === 'en') return value;
  // First try a full district match
  const districtMatch = DISTRICT_KN[value.toLowerCase().trim()];
  if (districtMatch) return districtMatch;
  // Otherwise replace known tokens
  return value
    .split(/\s+/)
    .map((word) => PLACE_TOKEN_KN[word.toLowerCase()] || word)
    .join(' ');
};

// Kannada transliteration for the fixed set of name tokens used in the data.
const NAME_KN: Record<string, string> = {
  // First names
  'ravi': 'ರವಿ', 'suresh': 'ಸುರೇಶ್', 'manjunath': 'ಮಂಜುನಾಥ್', 'prakash': 'ಪ್ರಕಾಶ್',
  'vijay': 'ವಿಜಯ್', 'anand': 'ಆನಂದ್', 'kiran': 'ಕಿರಣ್', 'naveen': 'ನವೀನ್',
  'ramesh': 'ರಮೇಶ್', 'mahesh': 'ಮಹೇಶ್', 'santosh': 'ಸಂತೋಷ್', 'girish': 'ಗಿರೀಶ್',
  'lokesh': 'ಲೋಕೇಶ್', 'dinesh': 'ದಿನೇಶ್', 'harish': 'ಹರೀಶ್', 'umesh': 'ಉಮೇಶ್',
  'lakshmi': 'ಲಕ್ಷ್ಮಿ', 'geetha': 'ಗೀತಾ', 'sunitha': 'ಸುನೀತಾ', 'pavithra': 'ಪವಿತ್ರಾ',
  'divya': 'ದಿವ್ಯಾ', 'ananya': 'ಅನನ್ಯಾ', 'kavya': 'ಕಾವ್ಯಾ', 'shruthi': 'ಶ್ರುತಿ',
  'roopa': 'ರೂಪಾ', 'asha': 'ಆಶಾ', 'deepa': 'ದೀಪಾ', 'nandini': 'ನಂದಿನಿ',
  'imran': 'ಇಮ್ರಾನ್', 'salman': 'ಸಲ್ಮಾನ್', 'abdul': 'ಅಬ್ದುಲ್', 'fayaz': 'ಫಯಾಜ್',
  'joseph': 'ಜೋಸೆಫ್', 'thomas': 'ಥಾಮಸ್', 'antony': 'ಆಂಟನಿ', 'david': 'ಡೇವಿಡ್',
  'rahul': 'ರಾಹುಲ್', 'arjun': 'ಅರ್ಜುನ್', 'vikram': 'ವಿಕ್ರಮ್', 'sandeep': 'ಸಂದೀಪ್',
  // Last names
  'gowda': 'ಗೌಡ', 'reddy': 'ರೆಡ್ಡಿ', 'shetty': 'ಶೆಟ್ಟಿ', 'nayak': 'ನಾಯಕ್',
  'patil': 'ಪಾಟೀಲ್', 'hegde': 'ಹೆಗ್ಡೆ', 'rao': 'ರಾವ್', 'kumar': 'ಕುಮಾರ್',
  'naik': 'ನಾಯ್ಕ್', 'murthy': 'ಮೂರ್ತಿ', 'acharya': 'ಆಚಾರ್ಯ', 'desai': 'ದೇಸಾಯಿ',
  'kulkarni': 'ಕುಲಕರ್ಣಿ', 'pai': 'ಪೈ', 'bhat': 'ಭಟ್', 'shastri': 'ಶಾಸ್ತ್ರಿ',
  'khan': 'ಖಾನ್', 'sheikh': 'ಶೇಖ್', 'pinto': 'ಪಿಂಟೊ', "d'souza": 'ಡಿಸೋಜಾ',
};

/** Transliterate a person's name into Kannada (token-by-token). */
export const localizePersonName = (value: string | undefined, lang: Lang): string => {
  if (!value) return value || '';
  if (lang === 'en') return value;
  return value
    .split(/\s+/)
    .map((tok) => NAME_KN[tok.toLowerCase()] || tok)
    .join(' ');
};

/** Localize a breakdown chart label (could be a district or a crime type). */
export const localizeLabel = (value: string, lang: Lang): string => {
  if (lang === 'en') return value;
  const key = value.toLowerCase().trim();
  return DISTRICT_KN[key] || CRIME_TYPE_KN[key] || value; // months pass through
};

/** Build a localized answer sentence for the chat response. */
export const buildAnswer = (
  lang: Lang,
  intent: string,
  entities: Record<string, any>,
  count: number
): string => {
  if (lang === 'en') return ''; // caller uses the server-provided English answer

  if (intent === 'UNKNOWN') {
    return (
      'ಕ್ಷಮಿಸಿ, ಅದು ಅರ್ಥವಾಗಲಿಲ್ಲ. ನಾನು ಅಪರಾಧ ದಾಖಲೆಗಳ ಬಗ್ಗೆ ಸಹಾಯ ಮಾಡಬಲ್ಲೆ. ಪ್ರಯತ್ನಿಸಿ:\n' +
      '• ‘ಬೆಂಗಳೂರಿನಲ್ಲಿ ಅಪರಾಧಗಳನ್ನು ತೋರಿಸಿ’\n' +
      '• ‘ಮೈಸೂರಿನಲ್ಲಿ ಎಷ್ಟು ಕಳ್ಳತನಗಳು’\n' +
      '• ‘ಜಿಲ್ಲೆವಾರು ಅಪರಾಧಗಳು’'
    );
  }

  if (intent === 'BREAKDOWN_CRIMES') {
    const dim = entities?.group_by || 'district';
    const dimKn = dim === 'district' ? 'ಜಿಲ್ಲೆವಾರು' : dim === 'crime_type' ? 'ಪ್ರಕಾರವಾರು' : 'ತಿಂಗಳವಾರು';
    return `${dimKn} ಅಪರಾಧ ವಿಭಜನೆ (${count} ಗುಂಪುಗಳು):`;
  }

  if (count === 0) {
    return 'ನಿಮ್ಮ ಮಾನದಂಡಗಳಿಗೆ ಹೊಂದುವ ಯಾವುದೇ ಅಪರಾಧ ಕಂಡುಬಂದಿಲ್ಲ. ಬೇರೆ ಸ್ಥಳ ಅಥವಾ ಅಪರಾಧ ಪ್ರಕಾರವನ್ನು ಪ್ರಯತ್ನಿಸಿ.';
  }

  return `${count} ಅಪರಾಧ ದಾಖಲೆ(ಗಳು) ಕಂಡುಬಂದಿವೆ.`;
};
