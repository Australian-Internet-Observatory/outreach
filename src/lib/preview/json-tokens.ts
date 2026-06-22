export type JsonTokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'ws';

export type JsonToken = {
	type: JsonTokenType;
	value: string;
	isTimestamp?: boolean;
	timestampSeconds?: number;
};

const TIMESTAMP_KEY_PATTERN =
	/^(?:.*[_-])?(?:time|timestamp|date|datetime|created_at|updated_at|deleted_at|expire(?:d|s_at)?|start(?:ed)?_at|end(?:ed)?_at|published_at|modified_at|recorded_at|occurred_at|at)$/i;

const TIMESTAMP_KEY_FRAGMENT = /time|timestamp|^date|_date$|datetime|_at$|^at$/i;

const SECONDS_MIN = 1e8;
const SECONDS_MAX = 1e10;
const MILLIS_MIN = 1e11;
const MILLIS_MAX = 1e13;

function isLikelyTimestampKey(key: string): boolean {
	if (!key) return false;
	if (TIMESTAMP_KEY_PATTERN.test(key)) return true;
	return TIMESTAMP_KEY_FRAGMENT.test(key);
}

function parseTimestampValue(raw: string): number | undefined {
	if (raw === '-' || raw === '') return undefined;
	const num = Number(raw);
	if (!Number.isFinite(num)) return undefined;
	if (num >= SECONDS_MIN && num <= SECONDS_MAX) return num;
	if (num >= MILLIS_MIN && num <= MILLIS_MAX) return num / 1000;
	return undefined;
}

function readString(text: string, start: number): number {
	let i = start + 1;
	while (i < text.length) {
		const ch = text[i];
		if (ch === '\\') {
			i += 2;
			continue;
		}
		if (ch === '"') return i + 1;
		i++;
	}
	return text.length;
}

function readNumber(text: string, start: number): number {
	let i = start;
	if (text[i] === '-') i++;
	if (i >= text.length || text[i] < '0' || text[i] > '9') return start + 1;
	while (i < text.length) {
		const ch = text[i];
		if (ch >= '0' && ch <= '9') {
			i++;
			continue;
		}
		if (ch === '.') {
			i++;
			continue;
		}
		if (ch === 'e' || ch === 'E') {
			i++;
			if (text[i] === '+' || text[i] === '-') i++;
			continue;
		}
		break;
	}
	return i;
}

export function tokenizeJson(text: string): JsonToken[] {
	const tokens: JsonToken[] = [];
	let i = 0;
	let pendingKey: string | null = null;

	while (i < text.length) {
		const ch = text[i];

		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			let j = i;
			while (j < text.length && /\s/.test(text[j])) j++;
			tokens.push({ type: 'ws', value: text.slice(i, j) });
			i = j;
			continue;
		}

		if (ch === '"') {
			const end = readString(text, i);
			const raw = text.slice(i, end);
			const content = raw.slice(1, -1).replace(/\\(.)/g, '$1');

			let k = end;
			while (k < text.length && /\s/.test(text[k])) k++;
			const isKey = text[k] === ':';

			if (isKey) {
				tokens.push({ type: 'key', value: content });
				pendingKey = content;
			} else {
				tokens.push({ type: 'string', value: raw });
				pendingKey = null;
			}
			i = end;
			continue;
		}

		if (
			(ch >= '0' && ch <= '9') ||
			(ch === '-' && i + 1 < text.length && text[i + 1] >= '0' && text[i + 1] <= '9')
		) {
			const end = readNumber(text, i);
			const raw = text.slice(i, end);
			const seconds =
				pendingKey && isLikelyTimestampKey(pendingKey) ? parseTimestampValue(raw) : undefined;
			tokens.push({
				type: 'number',
				value: raw,
				isTimestamp: seconds !== undefined,
				timestampSeconds: seconds
			});
			pendingKey = null;
			i = end;
			continue;
		}

		if (text.startsWith('true', i)) {
			tokens.push({ type: 'boolean', value: 'true' });
			pendingKey = null;
			i += 4;
			continue;
		}
		if (text.startsWith('false', i)) {
			tokens.push({ type: 'boolean', value: 'false' });
			pendingKey = null;
			i += 5;
			continue;
		}
		if (text.startsWith('null', i)) {
			tokens.push({ type: 'null', value: 'null' });
			pendingKey = null;
			i += 4;
			continue;
		}

		tokens.push({ type: 'punct', value: ch });
		if (ch === ',' || ch === '}' || ch === ']') {
			pendingKey = null;
		}
		i++;
	}

	return tokens;
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-AU', {
	year: 'numeric',
	month: 'short',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
	timeZone: 'UTC'
});

export function formatTimestamp(seconds: number): string {
	if (!Number.isFinite(seconds)) return '';
	const ms = Math.round(seconds * 1000);
	const date = new Date(ms);
	if (Number.isNaN(date.getTime())) return '';
	const parts = DATE_FORMATTER.formatToParts(date);
	const lookup: Record<string, string> = {};
	for (const part of parts) lookup[part.type] = part.value;
	const day = lookup.day ?? '';
	const month = lookup.month ?? '';
	const year = lookup.year ?? '';
	const time = `${lookup.hour ?? '00'}:${lookup.minute ?? '00'}:${lookup.second ?? '00'}`;
	return `${day} ${month} ${year}, ${time} UTC`;
}

export function formatOriginalTimestamp(raw: string): string {
	const num = Number(raw);
	if (!Number.isFinite(num)) return raw;
	if (num >= MILLIS_MIN && num <= MILLIS_MAX) {
		return `${raw} (ms)`;
	}
	return `${raw} (s)`;
}
