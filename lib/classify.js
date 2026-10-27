// Keyword classifier that tags each event as design, tech, both, or neither.
// A trailing "*" means prefix match (useful for Hungarian word stems); otherwise whole word (plural "s" allowed).
// A leading "~" marks an ambiguous word that only counts in the title, not the description.

const DESIGN = [
  'design', 'designer', 'designing', 'product design*', 'ux design*', 'ui design*', 'ux', 'ui', 'ui/ux', 'user experience', 'user research', 'usability',
  'figma', 'typography', 'type design', 'branding', 'brand identity', 'illustration', 'illustrator',
  'motion graphic*', 'motion design', '~animation', '~3d', '~visual', 'creative technolog*', 'creative coding', 'service design',
  'design system*', '~interaction', 'prototyp*', 'accessibility', 'a11y', '~graphic*', 'webflow',
  'framer', '~portfolio', 'art direction', 'dizájn*', '~tervez*', 'grafik*', 'építész*',
  'architekt*', 'arculat*', 'felhasználói élmény*',
];

const TECH = [
  'tech', 'technology', 'ai', 'a.i.', 'artificial intelligence', 'machine learning', 'ml', 'llm*',
  'gpt', 'genai', '~generative', 'nlp', 'agentic', '~agent', '~data', 'database*', 'developer*', '~dev',
  'devbp', 'devops', 'software', 'engineering', 'engineer', 'coding', '~code', 'vibe-coding',
  'programming', 'python', 'javascript', 'typescript', 'js', 'react', 'java', 'golang', 'rust',
  'kotlin', 'swift', 'cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'k8s', 'kcd', 'docker',
  'cyber*', '~security', 'infosec', 'hacker*', 'hackathon*', 'startup*', 'start-up*', '~founder*',
  'fintech*', 'blockchain', 'crypto*', 'web3', 'saas', 'product manag*', 'producttank', 'agile',
  'scrum', 'iot', 'robotic*', 'open source', '~api', 'frontend', 'backend', 'full-stack', 'fullstack',
  '~qa', '~testing', 'claude', 'openai', 'anthropic', 'copilot', 'power bi', '~fabric', 'analytics',
  '~digital', '~it', 'emnlp*', 'finnlp', 'tokeniz*', 'platform engineering', 'sre', 'mobile app*',
  'webfejleszt*', 'játékfejleszt*', 'fejlesztői*', 'szoftver*', 'informatik*', '~adat*', 'mesterséges intelligencia', 'kiberbiztonság*',
  'programoz*', 'technológi*', 'kripto*', '~digitális',
];

// Matching any of these drops the event even if a keyword hit (e.g. "Startup Running Club").
const EXCLUDE = [
  'running club', 'run club', 'yoga', 'book club', 'walking tour', 'sightseeing', 'halloween',
  'party', 'chess', 'wedding', 'esküvő*', 'murder mystery', 'dance class*', 'wine tasting',
];

function compile(words) {
  words = words.map((w) => w.replace(/^~/, ''));
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = words.map((w) =>
    w.endsWith('*') ? `${escape(w.slice(0, -1))}` : `${escape(w)}s?(?![\\p{L}\\p{N}])`,
  );
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})`, 'iu');
}

const strong = (words) => words.filter((w) => !w.startsWith('~'));
const DESIGN_RE = compile(DESIGN);
const TECH_RE = compile(TECH);
const DESIGN_BODY_RE = compile(strong(DESIGN));
const TECH_BODY_RE = compile(strong(TECH));
const EXCLUDE_RE = compile(EXCLUDE);

// `hints` lets a source vouch for a category (e.g. Meetup's Technology category, Eventbrite tags).
export function classify({ title = '', description = '', organizer = '', tags = [], hints = [] }) {
  const titleText = `${title} ${organizer}`;
  const bodyText = `${description} ${tags.join(' ')}`;
  if (EXCLUDE_RE.test(title)) return [];

  const categories = new Set(hints);
  if (DESIGN_RE.test(titleText) || DESIGN_BODY_RE.test(bodyText)) categories.add('design');
  if (TECH_RE.test(titleText) || TECH_BODY_RE.test(bodyText)) categories.add('tech');
  return [...categories];
}
