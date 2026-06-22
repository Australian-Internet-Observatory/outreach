<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { unzipSync, zipSync, type Zippable } from 'fflate';

	type Role = 'donor' | 'researcher';
	type CodeEntry = {
		role: Role;
		ddps: string[];
	};

	const CODES: Record<string, CodeEntry> = {
		mercury: { role: 'donor', ddps: ['sample_1.zip'] },
		jupiter: { role: 'donor', ddps: ['sample_2.zip'] },
		helios: { role: 'researcher', ddps: ['sample_1.zip', 'sample_2.zip'] }
	};

	const AIO_VIEWER_URL = 'https://aio2024.cloud.edu.au/ddrs/chatgpt';
	const ROUTE_PATH = resolve('/scenarios/ddp/chatgpt');

	const sensitiveItems = [
		'gender',
		'sexual orientation',
		'age and year of study',
		'address and location (e.g. campus, local area)',
		'phone number',
		'university, course and major',
		'financial information (income, expenses, debts, etc.)',
		'relationship status and romantic interests',
		'family members and their circumstances',
		'friends and social circles',
		'health information (weight, height, medical conditions, etc.)',
		'mental health and emotional state',
		'addictions (e.g. gambling, substance use)',
		'hobbies and interests',
		'daily routines and schedule',
		'drafted messages and emails (e.g. to professors, to friends)'
	];

	const majorOptions = [
		'Computer Science',
		'Business',
		'Biology',
		'Psychology',
		'Engineering',
		'Arts and Humanities',
		'Other'
	];

	const ratingItems = [
		'to improve their writing skills (word choice, grammar, etc.)',
		"to explain concepts they don't understand",
		'to complete assignments and homework'
	];

	const samples = [
		{ id: 'sample-1', label: 'Sample 1', zip: 'sample_1.zip' },
		{ id: 'sample-2', label: 'Sample 2', zip: 'sample_2.zip' }
	] as const;

	const ratingLabels: Record<number, string> = {
		1: 'Almost never',
		2: 'Sometimes',
		3: 'Often'
	};

	let activeSample = $state<(typeof samples)[number]['id']>('sample-1');
	let ratingValues = $state<Record<string, number>>({
		'sample-1-0': 2,
		'sample-1-1': 2,
		'sample-1-2': 2,
		'sample-2-0': 2,
		'sample-2-1': 2,
		'sample-2-2': 2
	});
	let isCombining = $state(false);
	let combineError = $state<string | null>(null);

	const rawCode = $derived(page.url.searchParams.get('code') ?? '');
	const normalizedCode = $derived(rawCode.trim().toLowerCase());
	const activeEntry = $derived(normalizedCode ? CODES[normalizedCode] : undefined);
	const showError = $derived(normalizedCode.length > 0 && !activeEntry);
	const donorZip = $derived(activeEntry?.role === 'donor' ? activeEntry.ddps[0] : undefined);
	const previewQuery = $derived(
		activeEntry
			? activeEntry.ddps.map((d) => `target=${encodeURIComponent(`chatgpt/${d}`)}`).join('&')
			: ''
	);

	function ratingKey(sampleId: string, index: number) {
		return `${sampleId}-${index}`;
	}

	function updateRating(sampleId: string, index: number, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		ratingValues[ratingKey(sampleId, index)] = Number(input.value);
	}

	async function downloadCombinedDDPs() {
		if (!activeEntry || activeEntry.role !== 'researcher' || isCombining) return;
		isCombining = true;
		combineError = null;
		try {
			const fetched = await Promise.all(
				activeEntry.ddps.map(async (zip) => {
					const response = await fetch(`/ddp/chatgpt/${zip}`);
					if (!response.ok) {
						throw new Error(`Could not fetch ${zip} (HTTP ${response.status}).`);
					}
					const buffer = new Uint8Array(await response.arrayBuffer());
					return { zip, buffer };
				})
			);

			const folder: Zippable = {};
			for (const { zip, buffer } of fetched) {
				const unzipped = unzipSync(buffer);
				const name = zip.replace(/\.zip$/i, '');
				folder[name] = unzipped;
			}

			const combined = zipSync(folder, { level: 6 });
			const blob = new Blob([combined], { type: 'application/zip' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'chatgpt-ddps.zip';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (err) {
			combineError = (err as Error).message;
		} finally {
			isCombining = false;
		}
	}
</script>

<svelte:head>
	<title>ChatGPT workshop activity - Australian Internet Observatory</title>
	<meta
		name="description"
		content="Enter your access code to access your ChatGPT Data Download Package workshop materials."
	/>
</svelte:head>

{#snippet downloadIcon()}
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
{/snippet}

{#snippet externalIcon()}
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
		<path d="M15 3h6v6" />
		<path d="M10 14 21 3" />
		<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
	</svg>
{/snippet}

{#snippet previewIcon()}
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
		<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
		<circle cx="12" cy="12" r="3" />
	</svg>
{/snippet}

{#snippet spinnerIcon()}
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
{/snippet}

<div class="min-h-screen bg-background">
	<header class="border-b bg-background/95 border-border">
		<nav class="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4">
			<a
				href="https://internetobservatory.org.au/"
				class="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-foreground"
			>
				<img src={`${base}/AIO_logo.png`} alt="AIO Logo" class="h-8 w-auto shrink-0" />
				<span class="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900"
					>Australian Internet Observatory</span
				>
			</a>

			<div class="flex items-center gap-3">
				{#if activeEntry}
					<a
						href={ROUTE_PATH}
						class="no-print inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
					>
						Use a different code
					</a>
				{:else}
					<span class="hidden text-sm text-muted-foreground sm:inline"> ChatGPT Scenario </span>
				{/if}
			</div>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10">
		{#if !activeEntry}
			<section class="max-w-4xl mx-auto py-6 sm:py-10" aria-labelledby="code-heading">
				<div class="space-y-3">
					<h1 id="code-heading" class="text-3xl leading-tight font-semibold text-foreground">
						Enter your access code
					</h1>
					<p class="text-base leading-relaxed text-muted-foreground">
						Use the code shared by your facilitator to access your ChatGPT Data Download Package
						(DDP) and workshop materials.
					</p>
				</div>

				<form action={ROUTE_PATH} method="GET" class="mt-8 space-y-5" novalidate>
					<div class="space-y-2">
						<label for="code" class="text-sm font-medium text-foreground">Access code</label>
						<input
							id="code"
							name="code"
							type="text"
							value={rawCode}
							autocomplete="off"
							autocapitalize="none"
							spellcheck="false"
							aria-describedby="code-error"
							aria-invalid={showError ? 'true' : undefined}
							placeholder="Enter code"
							class="h-12 w-full rounded-md border bg-background px-3.5 text-base text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-[3px] focus-visible:outline-none {showError
								? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/50'
								: 'border-input focus-visible:border-ring focus-visible:ring-ring/50'}"
						/>
						{#if showError}
							<p id="code-error" role="alert" class="text-sm text-destructive">
								That code was not recognised.
							</p>
						{:else}
							<p id="code-error" class="sr-only">Enter the access code from your activity card.</p>
						{/if}
					</div>

					<button
						type="submit"
						class="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:w-auto"
					>
						Continue
					</button>
				</form>
			</section>
		{:else}
			<h1 class="sr-only">Your workshop materials</h1>
			<div class="mx-auto max-w-4xl space-y-8">
				<section class="aio-card rounded-xl border border-border bg-card p-6 shadow-sm">
					{#if activeEntry.role === 'researcher'}
						<h2 class="text-2xl leading-snug font-semibold text-foreground">Collected DDPs</h2>
					{:else if donorZip}
						<h2 class="text-2xl leading-snug font-semibold text-foreground">Your DDP</h2>
					{/if}

					<div
						class="mt-4 rounded-lg border border-border bg-muted p-4"
						role="note"
						aria-labelledby="fictitious-disclaimer-heading"
					>
						<p id="fictitious-disclaimer-heading" class="text-sm font-semibold text-foreground">
							All persons fictitious
						</p>
						<p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
							The conversations in these DDPs are synthesised, the characters are fictional, and any
							resemblance to real people or actual events is purely coincidental.
						</p>
					</div>

					{#if activeEntry.role === 'researcher'}
						<p class="mt-4 text-base leading-relaxed text-foreground">
							In this scenario, you are a researcher studying how university students use ChatGPT.
							You will analyse the two DDPs donated by anonymous participants to help answer the
							research question.
						</p>
					{:else if donorZip}
						<p class="mt-4 text-base leading-relaxed text-foreground">
							In this scenario, you are a participant who has donated your ChatGPT data to a
							research project. You will review your own DDP and identify any sensitive or personal
							information you may have shared with ChatGPT.
						</p>
					{/if}

					<div class="mt-4">
						<a
							href={`${resolve('/preview')}?${previewQuery}`}
							class="no-print inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
						>
							{@render previewIcon()}
							<span>Preview DDP{activeEntry.role === 'researcher' ? 's' : ''}</span>
						</a>
					</div>

					<p class="mt-4 text-sm leading-relaxed text-muted-foreground">
						You can download the DDP using the button below, and upload to our ChatGPT Viewer to
						help analysing it.
					</p>

					<div class="mt-4 flex flex-col gap-3 sm:flex-row">
						{#if activeEntry.role === 'researcher'}
							<button
								type="button"
								onclick={downloadCombinedDDPs}
								disabled={isCombining}
								class="no-print inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
							>
								{#if isCombining}
									{@render spinnerIcon()}
									<span>Preparing&hellip;</span>
								{:else}
									{@render downloadIcon()}
									<span>Download DDPs</span>
								{/if}
							</button>
						{:else if donorZip}
							<a
								href={`/ddp/chatgpt/${donorZip}`}
								download
								class="no-print inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
							>
								{@render downloadIcon()}
								<span>Download your DDP</span>
							</a>
						{/if}
						<a
							href={AIO_VIEWER_URL}
							target="_blank"
							rel="noopener noreferrer"
							class="no-print inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
						>
							{@render externalIcon()}
							<span>Open ChatGPT Viewer</span>
						</a>
					</div>

					{#if combineError}
						<p
							role="alert"
							class="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
						>
							{combineError}
						</p>
					{/if}
				</section>

				<section class="aio-card rounded-xl border border-border bg-card p-6 shadow-sm">
					<h2 class="text-2xl leading-snug font-semibold text-foreground">Mission</h2>

					{#if activeEntry.role === 'researcher'}
						<div class="mt-4 rounded-lg border border-border bg-muted p-4">
							<p class="text-sm font-medium text-muted-foreground">Research question</p>
							<p class="mt-1.5 text-base leading-relaxed font-medium text-foreground">
								How do university students use ChatGPT for their academic work?
							</p>
						</div>
						<p class="mt-4 text-base leading-relaxed text-foreground">
							You have access to two DDPs from two fictional participants. You do not know which
							participant each DDP belongs to.
						</p>

						<div class="mt-5">
							<div
								role="tablist"
								aria-label="Researcher questionnaires"
								class="flex gap-1 border-b border-border"
							>
								{#each samples as sample (sample.id)}
									<button
										type="button"
										id={`${sample.id}-tab`}
										role="tab"
										aria-selected={activeSample === sample.id}
										aria-controls={`${sample.id}-panel`}
										tabindex={activeSample === sample.id ? 0 : -1}
										onclick={() => (activeSample = sample.id)}
										class="inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none {activeSample ===
										sample.id
											? 'border-primary text-primary'
											: 'border-transparent text-muted-foreground hover:text-foreground'}"
									>
										{sample.label}
									</button>
								{/each}
							</div>

							<div class="mt-4">
								{#each samples as sample (sample.id)}
									<div
										id={`${sample.id}-panel`}
										role="tabpanel"
										aria-labelledby={`${sample.id}-tab`}
										tabindex="0"
										hidden={activeSample !== sample.id}
										class="rounded-lg border border-border p-4"
									>
										<div>
											<p class="text-sm font-medium text-foreground">1. What is their major?</p>
											<div class="mt-2 space-y-2">
												{#each majorOptions as option (option)}
													<label
														class="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-accent focus-within:ring-[3px] focus-within:ring-ring/50"
													>
														<input
															type="radio"
															name={`${sample.id}-major`}
															value={option}
															class="h-4 w-4 border-input text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
														/>
														<span>{option}</span>
													</label>
												{/each}
											</div>
										</div>

										<div class="mt-5">
											<p class="text-sm font-medium text-foreground">
												2. How do they use ChatGPT for academic purposes?
												<span class="text-muted-foreground">
													Rate each on a 1-3 scale (1 = almost never, 2 = sometimes, 3 = often).
												</span>
											</p>
											{#each ratingItems as item, index (item)}
												{@const key = ratingKey(sample.id, index)}
												<div class="mt-3">
													<p class="text-sm leading-relaxed text-foreground">{item}</p>
													<div class="mt-2 flex items-center gap-3">
														<input
															type="range"
															min="1"
															max="3"
															step="1"
															value={ratingValues[key]}
															name={`${sample.id}-rating-${index + 1}`}
															oninput={(event) => updateRating(sample.id, index, event)}
															class="w-full rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
														/>
														<span
															class="w-28 shrink-0 text-right text-sm font-medium text-foreground"
														>
															{ratingLabels[ratingValues[key]]}
														</span>
													</div>
												</div>
											{/each}
										</div>

										<div class="mt-5">
											<label
												for={`${sample.id}-notes`}
												class="text-sm leading-relaxed font-medium text-foreground"
											>
												3. Is there anything else in the conversations that interests you?
											</label>
											<textarea
												id={`${sample.id}-notes`}
												name={`${sample.id}-notes`}
												rows="3"
												placeholder="Type your notes here..."
												class="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
											></textarea>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<p class="mt-4 text-base leading-relaxed text-foreground">
							You will explore your own Data Download Package (DDP) from ChatGPT. It contains your
							past conversations with ChatGPT, exported as JSON and HTML.
						</p>
						<div class="mt-5 rounded-lg border border-border p-4">
							<p class="text-sm font-medium text-muted-foreground">What to look for</p>
							<p class="mt-2 text-base leading-relaxed text-foreground">
								Look through your DDP and make a note of any sensitive or personal information about
								you, for example:
							</p>
							<ul
								class="mt-3 grid list-disc gap-x-6 gap-y-2 pl-5 marker:text-muted-foreground sm:grid-cols-2"
							>
								{#each sensitiveItems as item (item)}
									<li class="text-base leading-relaxed text-foreground">{item}</li>
								{/each}
							</ul>
						</div>
						<div class="mt-5">
							<label for="donor-findings" class="text-sm font-medium text-foreground">
								Your findings
							</label>
							<textarea
								id="donor-findings"
								name="donor-findings"
								rows="4"
								placeholder="Note down anything sensitive or personal you find in your DDP..."
								class="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
							></textarea>
						</div>
					{/if}
				</section>
			</div>
		{/if}
	</main>
</div>
