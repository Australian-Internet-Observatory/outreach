<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		entryToText,
		formatJson,
		isValidTarget,
		loadZip,
		type Zip,
		type ZipEntry
	} from '$lib/preview/zip';
	import { onMount } from 'svelte';

	type SelectedFile = {
		zipId: string;
		zipName: string;
		path: string;
		kind: 'html' | 'json' | 'text' | 'binary' | 'unknown';
		content: string;
	};

	const basePath = base;
	const chatgptHref = resolve('/scenarios/ddp/chatgpt');

	let targets = $derived(page.url.searchParams.getAll('target').filter(Boolean));
	let zips = $state<Zip[]>([]);
	let selected = $state<SelectedFile | null>(null);
	let sidebarOpen = $state(false);
	let loadToken = $state(0);

	const isLoading = $derived(zips.some((z) => z.status === 'loading'));
	const hasError = $derived(zips.some((z) => z.status === 'error'));
	const allLoaded = $derived(
		zips.length > 0 && zips.every((z) => z.status === 'ready' || z.status === 'error')
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

	function toggleZip(zip: Zip) {
		zips = zips.map((z) => (z.id === zip.id ? { ...z, expanded: !z.expanded } : z));
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
		if (kind === 'text') return 'txt';
		return 'bin';
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<svelte:head>
	<title>DDP Preview - Australian Internet Observatory</title>
	<meta name="description" content="Preview the contents of Data Download Packages." />
</svelte:head>

<div class="flex min-h-screen flex-col bg-background text-foreground">
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

	<main class="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:py-8">
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
												{#each zip.entries as entry (entry.path)}
													{@const isActive =
														selected?.zipId === zip.id && selected?.path === entry.path}
													<button
														type="button"
														onclick={() => selectEntry(zip, entry)}
														aria-current={isActive ? 'true' : undefined}
														class="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none {isActive
															? 'bg-accent text-accent-foreground'
															: 'text-foreground hover:bg-accent/60'}"
													>
														<span
															class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
														>
															{entryIcon(entry.kind)}
														</span>
														<span class="truncate">{entry.name}</span>
														<span
															class="ml-auto text-xs text-muted-foreground opacity-0 group-hover:opacity-100"
														>
															{formatSize(entry.size)}
														</span>
													</button>
												{/each}
											{/if}
										</div>
									{/if}
								</section>
							{/each}
						</div>
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
							class="m-0 overflow-auto bg-muted/30 p-4 font-mono text-xs whitespace-pre-wrap break-words text-foreground sm:text-sm">{selected.content}</pre>
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
