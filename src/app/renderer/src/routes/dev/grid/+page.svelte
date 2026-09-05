<div class="page grid-dev">
	<!-- Hero -->
	<div class="hero">
		<div class="hero-eyebrow">
			<span class="hero-version">v3.1</span>
			<span class="hero-sep">·</span>
			<span>MIT License</span>
			<span class="hero-sep">·</span>
			<span>by Magic</span>
		</div>
		<h1>GRID</h1>
		<p class="hero-tagline">
			A lightweight 12-column flex-grid system for modern responsive layouts
		</p>
		<div class="hero-stats">
			<div class="stat">
				<span class="stat-value">12</span>
				<span class="stat-label">Columns</span>
			</div>
			<div class="stat">
				<span class="stat-value">6</span>
				<span class="stat-label">Breakpoints</span>
			</div>
			<div class="stat">
				<span class="stat-value">Mobile</span>
				<span class="stat-label">First</span>
			</div>
			<div class="stat">
				<span class="stat-value">SCSS</span>
				<span class="stat-label">Mixins</span>
			</div>
		</div>
	</div>

	<!-- Getting Started -->
	<section>
		<h2>Getting Started</h2>
		<p class="muted-color text-small margin-bottom-2">
			The grid is globally available. Wrap columns in a <code>.row</code> and
			size them with <code>.col-&#123;bp&#125;-&#123;span&#125;</code> classes.
		</p>
		<pre class="code">&lt;div class="<span class="hl">row</span>"&gt;
  &lt;div class="<span class="hl">col-xxs-4</span>"&gt;Column 1&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-4</span>"&gt;Column 2&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-4</span>"&gt;Column 3&lt;/div&gt;
&lt;/div&gt;</pre>
	</section>

	<!-- Breakpoints Reference -->
	<section>
		<h2>Breakpoints</h2>
		<p class="muted-color text-small margin-bottom-2">
			All column classes are mobile-first (min-width). SCSS mixins use
			desktop-first (max-width).
		</p>
		<div class="ref-table">
			<div class="ref-row ref-header">
				<span>Name</span><span>Class prefix</span><span>Min-width</span><span
					>Pixels</span
				>
			</div>
			<div class="ref-row">
				<span>xxs</span><span>.col-xxs-*</span><span>0</span><span>0px</span>
			</div>
			<div class="ref-row">
				<span>xs</span><span>.col-xs-*</span><span>20rem</span><span>320px</span
				>
			</div>
			<div class="ref-row">
				<span>sm</span><span>.col-sm-*</span><span>30rem</span><span>480px</span
				>
			</div>
			<div class="ref-row">
				<span>md</span><span>.col-md-*</span><span>40rem</span><span>640px</span
				>
			</div>
			<div class="ref-row">
				<span>lg</span><span>.col-lg-*</span><span>64rem</span><span
					>1024px</span
				>
			</div>
			<div class="ref-row">
				<span>xl</span><span>.col-xl-*</span><span>80rem</span><span
					>1280px</span
				>
			</div>
		</div>
	</section>

	<!-- Basic Columns -->
	<section>
		<h2>Basic Columns</h2>
		<p class="muted-color text-small margin-bottom-2">
			.col-xxs-1 through .col-xxs-12 — columns span a fraction of the 12-column
			grid.
		</p>
		<div class="row">
			<div class="col-xxs-12"><div class="box">12</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-6"><div class="box">6</div></div>
			<div class="col-xxs-6"><div class="box">6</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-4"><div class="box">4</div></div>
			<div class="col-xxs-4"><div class="box">4</div></div>
			<div class="col-xxs-4"><div class="box">4</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-3"><div class="box">3</div></div>
			<div class="col-xxs-3"><div class="box">3</div></div>
			<div class="col-xxs-3"><div class="box">3</div></div>
			<div class="col-xxs-3"><div class="box">3</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-2"><div class="box">2</div></div>
			<div class="col-xxs-2"><div class="box">2</div></div>
			<div class="col-xxs-2"><div class="box">2</div></div>
			<div class="col-xxs-2"><div class="box">2</div></div>
			<div class="col-xxs-2"><div class="box">2</div></div>
			<div class="col-xxs-2"><div class="box">2</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-1"><div class="box">1</div></div>
		</div>
	</section>

	<!-- Mixed Column Widths -->
	<section>
		<h2>Mixed Column Widths</h2>
		<p class="muted-color text-small margin-bottom-2">
			Columns of different sizes in the same row.
		</p>
		<div class="row">
			<div class="col-xxs-8"><div class="box">8</div></div>
			<div class="col-xxs-4"><div class="box">4</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-3"><div class="box">3</div></div>
			<div class="col-xxs-6"><div class="box">6</div></div>
			<div class="col-xxs-3"><div class="box">3</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-2"><div class="box">2</div></div>
			<div class="col-xxs-5"><div class="box">5</div></div>
			<div class="col-xxs-5"><div class="box">5</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-1"><div class="box">1</div></div>
			<div class="col-xxs-11"><div class="box">11</div></div>
		</div>
	</section>

	<!-- Auto-width Columns -->
	<section>
		<h2>Auto-width Columns</h2>
		<p class="muted-color text-small margin-bottom-2">
			.col-xxs (no number) — columns expand equally to fill available space.
		</p>
		<div class="row">
			<div class="col-xxs"><div class="box">auto</div></div>
			<div class="col-xxs"><div class="box">auto</div></div>
		</div>
		<div class="row">
			<div class="col-xxs"><div class="box">auto</div></div>
			<div class="col-xxs"><div class="box">auto</div></div>
			<div class="col-xxs"><div class="box">auto</div></div>
		</div>
		<div class="row">
			<div class="col-xxs"><div class="box">auto</div></div>
			<div class="col-xxs"><div class="box">auto</div></div>
			<div class="col-xxs"><div class="box">auto</div></div>
			<div class="col-xxs"><div class="box">auto</div></div>
			<div class="col-xxs"><div class="box">auto</div></div>
		</div>
	</section>

	<!-- Auto + Fixed Mix -->
	<section>
		<h2>Auto + Fixed Mix</h2>
		<p class="muted-color text-small margin-bottom-2">
			Mix auto-width and fixed-width columns. Auto fills remaining space.
		</p>
		<div class="row">
			<div class="col-xxs-4"><div class="box">4</div></div>
			<div class="col-xxs"><div class="box">auto</div></div>
		</div>
		<div class="row">
			<div class="col-xxs"><div class="box">auto</div></div>
			<div class="col-xxs-6"><div class="box">6</div></div>
			<div class="col-xxs"><div class="box">auto</div></div>
		</div>
	</section>

	<!-- Responsive Columns -->
	<section>
		<h2>Responsive Columns</h2>
		<p class="muted-color text-small margin-bottom-2">
			Columns change width at different breakpoints. Resize the browser to see
			the effect.
		</p>
		<div class="row">
			<div class="col-xxs-12 col-sm-6 col-lg-3">
				<div class="box">xxs-12 sm-6 lg-3</div>
			</div>
			<div class="col-xxs-12 col-sm-6 col-lg-3">
				<div class="box">xxs-12 sm-6 lg-3</div>
			</div>
			<div class="col-xxs-12 col-sm-6 col-lg-3">
				<div class="box">xxs-12 sm-6 lg-3</div>
			</div>
			<div class="col-xxs-12 col-sm-6 col-lg-3">
				<div class="box">xxs-12 sm-6 lg-3</div>
			</div>
		</div>
		<div class="row">
			<div class="col-xxs-12 col-md-8"><div class="box">xxs-12 md-8</div></div>
			<div class="col-xxs-12 col-md-4"><div class="box">xxs-12 md-4</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-6 col-md-4 col-xl-2">
				<div class="box">xxs-6 md-4 xl-2</div>
			</div>
			<div class="col-xxs-6 col-md-4 col-xl-8">
				<div class="box">xxs-6 md-4 xl-8</div>
			</div>
			<div class="col-xxs-12 col-md-4 col-xl-2">
				<div class="box">xxs-12 md-4 xl-2</div>
			</div>
		</div>
		<pre class="code"><span class="cm"
				>&lt;!-- Stack on mobile, 2-col on tablet, 4-col on desktop --&gt;</span
			>
&lt;div class="<span class="hl">row</span>"&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-sm-6 col-lg-3</span
			>"&gt;...&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-sm-6 col-lg-3</span
			>"&gt;...&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-sm-6 col-lg-3</span
			>"&gt;...&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-sm-6 col-lg-3</span
			>"&gt;...&lt;/div&gt;
&lt;/div&gt;</pre>
	</section>

	<!-- Hiding Columns -->
	<section>
		<h2>Hiding Columns</h2>
		<p class="muted-color text-small margin-bottom-2">
			.col-&#123;bp&#125;-0 hides a column at that breakpoint. Resize to see
			columns disappear.
		</p>
		<div class="row">
			<div class="col-xxs-6"><div class="box">Always visible</div></div>
			<div class="col-xxs-6 col-md-0">
				<div class="box accent">Hidden at md+</div>
			</div>
		</div>
		<div class="row">
			<div class="col-xxs-0 col-lg-4">
				<div class="box accent">Visible at lg+</div>
			</div>
			<div class="col-xxs-12 col-lg-8">
				<div class="box">Fills remaining</div>
			</div>
		</div>
	</section>

	<!-- Horizontal Alignment -->
	<section>
		<h2>Horizontal Alignment — start, center, end</h2>
		<p class="muted-color text-small margin-bottom-2">
			.start-xxs, .center-xxs, .end-xxs on the row.
		</p>
		<div class="row start-xxs">
			<div class="col-xxs-3"><div class="box">start</div></div>
		</div>
		<div class="row center-xxs">
			<div class="col-xxs-3"><div class="box">center</div></div>
		</div>
		<div class="row end-xxs">
			<div class="col-xxs-3"><div class="box">end</div></div>
		</div>
		<pre class="code">&lt;div class="<span class="hl">row start-xxs</span
			>"&gt;...&lt;/div&gt;
&lt;div class="<span class="hl">row center-xxs</span>"&gt;...&lt;/div&gt;
&lt;div class="<span class="hl">row end-xxs</span>"&gt;...&lt;/div&gt;

<span class="cm"
				>&lt;!-- Responsive: center on mobile, start on desktop --&gt;</span
			>
&lt;div class="<span class="hl">row center-xxs start-lg</span
			>"&gt;...&lt;/div&gt;</pre>
	</section>

	<!-- Distribution -->
	<section>
		<h2>Distribution — around, between</h2>
		<p class="muted-color text-small margin-bottom-2">
			.around-xxs and .between-xxs distribute columns within the row.
		</p>
		<div class="row around-xxs">
			<div class="col-xxs-2"><div class="box">around</div></div>
			<div class="col-xxs-2"><div class="box">around</div></div>
			<div class="col-xxs-2"><div class="box">around</div></div>
		</div>
		<div class="row between-xxs">
			<div class="col-xxs-2"><div class="box">between</div></div>
			<div class="col-xxs-2"><div class="box">between</div></div>
			<div class="col-xxs-2"><div class="box">between</div></div>
		</div>
	</section>

	<!-- Vertical Alignment -->
	<section>
		<h2>Vertical Alignment — top, middle, bottom</h2>
		<p class="muted-color text-small margin-bottom-2">
			.top-xxs, .middle-xxs, .bottom-xxs on the row.
		</p>
		<div class="row top-xxs tall-row">
			<div class="col-xxs-4"><div class="box">top</div></div>
			<div class="col-xxs-4"><div class="box tall-box">tall</div></div>
			<div class="col-xxs-4"><div class="box">top</div></div>
		</div>
		<div class="row middle-xxs tall-row">
			<div class="col-xxs-4"><div class="box">middle</div></div>
			<div class="col-xxs-4"><div class="box tall-box">tall</div></div>
			<div class="col-xxs-4"><div class="box">middle</div></div>
		</div>
		<div class="row bottom-xxs tall-row">
			<div class="col-xxs-4"><div class="box">bottom</div></div>
			<div class="col-xxs-4"><div class="box tall-box">tall</div></div>
			<div class="col-xxs-4"><div class="box">bottom</div></div>
		</div>
	</section>

	<!-- Stretch -->
	<section>
		<h2>Stretch</h2>
		<p class="muted-color text-small margin-bottom-2">
			.stretch-xxs stretches align-content across the cross axis.
		</p>
		<div class="row stretch-xxs tall-row">
			<div class="col-xxs-4"><div class="box">stretch</div></div>
			<div class="col-xxs-4"><div class="box">stretch</div></div>
			<div class="col-xxs-4"><div class="box">stretch</div></div>
		</div>
	</section>

	<!-- Ordering -->
	<section>
		<h2>Ordering — first, last, sort</h2>
		<p class="muted-color text-small margin-bottom-2">
			.first-xxs (order: -1), .last-xxs (order: 25), .sort-xxs-N (order: N,
			0–24).
		</p>
		<div class="row">
			<div class="col-xxs-3"><div class="box muted">1st in DOM</div></div>
			<div class="col-xxs-3"><div class="box muted">2nd in DOM</div></div>
			<div class="col-xxs-3 first-xxs">
				<div class="box accent">3rd in DOM — .first-xxs</div>
			</div>
			<div class="col-xxs-3"><div class="box muted">4th in DOM</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-3 last-xxs">
				<div class="box accent">1st in DOM — .last-xxs</div>
			</div>
			<div class="col-xxs-3"><div class="box muted">2nd in DOM</div></div>
			<div class="col-xxs-3"><div class="box muted">3rd in DOM</div></div>
			<div class="col-xxs-3"><div class="box muted">4th in DOM</div></div>
		</div>
		<div class="row">
			<div class="col-xxs-3 sort-xxs-4">
				<div class="box accent">sort-4</div>
			</div>
			<div class="col-xxs-3 sort-xxs-3">
				<div class="box accent">sort-3</div>
			</div>
			<div class="col-xxs-3 sort-xxs-1">
				<div class="box accent">sort-1</div>
			</div>
			<div class="col-xxs-3 sort-xxs-2">
				<div class="box accent">sort-2</div>
			</div>
		</div>
		<pre class="code"><span class="cm"
				>&lt;!-- Move third item to first position --&gt;</span
			>
&lt;div class="<span class="hl">row</span>"&gt;
  &lt;div class="col-xxs-3"&gt;1st&lt;/div&gt;
  &lt;div class="col-xxs-3"&gt;2nd&lt;/div&gt;
  &lt;div class="col-xxs-3 <span class="hl">first-xxs</span
			>"&gt;Appears first&lt;/div&gt;
  &lt;div class="col-xxs-3"&gt;4th&lt;/div&gt;
&lt;/div&gt;

<span class="cm">&lt;!-- Fine-grained ordering --&gt;</span>
&lt;div class="<span class="hl">row</span>"&gt;
  &lt;div class="col-xxs-3 <span class="hl">sort-xxs-3</span>"&gt;A&lt;/div&gt;
  &lt;div class="col-xxs-3 <span class="hl">sort-xxs-1</span>"&gt;B&lt;/div&gt;
  &lt;div class="col-xxs-3 <span class="hl">sort-xxs-2</span>"&gt;C&lt;/div&gt;
&lt;/div&gt;</pre>
	</section>

	<!-- Responsive Ordering -->
	<section>
		<h2>Responsive Ordering</h2>
		<p class="muted-color text-small margin-bottom-2">
			Ordering changes at breakpoints. "Sidebar" moves first on mobile.
		</p>
		<div class="row">
			<div class="col-xxs-12 col-md-8 last-xxs first-md">
				<div class="box">Main content — first at md+</div>
			</div>
			<div class="col-xxs-12 col-md-4 first-xxs last-md">
				<div class="box accent">Sidebar — first at xxs</div>
			</div>
		</div>
	</section>

	<!-- Visibility -->
	<section>
		<h2>Visibility — hidden &amp; visible</h2>
		<p class="muted-color text-small margin-bottom-2">
			.hidden-&#123;bp&#125; hides at that breakpoint+. .visible-&#123;bp&#125;
			shows at that breakpoint+. Resize to see.
		</p>
		<div class="row">
			<div class="col-xxs-4"><div class="box">Always visible</div></div>
			<div class="col-xxs-4 hidden-md">
				<div class="box accent">hidden-md (gone at 640px+)</div>
			</div>
			<div class="col-xxs-4 hidden-xxs visible-lg">
				<div class="box accent">visible-lg only</div>
			</div>
		</div>
		<pre class="code"><span class="cm"
				>&lt;!-- Hide on mobile, show on desktop --&gt;</span
			>
&lt;div class="<span class="hl">hidden-xxs visible-lg</span
			>"&gt;Desktop only&lt;/div&gt;

<span class="cm">&lt;!-- Hide at a specific breakpoint --&gt;</span>
&lt;div class="<span class="hl">hidden-md</span>"&gt;Gone at 640px+&lt;/div&gt;

<span class="cm">&lt;!-- Menu-specific helpers --&gt;</span>
&lt;nav class="<span class="hl">hidden-menu-mobile</span
			>"&gt;Desktop nav&lt;/nav&gt;
&lt;nav class="<span class="hl">hidden-menu-desktop</span
			>"&gt;Mobile nav&lt;/nav&gt;</pre>
	</section>

	<!-- Visibility Display Types -->
	<section>
		<h2>Visibility Display Types</h2>
		<p class="muted-color text-small margin-bottom-2">
			.visible-xxs (flex), .visible-xxs-block, .visible-xxs-inline,
			.visible-xxs-inline-block. At other breakpoints:
			.visible-&#123;bp&#125;-flex.
		</p>
		<div class="row">
			<div class="col-xxs visible-xxs">
				<div class="box">visible-xxs (flex)</div>
			</div>
			<div class="col-xxs visible-xxs-block">
				<div class="box">visible-xxs-block</div>
			</div>
		</div>
	</section>

	<!-- Menu Visibility -->
	<section>
		<h2>Menu Visibility</h2>
		<p class="muted-color text-small margin-bottom-2">
			.hidden-menu-mobile (≤800px) and .hidden-menu-desktop (>800px). For nav
			elements that differ between mobile and desktop.
		</p>
		<div class="row">
			<div class="col-xxs-6">
				<div class="box hidden-menu-mobile">Desktop menu only</div>
			</div>
			<div class="col-xxs-6">
				<div class="box accent hidden-menu-desktop">Mobile menu only</div>
			</div>
		</div>
	</section>

	<!-- Container -->
	<section>
		<h2>Container</h2>
		<p class="muted-color text-small margin-bottom-2">
			.container centers content with max-width: var(--container) (1400px) and
			gutter padding.
		</p>
		<div class="container-demo">
			<div class="container">
				<div class="row">
					<div class="col-xxs-12">
						<div class="box">.container (max 1400px, centered)</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Gap Utilities -->
	<section>
		<h2>Gap Utilities</h2>
		<p class="muted-color text-small margin-bottom-2">
			.gap-N (0–20) and fractional: .gap-025, .gap-05, .gap-075, .gap-125,
			.gap-15, .gap-175. Also .gap-N-5 for N.5 values.
		</p>
		<div class="row gap-0">
			<div class="col-xxs-3"><div class="box">gap-0</div></div>
			<div class="col-xxs-3"><div class="box">gap-0</div></div>
			<div class="col-xxs-3"><div class="box">gap-0</div></div>
			<div class="col-xxs-3"><div class="box">gap-0</div></div>
		</div>
		<div class="row gap-2">
			<div class="col-xxs-3"><div class="box">gap-2</div></div>
			<div class="col-xxs-3"><div class="box">gap-2</div></div>
			<div class="col-xxs-3"><div class="box">gap-2</div></div>
			<div class="col-xxs-3"><div class="box">gap-2</div></div>
		</div>
		<div class="row gap-4">
			<div class="col-xxs-3"><div class="box">gap-4</div></div>
			<div class="col-xxs-3"><div class="box">gap-4</div></div>
			<div class="col-xxs-3"><div class="box">gap-4</div></div>
			<div class="col-xxs-3"><div class="box">gap-4</div></div>
		</div>
	</section>

	<!-- Responsive Gap -->
	<section>
		<h2>Responsive Gap</h2>
		<p class="muted-color text-small margin-bottom-2">
			.gap-&#123;bp&#125;-N changes gap at breakpoints.
		</p>
		<div class="row gap-xxs-1 gap-md-3 gap-lg-6">
			<div class="col-xxs-3"><div class="box">gap: xxs-1 md-3 lg-6</div></div>
			<div class="col-xxs-3"><div class="box">gap: xxs-1 md-3 lg-6</div></div>
			<div class="col-xxs-3"><div class="box">gap: xxs-1 md-3 lg-6</div></div>
			<div class="col-xxs-3"><div class="box">gap: xxs-1 md-3 lg-6</div></div>
		</div>
	</section>

	<!-- Margin Utilities -->
	<section>
		<h2>Margin Utilities</h2>
		<p class="muted-color text-small margin-bottom-2">
			.margin-N (all sides), .margin-top-N, .margin-bottom-N, .margin-left-N,
			.margin-right-N. Range 0–12. Also responsive: .margin-top-md-4.
		</p>
		<div class="spacing-demos">
			<div class="spacing-item">
				<span class="label">.margin-0</span>
				<div class="spacing-visual">
					<div class="box margin-0">content</div>
				</div>
			</div>
			<div class="spacing-item">
				<span class="label">.margin-2</span>
				<div class="spacing-visual">
					<div class="box margin-2">content</div>
				</div>
			</div>
			<div class="spacing-item">
				<span class="label">.margin-4</span>
				<div class="spacing-visual">
					<div class="box margin-4">content</div>
				</div>
			</div>
			<div class="spacing-item">
				<span class="label">.margin-bottom-3</span>
				<div class="spacing-visual">
					<div class="box margin-bottom-3">content</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Padding Utilities -->
	<section>
		<h2>Padding Utilities</h2>
		<p class="muted-color text-small margin-bottom-2">
			.padding-N (all sides), .padding-top-N, .padding-bottom-N,
			.padding-left-N, .padding-right-N. Range 0–12. Also responsive:
			.padding-left-lg-2.
		</p>
		<div class="spacing-demos">
			<div class="spacing-item">
				<span class="label">.padding-0</span>
				<div class="spacing-visual">
					<div class="box-outline padding-0">
						<span class="inner-box">content</span>
					</div>
				</div>
			</div>
			<div class="spacing-item">
				<span class="label">.padding-2</span>
				<div class="spacing-visual">
					<div class="box-outline padding-2">
						<span class="inner-box">content</span>
					</div>
				</div>
			</div>
			<div class="spacing-item">
				<span class="label">.padding-4</span>
				<div class="spacing-visual">
					<div class="box-outline padding-4">
						<span class="inner-box">content</span>
					</div>
				</div>
			</div>
			<div class="spacing-item">
				<span class="label">.padding-left-3</span>
				<div class="spacing-visual">
					<div class="box-outline padding-left-3">
						<span class="inner-box">content</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Responsive Margin/Padding -->
	<section>
		<h2>Responsive Margin &amp; Padding</h2>
		<p class="muted-color text-small margin-bottom-2">
			.margin-top-&#123;bp&#125;-N and .padding-&#123;bp&#125;-N change spacing
			at breakpoints. Common pattern for responsive layouts.
		</p>
		<div class="row">
			<div class="col-xxs-12">
				<div class="box margin-bottom-xxs-2 margin-bottom-md-6">
					margin-bottom: xxs-2, md-6 (resize to see)
				</div>
			</div>
		</div>
	</section>

	<!-- Nesting -->
	<section>
		<h2>Nesting</h2>
		<p class="muted-color text-small margin-bottom-2">
			Grids can be nested. Place a .row inside a column to create sub-grids.
		</p>
		<div class="row">
			<div class="col-xxs-8">
				<div class="box-outline padding-2">
					<span
						class="muted-color text-small margin-bottom-1"
						style="display:block">col-xxs-8 (outer)</span
					>
					<div class="row">
						<div class="col-xxs-6"><div class="box">nested 6</div></div>
						<div class="col-xxs-6"><div class="box">nested 6</div></div>
					</div>
				</div>
			</div>
			<div class="col-xxs-4">
				<div class="box-outline padding-2">
					<span
						class="muted-color text-small margin-bottom-1"
						style="display:block">col-xxs-4 (outer)</span
					>
					<div class="row">
						<div class="col-xxs-12"><div class="box">nested 12</div></div>
					</div>
				</div>
			</div>
		</div>
		<pre class="code">&lt;div class="<span class="hl">row</span>"&gt;
  &lt;div class="<span class="hl">col-xxs-8</span>"&gt;
    <span class="cm">&lt;!-- Nested grid inside a column --&gt;</span>
    &lt;div class="<span class="hl">row</span>"&gt;
      &lt;div class="<span class="hl">col-xxs-6</span>"&gt;Nested&lt;/div&gt;
      &lt;div class="<span class="hl">col-xxs-6</span>"&gt;Nested&lt;/div&gt;
    &lt;/div&gt;
  &lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-4</span>"&gt;Sidebar&lt;/div&gt;
&lt;/div&gt;</pre>
	</section>

	<!-- Global Alignment -->
	<section>
		<h2>Global Alignment Shortcuts</h2>
		<p class="muted-color text-small margin-bottom-2">
			.center, .left/.start, .right/.end, .justify — non-responsive shorthand
			classes.
		</p>
		<div class="row">
			<div class="col-xxs-12 center">
				<div class="box" style="display:inline-block">.center</div>
			</div>
		</div>
		<div class="row">
			<div class="col-xxs-12 left">
				<div class="box" style="display:inline-block">.left / .start</div>
			</div>
		</div>
		<div class="row">
			<div class="col-xxs-12 right">
				<div class="box" style="display:inline-block">.right / .end</div>
			</div>
		</div>
	</section>

	<!-- Height Utility -->
	<section>
		<h2>Height Utility</h2>
		<p class="muted-color text-small margin-bottom-2">
			.height-100p sets height: 100%. Useful for equal-height columns.
		</p>
		<div class="row">
			<div class="col-xxs-6">
				<div class="box tall-box">
					Tall content here that takes up more vertical space
				</div>
			</div>
			<div class="col-xxs-6">
				<div class="box height-100p">height-100p (matches sibling)</div>
			</div>
		</div>
	</section>

	<!-- Common Patterns -->
	<section>
		<h2>Common Patterns</h2>
		<p class="muted-color text-small margin-bottom-2">
			Practical layout patterns you can use as starting points.
		</p>

		<h3 class="pattern-label">Sidebar + Main content</h3>
		<div class="row">
			<div class="col-xxs-12 col-md-3">
				<div class="box accent">Sidebar</div>
			</div>
			<div class="col-xxs-12 col-md-9">
				<div
					class="box"
					style="padding: calc(var(--gutter) * 3) calc(var(--gutter) * 1)"
				>
					Main content area
				</div>
			</div>
		</div>
		<pre class="code">&lt;div class="<span class="hl">row</span>"&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-md-3</span
			>"&gt;Sidebar&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-md-9</span
			>"&gt;Main&lt;/div&gt;
&lt;/div&gt;</pre>

		<h3 class="pattern-label">Card grid</h3>
		<div class="row gap-2">
			<div class="col-xxs-12 col-sm-6 col-lg-4">
				<div
					class="box"
					style="padding: calc(var(--gutter) * 3) calc(var(--gutter) * 1)"
				>
					Card 1
				</div>
			</div>
			<div class="col-xxs-12 col-sm-6 col-lg-4">
				<div
					class="box"
					style="padding: calc(var(--gutter) * 3) calc(var(--gutter) * 1)"
				>
					Card 2
				</div>
			</div>
			<div class="col-xxs-12 col-sm-6 col-lg-4">
				<div
					class="box"
					style="padding: calc(var(--gutter) * 3) calc(var(--gutter) * 1)"
				>
					Card 3
				</div>
			</div>
		</div>
		<pre class="code">&lt;div class="<span class="hl">row gap-2</span>"&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-sm-6 col-lg-4</span
			>"&gt;Card&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-sm-6 col-lg-4</span
			>"&gt;Card&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-sm-6 col-lg-4</span
			>"&gt;Card&lt;/div&gt;
&lt;/div&gt;</pre>

		<h3 class="pattern-label">Centered content column</h3>
		<div class="row center-xxs">
			<div class="col-xxs-12 col-md-8 col-lg-6">
				<div
					class="box"
					style="padding: calc(var(--gutter) * 3) calc(var(--gutter) * 1)"
				>
					Centered narrow content
				</div>
			</div>
		</div>
		<pre class="code">&lt;div class="<span class="hl">row center-xxs</span>"&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-md-8 col-lg-6</span
			>"&gt;Content&lt;/div&gt;
&lt;/div&gt;</pre>

		<h3 class="pattern-label">Form layout</h3>
		<div class="row gap-2">
			<div class="col-xxs-12 col-md-6"><div class="box">First name</div></div>
			<div class="col-xxs-12 col-md-6"><div class="box">Last name</div></div>
			<div class="col-xxs-12"><div class="box">Email address</div></div>
			<div class="col-xxs-12 col-md-4"><div class="box">City</div></div>
			<div class="col-xxs-6 col-md-4"><div class="box">State</div></div>
			<div class="col-xxs-6 col-md-4"><div class="box">Zip</div></div>
		</div>
		<pre class="code">&lt;div class="<span class="hl">row gap-2</span>"&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-md-6</span
			>"&gt;First name&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-md-6</span
			>"&gt;Last name&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-12</span>"&gt;Email&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-md-4</span
			>"&gt;City&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-6 col-md-4</span
			>"&gt;State&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-6 col-md-4</span>"&gt;Zip&lt;/div&gt;
&lt;/div&gt;</pre>

		<h3 class="pattern-label">Mobile-first navigation reorder</h3>
		<div class="row">
			<div class="col-xxs-12 col-md-9 last-xxs first-md">
				<div
					class="box"
					style="padding: calc(var(--gutter) * 3) calc(var(--gutter) * 1)"
				>
					Main content — first on desktop
				</div>
			</div>
			<div class="col-xxs-12 col-md-3 first-xxs last-md">
				<div class="box accent">Nav — first on mobile</div>
			</div>
		</div>
		<pre class="code">&lt;div class="<span class="hl">row</span>"&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-md-9 last-xxs first-md</span
			>"&gt;Main&lt;/div&gt;
  &lt;div class="<span class="hl">col-xxs-12 col-md-3 first-xxs last-md</span
			>"&gt;Nav&lt;/div&gt;
&lt;/div&gt;</pre>
	</section>

	<!-- Quick Reference -->
	<section>
		<h2>Quick Reference</h2>
		<p class="muted-color text-small margin-bottom-2">
			All available class patterns at a glance.
		</p>
		<div class="ref-table wide">
			<div class="ref-row ref-header">
				<span>Pattern</span><span>Description</span>
			</div>
			<div class="ref-row">
				<span>.row</span><span
					>Flex container with wrap and negative gutter margins</span
				>
			</div>
			<div class="ref-row">
				<span>.container</span><span>Max-width centered wrapper (1400px)</span>
			</div>
			<div class="ref-row">
				<span>.col-&#123;bp&#125;-&#123;1-12&#125;</span><span
					>Column spanning N/12 at breakpoint</span
				>
			</div>
			<div class="ref-row">
				<span>.col-&#123;bp&#125;</span><span
					>Auto-width column (flex: 1 1 0)</span
				>
			</div>
			<div class="ref-row">
				<span>.col-&#123;bp&#125;-0</span><span>Hide column at breakpoint</span>
			</div>
			<div class="ref-row">
				<span
					>.start-&#123;bp&#125; .center-&#123;bp&#125; .end-&#123;bp&#125;</span
				><span>Horizontal alignment</span>
			</div>
			<div class="ref-row">
				<span
					>.top-&#123;bp&#125; .middle-&#123;bp&#125; .bottom-&#123;bp&#125;</span
				><span>Vertical alignment</span>
			</div>
			<div class="ref-row">
				<span>.around-&#123;bp&#125; .between-&#123;bp&#125;</span><span
					>Space distribution</span
				>
			</div>
			<div class="ref-row">
				<span>.stretch-&#123;bp&#125;</span><span>Stretch align-content</span>
			</div>
			<div class="ref-row">
				<span>.first-&#123;bp&#125; .last-&#123;bp&#125;</span><span
					>Reorder first/last</span
				>
			</div>
			<div class="ref-row">
				<span>.sort-&#123;bp&#125;-&#123;0-24&#125;</span><span
					>Explicit ordering</span
				>
			</div>
			<div class="ref-row">
				<span>.hidden-&#123;bp&#125;</span><span>Hide at breakpoint</span>
			</div>
			<div class="ref-row">
				<span>.visible-&#123;bp&#125;</span><span
					>Show at breakpoint (flex/block)</span
				>
			</div>
			<div class="ref-row">
				<span
					>.visible-&#123;bp&#125;-flex / -block / -inline / -inline-block</span
				><span>Show with specific display type</span>
			</div>
			<div class="ref-row">
				<span>.hidden-menu-mobile / .hidden-menu-desktop</span><span
					>Menu breakpoint visibility (800px)</span
				>
			</div>
			<div class="ref-row">
				<span>.gap-&#123;0-20&#125;</span><span
					>Gap utility (gutter multiplier)</span
				>
			</div>
			<div class="ref-row">
				<span>.gap-025 .gap-05 .gap-075 .gap-125 .gap-15 .gap-175</span><span
					>Fractional gap values</span
				>
			</div>
			<div class="ref-row">
				<span>.gap-&#123;bp&#125;-&#123;0-12&#125;</span><span
					>Responsive gap</span
				>
			</div>
			<div class="ref-row">
				<span>.margin-&#123;0-12&#125;</span><span>Margin all sides</span>
			</div>
			<div class="ref-row">
				<span>.margin-&#123;dir&#125;-&#123;0-12&#125;</span><span
					>Margin single direction (top/right/bottom/left)</span
				>
			</div>
			<div class="ref-row">
				<span>.margin-&#123;dir&#125;-&#123;bp&#125;-&#123;0-12&#125;</span
				><span>Responsive directional margin</span>
			</div>
			<div class="ref-row">
				<span>.padding-&#123;0-12&#125;</span><span>Padding all sides</span>
			</div>
			<div class="ref-row">
				<span>.padding-&#123;dir&#125;-&#123;0-12&#125;</span><span
					>Padding single direction</span
				>
			</div>
			<div class="ref-row">
				<span>.padding-&#123;dir&#125;-&#123;bp&#125;-&#123;0-12&#125;</span
				><span>Responsive directional padding</span>
			</div>
			<div class="ref-row">
				<span>.height-100p</span><span>Height 100%</span>
			</div>
			<div class="ref-row">
				<span>.center .left .right .start .end .justify</span><span
					>Global alignment (non-responsive)</span
				>
			</div>
		</div>
	</section>

	<!-- SCSS Mixins -->
	<section>
		<h2>SCSS Mixins</h2>
		<p class="muted-color text-small margin-bottom-2">
			Desktop-first (max-width) mixins for use in component styles. Import from
			GRID.v3.mixins.scss.
		</p>
		<div class="ref-table wide">
			<div class="ref-row ref-header">
				<span>Mixin</span><span>Max-width</span><span>Pixels</span>
			</div>
			<div class="ref-row">
				<span>@include xl</span><span>80rem</span><span>1280px</span>
			</div>
			<div class="ref-row">
				<span>@include lg</span><span>64rem</span><span>1024px</span>
			</div>
			<div class="ref-row">
				<span>@include md</span><span>40rem</span><span>640px</span>
			</div>
			<div class="ref-row">
				<span>@include sm</span><span>30rem</span><span>480px</span>
			</div>
			<div class="ref-row">
				<span>@include xs</span><span>20rem</span><span>320px</span>
			</div>
			<div class="ref-row">
				<span>@include menu-mobile</span><span>800px</span><span>—</span>
			</div>
			<div class="ref-row">
				<span>@include menu-desktop</span><span>min: 801px</span><span>—</span>
			</div>
		</div>
		<pre class="code"><span class="cm"
				>// In component &lt;style lang="scss"&gt; blocks</span
			>
<span class="cm">// Desktop-first (max-width) — opposite of CSS classes</span>

.my-component &#123;
  display: flex;
  gap: 2rem;

  <span class="hl">@include md</span> &#123;          <span class="cm"
				>// ≤ 640px</span
			>
    flex-direction: column;
  &#125;

  <span class="hl">@include sm</span> &#123;          <span class="cm"
				>// ≤ 480px</span
			>
    padding: 0.5rem;
  &#125;

  <span class="hl">@include menu-mobile</span> &#123; <span class="cm"
				>// ≤ 800px</span
			>
    display: none;
  &#125;
&#125;</pre>
		<p class="muted-color text-small margin-top-2">
			<strong>Note:</strong> CSS classes are mobile-first (min-width), but SCSS mixins
			are desktop-first (max-width). Use classes in markup and mixins in component
			&lt;style&gt; blocks.
		</p>
	</section>
</div>

<style lang="scss">
	h1 {
		margin-bottom: calc(var(--gutter) * 1.5);
	}
	h2 {
		margin-bottom: calc(var(--gutter) * 1.5);
		font-size: var(--font-size-large);
	}
	section {
		margin-bottom: calc(var(--gutter) * 5);
	}

	.box {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: calc(var(--gutter) * 1.5) calc(var(--gutter) * 1);
		text-align: center;
		font-size: var(--font-size-mdall);
		color: var(--muted-color);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;

		&.accent {
			background: rgba(116, 231, 168, 0.08);
			border-color: rgba(116, 231, 168, 0.2);
			color: var(--accent-color);
		}

		&.muted {
			opacity: 0.5;
		}
	}

	.box-outline {
		border: 1px dashed var(--border-color);
		border-radius: 6px;
	}

	.inner-box {
		display: block;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: calc(var(--gutter) * 1);
		text-align: center;
		font-size: var(--font-size-mdall);
		color: var(--muted-color);
	}

	.tall-row {
		min-height: 120px;
	}

	.tall-box {
		padding: calc(var(--gutter) * 4) calc(var(--gutter) * 1);
	}

	.row {
		margin-bottom: calc(var(--gutter) * 1.5);
	}

	.container-demo {
		background: rgba(255, 255, 255, 0.02);
		border: 1px dashed var(--border-color);
		border-radius: 6px;
		padding: calc(var(--gutter) * 1) 0;
	}

	// Reference table
	.ref-table {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		overflow: hidden;

		&.wide {
			overflow-x: auto;
		}
	}

	.ref-row {
		display: flex;
		gap: calc(var(--gutter) * 2);
		padding: calc(var(--gutter) * 1.25) calc(var(--gutter) * 2);
		font-size: var(--font-size-mdall);
		border-bottom: 1px solid var(--border-color);

		&:last-child {
			border-bottom: none;
		}

		&.ref-header {
			background: rgba(255, 255, 255, 0.04);
			font-weight: var(--font-weight-bold);
			color: var(--text-color);
		}

		span {
			flex: 1;
			color: var(--muted-color);
			min-width: 0;

			&:first-child {
				color: var(--text-color);
				font-family: monospace;
				font-size: 0.8rem;
				flex: 0 0 auto;
				min-width: 180px;
			}
		}
	}

	// Spacing demos
	.spacing-demos {
		display: flex;
		flex-wrap: wrap;
		gap: calc(var(--gutter) * 3);
	}

	.spacing-item {
		display: flex;
		flex-direction: column;
		gap: calc(var(--gutter) * 0.75);

		.label {
			font-family: monospace;
			font-size: 0.8rem;
			color: var(--muted-color);
		}
	}

	.spacing-visual {
		background: rgba(116, 231, 168, 0.06);
		border: 1px dashed rgba(116, 231, 168, 0.2);
		border-radius: 6px;
		display: inline-block;
	}

	// Hero
	.hero {
		text-align: center;
		padding: calc(var(--gutter) * 4) 0 calc(var(--gutter) * 5);
		border-bottom: 1px solid var(--border-color);
		margin-bottom: calc(var(--gutter) * 5);

		h1 {
			font-size: 3rem;
			font-weight: var(--font-weight-bold);
			letter-spacing: 0.15em;
			margin-bottom: calc(var(--gutter) * 1.5);
			color: var(--white);
		}
	}

	.hero-eyebrow {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: calc(var(--gutter) * 1);
		font-size: var(--font-size-mdall);
		color: var(--muted-color);
		margin-bottom: calc(var(--gutter) * 2);
	}

	.hero-version {
		background: rgba(116, 231, 168, 0.1);
		color: var(--accent-color);
		padding: 2px 10px;
		border-radius: 20px;
		font-weight: var(--font-weight-bold);
		font-size: 0.75rem;
		letter-spacing: 0.03em;
	}

	.hero-sep {
		opacity: 0.3;
	}

	.hero-tagline {
		font-size: var(--font-size);
		color: var(--muted-color);
		max-width: 480px;
		margin: 0 auto calc(var(--gutter) * 3);
		line-height: 1.6;
	}

	.hero-stats {
		display: flex;
		justify-content: center;
		gap: calc(var(--gutter) * 4);
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--gutter) * 0.25);
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: var(--font-weight-bold);
		color: var(--white);
	}

	.stat-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted-color-2);
	}

	// Code blocks
	pre.code {
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid var(--border-color);
		border-left: 3px solid rgba(116, 231, 168, 0.25);
		border-radius: 8px;
		padding: calc(var(--gutter) * 2) calc(var(--gutter) * 2.5);
		margin-top: calc(var(--gutter) * 2);
		overflow-x: auto;
		font-family: "SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace;
		font-size: 0.78rem;
		line-height: 1.7;
		color: var(--muted-color);
		tab-size: 2;
		-moz-tab-size: 2;

		.hl {
			color: var(--accent-color);
		}

		.cm {
			color: var(--muted-color-2);
			font-style: italic;
		}
	}

	// Inline code
	code {
		background: rgba(255, 255, 255, 0.06);
		padding: 1px 6px;
		border-radius: 4px;
		font-family: "SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace;
		font-size: 0.82rem;
		color: var(--accent-color);
	}

	// Pattern headings
	h3.pattern-label {
		font-size: var(--font-size);
		font-weight: var(--font-weight-medium);
		color: var(--muted-color);
		margin-top: calc(var(--gutter) * 3);
		margin-bottom: calc(var(--gutter) * 1.5);

		&:first-of-type {
			margin-top: 0;
		}
	}
</style>
