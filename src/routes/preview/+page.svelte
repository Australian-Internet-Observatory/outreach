<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { zipSync, type Zippable } from 'fflate';
	import {
		buildTree,
		entryToText,
		formatJson,
		isValidTarget,
		loadZip,
		type TreeNode,
		type Zip,
		type ZipEntry
	} from '$lib/preview/zip';
	import {
		formatOriginalTimestamp,
		formatTimestamp,
		tokenizeJson,
		type JsonToken
	} from '$lib/preview/json-tokens';
	import { parseCsv } from '$lib/preview/csv';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import * as HoverCard from '$lib/components/ui/hover-card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';

	type SelectedFile = {
		zipId: string;
		zipName: string;
		path: string;
		kind: 'html' | 'json' | 'csv' | 'text' | 'binary' | 'unknown';
		content: string;
	};

	const basePath = base;
	const chatgptHref = resolve('/scenarios/ddp/chatgpt');

	let targets = $derived(page.url.searchParams.getAll('target').filter(Boolean));
	let zips = $state<Zip[]>([]);
	let selected = $state<SelectedFile | null>(null);
	let sidebarOpen = $state(false);
	let loadToken = $state(0);
	let hoverToken = $state<{ original: string; human: string; x: number; y: number } | null>(null);
	let isDownloading = $state(false);
	let downloadError = $state<string | null>(null);
	let expandedFolders = new SvelteSet<string>();

	const isLoading = $derived(zips.some((z) => z.status === 'loading'));
	const hasError = $derived(zips.some((z) => z.status === 'error'));
	const allLoaded = $derived(
		zips.length > 0 && zips.every((z) => z.status === 'ready' || z.status === 'error')
	);
	const canDownload = $derived(zips.some((z) => z.status === 'ready' && z.entries.length > 0));
	const trees = $derived(
		new Map(zips.map((z) => [z.id, z.status === 'ready' ? buildTree(z.entries) : []]))
	);

	function deriveName(target: string): string {
		return (
			target
				.split('/')
				.pop()
				?.replace(/\.zip$/i, '') ?? target
		);
	}

	onMount(() => {
		const currentTargets = targets;
		const token = ++loadToken;
		selected = null;

		const current = new Map(zips.map((z) => [z.target, z]));
		const next: Zip[] = [];

		for (const target of currentTargets) {
			const existing = current.get(target);
			if (existing) {
				next.push(existing);
			} else if (isValidTarget(target)) {
				next.push({
					id: target,
					target,
					name: deriveName(target),
					status: 'loading',
					entries: [],
					expanded: true
				});
			} else {
				next.push({
					id: target,
					target,
					name: deriveName(target),
					status: 'error',
					error: 'Invalid target path.',
					entries: [],
					expanded: true
				});
			}
		}

		zips = next;

		if (currentTargets.length === 0) return;

		for (const target of currentTargets) {
			if (!isValidTarget(target)) continue;
			loadZip(target, basePath).then((loaded) => {
				if (token !== loadToken) return;
				zips = zips.map((z) => (z.target === loaded.target ? loaded : z));
				autoSelectFirstFile();
			});
		}
	});

	function autoSelectFirstFile() {
		if (selected) return;
		for (const zip of zips) {
			if (zip.status !== 'ready' || zip.entries.length === 0) continue;
			const first = zip.entries[0];
			selectEntry(zip, first);
			return;
		}
	}

	function selectEntry(zip: Zip, entry: ZipEntry) {
		const content = entry.kind === 'json' ? formatJson(entryToText(entry)) : entryToText(entry);
		selected = {
			zipId: zip.id,
			zipName: zip.name,
			path: entry.path,
			kind: entry.kind,
			content
		};
		if (typeof window !== 'undefined' && window.innerWidth < 1024) {
			sidebarOpen = false;
		}
	}

	function isEntryActive(zipId: string, entry: ZipEntry): boolean {
		return selected?.zipId === zipId && selected?.path === entry.path;
	}

	function toggleZip(zip: Zip) {
		zips = zips.map((z) => (z.id === zip.id ? { ...z, expanded: !z.expanded } : z));
	}

	function folderKey(zipId: string, folderPath: string): string {
		return `${zipId}::${folderPath}`;
	}

	function isFolderExpanded(zipId: string, folderPath: string): boolean {
		return expandedFolders.has(folderKey(zipId, folderPath));
	}

	function toggleFolder(zipId: string, folderPath: string) {
		const key = folderKey(zipId, folderPath);
		if (expandedFolders.has(key)) {
			expandedFolders.delete(key);
		} else {
			expandedFolders.add(key);
		}
	}

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function closeSidebar() {
		sidebarOpen = false;
	}

	function entryIcon(kind: ZipEntry['kind']): string {
		if (kind === 'html') return 'html';
		if (kind === 'json') return 'json';
		if (kind === 'csv') return 'csv';
		if (kind === 'text') return 'txt';
		return 'bin';
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	const selectedTokens = $derived(
		selected?.kind === 'json' ? tokenizeJson(selected.content) : null
	);

	const CSV_ROW_LIMIT = 1000;
	const selectedCsv = $derived(
		selected?.kind === 'csv'
			? parseCsv(selected.content, selected.path.split('.').pop() ?? '')
			: null
	);
	const csvColumnCount = $derived(
		selectedCsv
			? selectedCsv.rows.reduce((max, r) => Math.max(max, r.length), selectedCsv.headers.length)
			: 0
	);

	function range(n: number): number[] {
		const out: number[] = [];
		for (let i = 0; i < n; i++) out.push(i);
		return out;
	}

	function showTimestamp(target: HTMLElement, token: JsonToken) {
		if (!token.isTimestamp || token.timestampSeconds === undefined) return;
		const rect = target.getBoundingClientRect();
		hoverToken = {
			original: formatOriginalTimestamp(token.value),
			human: formatTimestamp(token.timestampSeconds),
			x: rect.left + rect.width / 2,
			y: rect.top
		};
	}

	function onTokenEnter(event: MouseEvent | FocusEvent, token: JsonToken) {
		showTimestamp(event.currentTarget as HTMLElement, token);
	}

	function onTokenMove(event: MouseEvent) {
		if (!hoverToken) return;
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		hoverToken = {
			...hoverToken,
			x: rect.left + rect.width / 2,
			y: rect.top
		};
	}

	function hideTimestamp() {
		hoverToken = null;
	}

	async function downloadAsZip() {
		if (!canDownload || isDownloading) return;
		isDownloading = true;
		downloadError = null;
		try {
			const folder: Zippable = {};
			for (const zip of zips) {
				if (zip.status !== 'ready' || zip.entries.length === 0) continue;
				const entries: Zippable = {};
				for (const entry of zip.entries) {
					entries[entry.path] = entry.content;
				}
				folder[zip.name] = entries;
			}
			const combined = zipSync(folder, { level: 6 });
			const blob = new Blob([combined], { type: 'application/zip' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${derivedDownloadName()}.zip`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (err) {
			downloadError = (err as Error).message;
		} finally {
			isDownloading = false;
		}
	}

	function derivedDownloadName(): string {
		const names = targets.map(deriveName).filter(Boolean);
		if (names.length === 0) return 'ddp-preview';
		return names.join('-');
	}
</script>

<svelte:head>
	<title>DDP Preview - Australian Internet Observatory</title>
	<meta name="description" content="Preview the contents of Data Download Packages." />
</svelte:head>

<div class="flex h-screen flex-col overflow-hidden bg-background text-foreground">
	<header class="border-border/80 border-b bg-background/95 backdrop-blur">
		<nav class="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4">
			<a
				href={chatgptHref}
				class="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-foreground"
			>
				<img src={`${basePath}/AIO_logo.png`} alt="AIO Logo" class="h-8 w-auto shrink-0" />
				<span class="flex items-center gap-2 text-lg font-semibold tracking-tight">
					Australian Internet Observatory
				</span>
			</a>
			<div class="flex items-center gap-2">
				<span
					class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
				>
					DDP Preview
				</span>
			</div>
		</nav>
	</header>

	<main
		class="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-6 sm:py-8"
	>
		<div class="mb-4 flex flex-wrap items-center gap-2 lg:hidden">
			<button
				type="button"
				onclick={toggleSidebar}
				aria-expanded={sidebarOpen}
				aria-controls="preview-sidebar"
				class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<line x1="3" y1="6" x2="21" y2="6" />
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="3" y1="18" x2="21" y2="18" />
				</svg>
				<span>{sidebarOpen ? 'Hide' : 'Show'} files</span>
			</button>
			{#if selected}
				<span class="truncate text-sm text-muted-foreground">
					{selected.zipName} / {selected.path}
				</span>
			{/if}
		</div>

		<div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
			<aside
				id="preview-sidebar"
				class="min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:flex lg:flex-col"
				class:hidden={!sidebarOpen}
				class:flex={sidebarOpen}
				class:flex-col={sidebarOpen}
				aria-label="File tree"
			>
				<div class="flex items-center justify-between border-b border-border px-4 py-3 lg:py-4">
					<h2 class="text-sm font-semibold tracking-tight">Files</h2>
					<button
						type="button"
						onclick={closeSidebar}
						class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:hidden"
						aria-label="Hide file tree"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				<div class="flex-1 overflow-y-auto p-2">
					{#if targets.length === 0}
						<div class="px-2 py-6 text-center text-sm text-muted-foreground">
							<p class="font-medium text-foreground">No targets provided</p>
							<p class="mt-1">
								Add a <code class="rounded bg-muted px-1 py-0.5 text-xs">target</code> query parameter
								to preview a zip file.
							</p>
							<p class="mt-3 text-xs">
								Example:
								<code class="block break-all rounded bg-muted px-2 py-1 text-left text-xs">
									?target=chatgpt/sample_1.zip
								</code>
							</p>
						</div>
					{:else if isLoading && zips.every((z) => z.status === 'loading')}
						<div class="space-y-3 p-2">
							{#each zips as zip (zip.id)}
								<div class="animate-pulse space-y-2">
									<div class="h-4 w-2/3 rounded bg-muted"></div>
									<div class="h-3 w-1/2 rounded bg-muted"></div>
								</div>
							{/each}
						</div>
					{:else}
						{#snippet treeNode(zip: Zip, node: TreeNode, depth: number)}
							{#if node.type === 'folder'}
								<button
									type="button"
									onclick={() => toggleFolder(zip.id, node.path)}
									aria-expanded={isFolderExpanded(zip.id, node.path)}
									class="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
									style="padding-left: {depth * 6 + 2}px"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
										class="shrink-0 text-muted-foreground transition-transform"
										class:rotate-90={isFolderExpanded(zip.id, node.path)}
									>
										<polyline points="9 18 15 12 9 6" />
									</svg>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
										class="shrink-0 text-muted-foreground"
									>
										<path
											d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
										/>
									</svg>
									<HoverCard.Root openDelay={400} closeDelay={150}>
										<HoverCard.Trigger>
											{#snippet child({ props })}
												<span {...props} class="truncate">{node.name}</span>
											{/snippet}
										</HoverCard.Trigger>
										<HoverCard.Content class="w-max max-w-xs p-2 text-xs" side="top">
											{node.name}
										</HoverCard.Content>
									</HoverCard.Root>
								</button>
								{#if isFolderExpanded(zip.id, node.path)}
									{#each node.children as childNode (childNode.path)}
										{@render treeNode(zip, childNode, depth + 1)}
									{/each}
								{/if}
							{:else}
								<button
									type="button"
									onclick={() => selectEntry(zip, node.entry)}
									aria-current={isEntryActive(zip.id, node.entry) ? 'true' : undefined}
									class="group flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none {isEntryActive(
										zip.id,
										node.entry
									)
										? 'bg-accent text-accent-foreground'
										: 'text-foreground hover:bg-accent/60'}"
									style="padding-left: {depth * 6 + 2}px"
								>
									<span class="w-3.5 shrink-0" aria-hidden="true"></span>
									<span
										class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
									>
										{entryIcon(node.entry.kind)}
									</span>
									<HoverCard.Root openDelay={400} closeDelay={150}>
										<HoverCard.Trigger>
											{#snippet child({ props })}
												<span {...props} class="truncate">{node.entry.name}</span>
											{/snippet}
										</HoverCard.Trigger>
										<HoverCard.Content class="w-max max-w-xs p-2 text-xs" side="top">
											{node.entry.name}
										</HoverCard.Content>
									</HoverCard.Root>
									<span
										class="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground opacity-0 group-hover:opacity-100"
									>
										{formatSize(node.entry.size)}
									</span>
								</button>
							{/if}
						{/snippet}
						<div class="space-y-1">
							{#each zips as zip (zip.id)}
								<section class="rounded-lg">
									<button
										type="button"
										onclick={() => toggleZip(zip)}
										aria-expanded={zip.expanded}
										class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
											class="shrink-0 text-muted-foreground transition-transform"
											class:rotate-90={zip.expanded}
										>
											<polyline points="9 18 15 12 9 6" />
										</svg>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
											class="text-muted-foreground"
										>
											<path
												d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
											/>
										</svg>
										<span class="truncate">{zip.name}</span>
										<span class="ml-auto text-xs font-normal text-muted-foreground">
											{zip.target}
										</span>
									</button>
									{#if zip.expanded}
										<div class="mt-0.5 ml-6 space-y-0.5 border-l border-border pl-2">
											{#if zip.status === 'loading'}
												<div
													class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground"
												>
													<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
													></span>
													Loading&hellip;
												</div>
											{:else if zip.status === 'error'}
												<p
													class="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
												>
													{zip.error ?? 'Failed to load.'}
												</p>
											{:else if zip.entries.length === 0}
												<p class="rounded-md px-2 py-1.5 text-xs text-muted-foreground">
													No files in this archive.
												</p>
											{:else}
												{#each trees.get(zip.id) ?? [] as node (node.path)}
													{@render treeNode(zip, node, 0)}
												{/each}
											{/if}
										</div>
									{/if}
								</section>
							{/each}
						</div>
					{/if}
				</div>
				<div class="border-t border-border p-3 lg:p-4">
					<button
						type="button"
						onclick={downloadAsZip}
						disabled={!canDownload || isDownloading}
						aria-label="Download as zip"
						class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
					>
						{#if isDownloading}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
								class="animate-spin"
							>
								<path d="M21 12a9 9 0 1 1-6.219-8.56" />
							</svg>
							<span>Preparing&hellip;</span>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="7 10 12 15 17 10" />
								<line x1="12" y1="15" x2="12" y2="3" />
							</svg>
							<span>Download</span>
						{/if}
					</button>
					{#if downloadError}
						<p role="alert" class="mt-2 text-xs text-destructive">
							{downloadError}
						</p>
					{/if}
				</div>
			</aside>

			<section
				class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
				aria-label="File content"
			>
				<div class="flex items-center justify-between border-b border-border px-4 py-3 lg:py-4">
					<div class="min-w-0 flex-1">
						{#if selected}
							<h2 class="truncate text-sm font-semibold tracking-tight">
								{selected.zipName}
								<span class="font-normal text-muted-foreground"> / {selected.path}</span>
							</h2>
						{:else if targets.length === 0}
							<h2 class="text-sm font-semibold tracking-tight">No file selected</h2>
						{:else if isLoading}
							<h2 class="text-sm font-semibold tracking-tight">Loading&hellip;</h2>
						{:else if hasError && !allLoaded}
							<h2 class="text-sm font-semibold tracking-tight">Loading&hellip;</h2>
						{:else if zips.every((z) => z.entries.length === 0)}
							<h2 class="text-sm font-semibold tracking-tight">No files available</h2>
						{:else}
							<h2 class="text-sm font-semibold tracking-tight">Select a file</h2>
						{/if}
					</div>
				</div>

				<div class="min-h-0 flex-1 overflow-auto">
					{#if !selected}
						<div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
							{#if targets.length === 0}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="40"
									height="40"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
									class="text-muted-foreground/60"
								>
									<path
										d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
									/>
								</svg>
								<p class="text-sm text-muted-foreground">
									Provide a <code class="rounded bg-muted px-1 py-0.5">target</code> query parameter to
									preview a zip file.
								</p>
							{:else if isLoading}
								<p class="text-sm text-muted-foreground">Loading zip contents&hellip;</p>
							{:else}
								<p class="text-sm text-muted-foreground">
									Select a file from the tree to preview it.
								</p>
							{/if}
						</div>
					{:else if selected.kind === 'html'}
						<iframe
							title={`${selected.zipName} - ${selected.path}`}
							srcdoc={selected.content}
							sandbox="allow-scripts"
							class="h-full min-h-[60vh] w-full border-0 bg-white"
						></iframe>
					{:else if selected.kind === 'json'}
						<pre
							class="aio-json m-0 h-full min-h-0 overflow-auto bg-muted/30 p-4 font-mono text-xs whitespace-pre-wrap break-words text-foreground sm:text-sm">{#if selectedTokens}{#each selectedTokens as token, i (i)}{#if token.type === 'key'}<span
											class="aio-tok aio-tok-key">{token.value}</span
										>{:else if token.type === 'string'}<span class="aio-tok aio-tok-string"
											>{token.value}</span
										>{:else if token.type === 'number'}{#if token.isTimestamp && token.timestampSeconds !== undefined}<span
												class="aio-tok aio-tok-time"
												role="button"
												tabindex="0"
												aria-label={`Timestamp ${formatTimestamp(token.timestampSeconds)} (${formatOriginalTimestamp(token.value)})`}
												onmouseenter={(e) => onTokenEnter(e, token)}
												onmousemove={onTokenMove}
												onmouseleave={hideTimestamp}
												onfocus={(e) => onTokenEnter(e, token)}
												onblur={hideTimestamp}>{formatTimestamp(token.timestampSeconds)}</span
											>{:else}<span class="aio-tok aio-tok-number">{token.value}</span
											>{/if}{:else if token.type === 'boolean'}<span class="aio-tok aio-tok-bool"
											>{token.value}</span
										>{:else if token.type === 'null'}<span class="aio-tok aio-tok-null"
											>{token.value}</span
										>{:else if token.type === 'punct'}<span class="aio-tok aio-tok-punct"
											>{token.value}</span
										>{:else}{token.value}{/if}{/each}{/if}</pre>
					{:else if selected.kind === 'csv'}
						{#if selectedCsv && (selectedCsv.headers.length > 0 || selectedCsv.rows.length > 0)}
							<div class="flex h-full min-h-0 flex-col">
								<div
									class="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground"
								>
									<span>
										{selectedCsv.rows.length.toLocaleString()} row{selectedCsv.rows.length === 1
											? ''
											: 's'}
										&middot; {csvColumnCount} column{csvColumnCount === 1 ? '' : 's'}
									</span>
									{#if selectedCsv.rows.length > CSV_ROW_LIMIT}
										<span class="text-muted-foreground">
											Showing first {CSV_ROW_LIMIT.toLocaleString()} rows
										</span>
									{/if}
								</div>
								<div class="min-h-0 flex-1 overflow-auto">
									<Table.Root class="w-full border-collapse">
										<Table.Header class="sticky top-0 z-10 bg-muted/80 backdrop-blur">
											<Table.Row>
												<Table.Head
													class="w-10 text-center text-xs font-semibold text-muted-foreground"
													>#</Table.Head
												>
												{#each range(csvColumnCount) as i (i)}
													<Table.Head class="whitespace-nowrap text-xs font-semibold">
														{selectedCsv.headers[i] ?? ''}
													</Table.Head>
												{/each}
											</Table.Row>
										</Table.Header>
										<Table.Body>
											{#each selectedCsv.rows.slice(0, CSV_ROW_LIMIT) as row, rowIndex (rowIndex)}
												<Table.Row>
													<Table.Cell
														class="w-10 text-center text-xs text-muted-foreground tabular-nums"
													>
														{rowIndex + 1}
													</Table.Cell>
													{#each range(csvColumnCount) as i (i)}
														<Table.Cell class="whitespace-nowrap text-xs">
															{row[i] ?? ''}
														</Table.Cell>
													{/each}
												</Table.Row>
											{/each}
										</Table.Body>
									</Table.Root>
								</div>
							</div>
						{:else}
							<div class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
								<p class="text-sm font-medium text-foreground">Empty CSV file</p>
								<p class="text-xs text-muted-foreground">No rows to display.</p>
							</div>
						{/if}
					{:else if selected.kind === 'text'}
						<pre
							class="m-0 overflow-auto bg-muted/30 p-4 font-mono text-xs whitespace-pre-wrap break-words text-foreground sm:text-sm">{selected.content}</pre>
					{:else}
						<div class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
							<p class="text-sm font-medium text-foreground">Preview not available</p>
							<p class="text-xs text-muted-foreground">
								This file type cannot be previewed in the browser.
							</p>
						</div>
					{/if}
				</div>
			</section>
		</div>
	</main>
</div>

{#if hoverToken}
	<div class="aio-popover" role="tooltip" style="left: {hoverToken.x}px; top: {hoverToken.y}px;">
		<div class="aio-popover-human">{hoverToken.human}</div>
		<div class="aio-popover-original">Original: <code>{hoverToken.original}</code></div>
	</div>
{/if}

<style>
	:global(.aio-json .aio-tok) {
		font-family: inherit;
	}
	:global(.aio-json .aio-tok-key) {
		color: oklch(0.55 0.15 250);
	}
	:global(.aio-json .aio-tok-string) {
		color: oklch(0.55 0.14 145);
	}
	:global(.aio-json .aio-tok-number) {
		color: oklch(0.6 0.16 25);
	}
	:global(.aio-json .aio-tok-bool) {
		color: oklch(0.55 0.18 295);
		font-weight: 600;
	}
	:global(.aio-json .aio-tok-null) {
		color: oklch(0.55 0.05 250);
		font-style: italic;
	}
	:global(.aio-json .aio-tok-punct) {
		color: oklch(0.5 0.02 250);
	}
	:global(.aio-json .aio-tok-time) {
		color: oklch(0.5 0.16 25);
		background-color: oklch(0.96 0.04 25);
		border-bottom: 1px dashed oklch(0.7 0.12 25);
		padding: 0 2px;
		border-radius: 2px;
		cursor: help;
		transition: background-color 0.15s ease;
	}
	:global(.aio-json .aio-tok-time:hover),
	:global(.aio-json .aio-tok-time:focus) {
		background-color: oklch(0.92 0.06 25);
		outline: none;
	}
	:global(.dark) :global(.aio-json .aio-tok-key) {
		color: oklch(0.78 0.13 250);
	}
	:global(.dark) :global(.aio-json .aio-tok-string) {
		color: oklch(0.78 0.12 145);
	}
	:global(.dark) :global(.aio-json .aio-tok-number) {
		color: oklch(0.82 0.13 25);
	}
	:global(.dark) :global(.aio-json .aio-tok-bool) {
		color: oklch(0.8 0.15 295);
	}
	:global(.dark) :global(.aio-json .aio-tok-null) {
		color: oklch(0.75 0.04 250);
	}
	:global(.dark) :global(.aio-json .aio-tok-punct) {
		color: oklch(0.65 0.02 250);
	}
	:global(.dark) :global(.aio-json .aio-tok-time) {
		color: oklch(0.85 0.13 25);
		background-color: oklch(0.28 0.05 25);
		border-bottom-color: oklch(0.5 0.12 25);
	}
	:global(.dark) :global(.aio-json .aio-tok-time:hover),
	:global(.dark) :global(.aio-json .aio-tok-time:focus) {
		background-color: oklch(0.34 0.07 25);
	}

	.aio-popover {
		position: fixed;
		z-index: 50;
		transform: translate(-50%, calc(-100% - 10px));
		max-width: 320px;
		min-width: 180px;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background-color: oklch(0.18 0.02 250);
		color: oklch(0.96 0.005 250);
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.15),
			0 8px 24px -4px rgb(0 0 0 / 0.2);
		font-size: 0.75rem;
		line-height: 1.35;
		pointer-events: none;
		animation: aio-popover-in 0.12s ease-out;
	}
	.aio-popover::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -5px;
		transform: translateX(-50%) rotate(45deg);
		width: 10px;
		height: 10px;
		background-color: oklch(0.18 0.02 250);
	}
	.aio-popover-human {
		font-weight: 600;
		margin-bottom: 0.125rem;
	}
	.aio-popover-original {
		opacity: 0.7;
		font-size: 0.6875rem;
	}
	.aio-popover code {
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
		font-size: 0.6875rem;
	}

	@keyframes aio-popover-in {
		from {
			opacity: 0;
			transform: translate(-50%, calc(-100% - 4px));
		}
		to {
			opacity: 1;
			transform: translate(-50%, calc(-100% - 10px));
		}
	}
</style>
