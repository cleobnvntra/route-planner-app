import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Warns when the City's depot pages change, so a person can re-verify
 * stations.json. It never edits stations.json.
 *
 * Exit codes: 0 unchanged, 1 changed, 2 could not check.
 */

export type Source = { name: string; url: string; start: string; end: string };

export const SOURCES: Source[] = [
  {
    name: 'locations',
    url: 'https://www.toronto.ca/services-payments/recycling-organics-garbage/drop-off-depots/locations/',
    start: 'Below are the locations',
    end: 'In This Section',
  },
  {
    name: 'accepted-items',
    url: 'https://www.toronto.ca/services-payments/recycling-organics-garbage/drop-off-depots/accepted-items/',
    start: 'Here are all of the items',
    end: 'In This Section',
  },
];

const HASH_FILE = fileURLToPath(new URL('./source-hashes.json', import.meta.url));
const TIMEOUT_MS = 30_000;

const ENTITIES: Record<string, string> = {
  amp: '&',
  nbsp: ' ',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '-',
  mdash: '-',
  rsquo: "'",
  lsquo: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith('#')) {
      const isHex = code[1]?.toLowerCase() === 'x';
      const value = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isNaN(value) || value > 0x10ffff ? match : String.fromCodePoint(value);
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/**
 * The visible text between two markers, with whitespace normalized. Throws if
 * a marker is missing: a redesigned page must not pass as "unchanged".
 */
export function relevantText(html: string, source: Pick<Source, 'name' | 'start' | 'end'>): string {
  const text = decodeEntities(
    html
      .replace(/<(script|style|nav|header|footer|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

  const from = text.indexOf(source.start);
  if (from === -1) throw new Error(`${source.name}: start marker "${source.start}" not found`);
  const to = text.indexOf(source.end, from);
  if (to === -1) throw new Error(`${source.name}: end marker "${source.end}" not found`);
  return text.slice(from, to).trim();
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function fetchHash(source: Source): Promise<string> {
  const response = await fetch(source.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (route-planner-app source check)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  return hashText(relevantText(await response.text(), source));
}

function readStored(): Record<string, string> {
  if (!existsSync(HASH_FILE)) return {};
  return JSON.parse(readFileSync(HASH_FILE, 'utf8')) as Record<string, string>;
}

async function main(): Promise<number> {
  const accept = process.argv.includes('--accept');
  const stored = readStored();
  const current: Record<string, string> = {};
  for (const source of SOURCES) current[source.name] = await fetchHash(source);

  if (accept) {
    writeFileSync(HASH_FILE, `${JSON.stringify(current, null, 2)}\n`);
    console.log('Saved current page hashes. Only do this after re-verifying stations.json.');
    return 0;
  }

  let changed = false;
  for (const source of SOURCES) {
    const previous = stored[source.name];
    if (!previous) {
      console.error(`No stored hash for ${source.name}. Run npm run check-sources:accept after verifying.`);
      return 2;
    }
    if (previous !== current[source.name]) {
      changed = true;
      console.log(`City depot page changed, re-verify stations.json (${source.url})`);
    }
  }
  if (!changed) console.log('City depot pages unchanged.');
  return changed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(`Could not check sources: ${(err as Error).message}`);
      process.exitCode = 2;
    },
  );
}
