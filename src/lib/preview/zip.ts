import { strFromU8, unzipSync } from 'fflate';

export type EntryKind = 'html' | 'json' | 'text' | 'binary' | 'unknown';

export type ZipEntry = {
	path: string;
	name: string;
	size: number;
	content: Uint8Array;
	kind: EntryKind;
};

export type Zip = {
	id: string;
	target: string;
	name: string;
	status: 'pending' | 'loading' | 'ready' | 'error';
	error?: string;
	entries: ZipEntry[];
	expanded: boolean;
};

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'tsv', 'log', 'xml', 'yaml', 'yml']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);
const JSON_EXTENSIONS = new Set(['json']);

export function isValidTarget(target: string): boolean {
	if (!target) return false;
	if (target.includes('..')) return false;
	if (target.startsWith('/') || target.startsWith('\\')) return false;
	if (target.includes('\\')) return false;
	if (!target.toLowerCase().endsWith('.zip')) return false;
	return true;
}

export function deriveName(target: string): string {
	const filename = target.split('/').pop() ?? target;
	return filename.replace(/\.zip$/i, '');
}

export function classifyEntry(path: string, content: Uint8Array): EntryKind {
	const ext = (path.split('.').pop() ?? '').toLowerCase();
	if (HTML_EXTENSIONS.has(ext)) return 'html';
	if (JSON_EXTENSIONS.has(ext)) return 'json';
	if (TEXT_EXTENSIONS.has(ext)) return 'text';
	if (looksLikeText(content)) return 'text';
	return 'binary';
}

function looksLikeText(content: Uint8Array): boolean {
	const sample = content.subarray(0, Math.min(content.length, 1024));
	for (const byte of sample) {
		if (byte === 0) return false;
	}
	return true;
}

export function entryToText(entry: ZipEntry): string {
	if (entry.kind === 'binary') return '';
	return strFromU8(entry.content);
}

export function formatJson(text: string): string {
	try {
		return JSON.stringify(JSON.parse(text), null, 2);
	} catch {
		return text;
	}
}

export async function loadZip(target: string, basePath: string): Promise<Zip> {
	const id = `${target}`;
	const name = deriveName(target);

	if (!isValidTarget(target)) {
		return {
			id,
			target,
			name,
			status: 'error',
			error: 'Invalid target path.',
			entries: [],
			expanded: true
		};
	}

	const url = `${basePath}/ddp/${target}`;

	let response: Response;
	try {
		response = await fetch(url);
	} catch (err) {
		return {
			id,
			target,
			name,
			status: 'error',
			error: `Failed to fetch ${url}: ${(err as Error).message}`,
			entries: [],
			expanded: true
		};
	}

	if (!response.ok) {
		return {
			id,
			target,
			name,
			status: 'error',
			error: `Could not load ${target} (HTTP ${response.status}).`,
			entries: [],
			expanded: true
		};
	}

	const buffer = new Uint8Array(await response.arrayBuffer());
	let unzipped: Record<string, Uint8Array>;
	try {
		unzipped = unzipSync(buffer);
	} catch (err) {
		return {
			id,
			target,
			name,
			status: 'error',
			error: `Failed to unzip ${target}: ${(err as Error).message}`,
			entries: [],
			expanded: true
		};
	}

	const entries: ZipEntry[] = Object.entries(unzipped)
		.filter(([path]) => !path.endsWith('/'))
		.map(([path, content]) => ({
			path,
			name: path.split('/').pop() ?? path,
			size: content.byteLength,
			content,
			kind: classifyEntry(path, content)
		}))
		.sort((a, b) => a.path.localeCompare(b.path));

	return {
		id,
		target,
		name,
		status: 'ready',
		entries,
		expanded: true
	};
}
