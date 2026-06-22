import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

function toBasePath(value: string | undefined): '' | `/${string}` | undefined {
	if (value === '') return '';
	if (value == null) return undefined;

	return value.startsWith('/')
		? (value as `/${string}`)
		: (`/${value}` as `/${string}`);
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			paths: {
				base: toBasePath(process.argv.includes('dev') ? '' : process.env.BASE_PATH)
			}
		})
	]
});
