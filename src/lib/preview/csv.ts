export type CsvData = {
	headers: string[];
	rows: string[][];
};

const CSV_DELIMITERS = new Set(['csv']);
const TSV_DELIMITERS = new Set(['tsv']);

function delimiterForExt(ext: string): ',' | '\t' | ';' | '|' {
	if (TSV_DELIMITERS.has(ext)) return '\t';
	if (CSV_DELIMITERS.has(ext)) return ',';
	return ',';
}

function sniffDelimiter(text: string, fallback: string): string {
	const candidates = [',', '\t', ';', '|'];
	const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? '';
	let best = fallback;
	let bestScore = -1;
	for (const delim of candidates) {
		const count = countUnquoted(firstLine, delim);
		if (count > bestScore) {
			bestScore = count;
			best = delim;
		}
	}
	return best;
}

function countUnquoted(line: string, delim: string): number {
	let count = 0;
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				i++;
				continue;
			}
			inQuotes = !inQuotes;
		} else if (ch === delim && !inQuotes) {
			count++;
		}
	}
	return count;
}

export function parseCsv(text: string, ext: string): CsvData {
	const fallback = delimiterForExt(ext.toLowerCase());
	const delimiter = sniffDelimiter(text, fallback);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;

	while (i < text.length) {
		const ch = text[i];

		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += ch;
			i++;
			continue;
		}

		if (ch === '"') {
			inQuotes = true;
			i++;
			continue;
		}

		if (ch === delimiter) {
			row.push(field);
			field = '';
			i++;
			continue;
		}

		if (ch === '\r') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			if (text[i + 1] === '\n') i += 2;
			else i += 1;
			continue;
		}

		if (ch === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			i++;
			continue;
		}

		field += ch;
		i++;
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	while (rows.length > 0) {
		const last = rows[rows.length - 1];
		if (last.length === 1 && last[0] === '') {
			rows.pop();
		} else {
			break;
		}
	}

	const headers = rows.shift() ?? [];
	return { headers, rows };
}
