import { readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ddpDir = join(projectRoot, 'static', 'ddp');
const assetsFile = join(projectRoot, 'src', 'routes', 'preview', 'assets.ts');

async function collectZipFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const results: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...(await collectZipFiles(fullPath)));
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
			results.push(fullPath);
		}
	}
	return results;
}

function escapeStr(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function main(): Promise<void> {
	const files = await collectZipFiles(ddpDir);
	const targets = files
		.map((f) => relative(ddpDir, f).split(sep).join('/'))
		.sort((a, b) => a.localeCompare(b));

	const lines = targets.map((t) => `\t'${escapeStr(t)}'`).join(',\n');
	const content = `export const FILES: string[] = [\n${lines}\n];\n`;

	await writeFile(assetsFile, content, 'utf8');
	console.log(`Wrote ${targets.length} target(s) to ${relative(projectRoot, assetsFile)}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
