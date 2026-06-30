import { strFromU8, unzipSync } from 'fflate';

export type EntryKind = 'html' | 'json' | 'csv' | 'text' | 'binary' | 'unknown';

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

export type FolderNode = {
	type: 'folder';
	name: string;
	path: string;
	children: TreeNode[];
};

export type FileNode = {
	type: 'file';
	name: string;
	path: string;
	entry: ZipEntry;
};

export type TreeNode = FolderNode | FileNode;

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'log', 'xml', 'yaml', 'yml']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);
const JSON_EXTENSIONS = new Set(['json']);
const CSV_EXTENSIONS = new Set(['csv', 'tsv']);

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
	if (CSV_EXTENSIONS.has(ext)) return 'csv';
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

export function buildTree(entries: ZipEntry[]): TreeNode[] {
	const root: FolderNode = { type: 'folder', name: '', path: '', children: [] };

	for (const entry of entries) {
		const parts = entry.path.split('/').filter(Boolean);
		let node = root;
		let currentPath = '';
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const isLast = i === parts.length - 1;
			if (isLast) {
				node.children.push({
					type: 'file',
					name: part,
					path: entry.path,
					entry
				});
			} else {
				const existing = node.children.find(
					(c): c is FolderNode => c.type === 'folder' && c.name === part
				);
				if (existing) {
					node = existing;
				} else {
					const folder: FolderNode = {
						type: 'folder',
						name: part,
						path: currentPath,
						children: []
					};
					node.children.push(folder);
					node = folder;
				}
			}
		}
	}

	sortTree(root.children);
	return root.children;
}

function sortTree(nodes: TreeNode[]): void {
	nodes.sort((a, b) => {
		if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	for (const node of nodes) {
		if (node.type === 'folder') sortTree(node.children);
	}
}
