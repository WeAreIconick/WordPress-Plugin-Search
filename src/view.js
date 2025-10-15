/**
 * WordPress.org Plugin Search Block - Frontend JavaScript with Robust Lightbox
 * Completely rewritten lightbox implementation for better frontend compatibility
 */

// Initialize when DOM is loaded
document.addEventListener( 'DOMContentLoaded', function () {
	console.log( 'DOM loaded, looking for plugin search blocks...' );

	const searchBlocks = document.querySelectorAll(
		'.wp-block-telex-block-wordpress-plugin-search'
	);

	console.log( `Found ${ searchBlocks.length } blocks with .wp-block-telex-block-wordpress-plugin-search` );

	if ( searchBlocks.length === 0 ) {
		// Try alternative selectors in case of different class names
		const altBlocks = document.querySelectorAll( '.wps-search-block' );
		console.log( `Found ${ altBlocks.length } blocks with .wps-search-block` );
		altBlocks.forEach( ( block ) => {
			console.log( 'Initializing alt block:', block );
			new PluginSearchInterface( block );
		} );
	} else {
		searchBlocks.forEach( ( block ) => {
			console.log( 'Initializing main block:', block );
			new PluginSearchInterface( block );
		} );
	}
} );

/**
 * Plugin Search Interface with robust custom lightbox
 */
class PluginSearchInterface {
	constructor( blockElement ) {
		this.block = blockElement;
		this.cache = new Map();
		this.currentRequest = null;
		this.searchTimeout = null;

		// Get nonce from WordPress
		this.restNonce = window.wpApiSettings?.nonce || '';

		// Get block attributes
		this.attributes = this.getBlockAttributes();

		// Simplified state for browse-only
		this.state = {
			currentPage: 1,
			resultsPerPage: Math.max(
				1,
				Math.min(
					100,
					parseInt( this.attributes.resultsPerPage ) || 12
				)
			),
			sortBy: this.attributes.defaultSort || 'popular',
			onlyWithScreenshots: false, // Start unchecked by default
			isLoading: false,
			plugins: [],
			totalResults: 0,
			showFilters: this.attributes.showFilters !== false,
			hasMorePages: false,
			isLoadingMore: false,
			screenshotCache: new Map(), // Cache screenshot validation results
		};


		// Lightbox state - simplified and more robust
		this.lightbox = {
			element: null,
			isOpen: false,
			currentPlugin: null,
			currentIndex: 0,
			screenshots: [],
		};

		this.init();
	}

	/**
	 * Create a temporary DOM element to decode HTML entities safely
	 *
	 * @param {string} str - The string to decode
	 * @return {string} Decoded string
	 */
	decodeHtmlEntities( str ) {
		if ( typeof str !== 'string' ) {
			return str;
		}

		// Use DOMParser for safer HTML entity decoding
		// eslint-disable-next-line no-undef
		const parser = new DOMParser();
		const doc = parser.parseFromString(
			`<!doctype html><body>${ str }`,
			'text/html'
		);
		return doc.body.textContent || '';
	}

	/**
	 * Sanitize input to prevent XSS
	 *
	 * @param {string} input - The input to sanitize
	 * @return {string} Sanitized input
	 */
	sanitizeInput( input ) {
		if ( typeof input !== 'string' ) {
			return '';
		}
		return input
			.replace( /<[^>]*>/g, '' )
			.replace( /[<>"'&]/g, function ( match ) {
				const escapeMap = {
					'<': '&lt;',
					'>': '&gt;',
					'"': '&quot;',
					"'": '&#x27;',
					'&': '&amp;',
				};
				return escapeMap[ match ];
			} )
			.trim();
	}

	/**
	 * Sanitize and decode text for display
	 *
	 * @param {string} text - The text to sanitize and decode
	 * @return {string} Sanitized and decoded text
	 */
	sanitizeAndDecodeText( text ) {
		if ( typeof text !== 'string' ) {
			return '';
		}

		// First decode HTML entities, then remove any HTML tags, then trim
		let decoded = this.decodeHtmlEntities( text );
		decoded = decoded.replace( /<[^>]*>/g, '' );
		return decoded.trim();
	}

	/**
	 * Get block attributes
	 */
	getBlockAttributes() {
		const data = this.block.dataset;
		return {
			resultsPerPage: Math.max(
				1,
				Math.min( 100, parseInt( data.resultsPerPage ) || 12 )
			),
			defaultSort: data.defaultSort || 'popular',
			showFilters: data.showFilters !== 'false',
		};
	}

	/**
	 * Initialize the interface
	 */
	async init() {
		try {
			this.renderInterface();
			this.createLightboxHTML();
			this.bindEvents();
			await this.performSearch();
		} catch ( error ) {
			// Error initializing plugin search
			this.renderError( 'Failed to initialize search interface.' );
		}
	}

	/**
	 * Create safe HTML element
	 *
	 * @param {string} tag - The HTML tag name
	 * @param {Object} attributes - Element attributes
	 * @param {string} textContent - Text content for the element
	 * @return {HTMLElement} Created element
	 */
	createElement( tag, attributes = {}, textContent = '' ) {
		const element = document.createElement( tag );

		for ( const [ key, value ] of Object.entries( attributes ) ) {
			if ( typeof value === 'string' || typeof value === 'number' ) {
				element.setAttribute( key, value );
			}
		}

		if ( textContent ) {
			element.textContent = textContent;
		}

		return element;
	}

	/**
	 * Create WordPress button structure
	 *
	 * @param {string} text - Button text
	 * @param {Function} clickHandler - Click event handler
	 * @param {string} classes - Additional CSS classes
	 * @return {Object} Object with container and link elements
	 */
	createButton( text, clickHandler, classes = '' ) {
		const buttonContainer = this.createElement( 'div', {
			class: 'wp-block-button',
		} );
		const buttonLink = this.createElement(
			'a',
			{
				class: `wp-block-button__link wp-element-button ${ classes }`.trim(),
				tabindex: '0',
				role: 'button',
			},
			text
		);

		// Add click handler
		buttonLink.addEventListener( 'click', ( e ) => {
			e.preventDefault();
			clickHandler( e );
		} );

		// Add keyboard handler
		buttonLink.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Enter' || e.key === ' ' ) {
				e.preventDefault();
				clickHandler( e );
			}
		} );

		buttonContainer.appendChild( buttonLink );
		return { container: buttonContainer, link: buttonLink };
	}

	/**
	 * Create robust lightbox HTML structure
	 */
	createLightboxHTML() {
		// Remove any existing lightbox
		const existingLightbox = document.querySelector( '.wps-lightbox' );
		if ( existingLightbox ) {
			existingLightbox.remove();
		}

		// Create lightbox container
		const lightbox = this.createElement( 'div', {
			class: 'wps-lightbox',
			style: 'display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); z-index: 999999; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box;',
		} );

		// Create content container
		const content = this.createElement( 'div', {
			class: 'wps-lightbox-content',
			style: 'position: relative; max-width: 90vw; max-height: 90vh; background: white; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;',
		} );

		// Header with title and close button
		const header = this.createElement( 'div', {
			class: 'wps-lightbox-header',
			style: 'padding: 1rem 1.5rem; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa;',
		} );

		const title = this.createElement( 'h3', {
			class: 'wps-lightbox-title',
			style: 'margin: 0; font-size: 1.2rem; color: #333; flex: 1;',
		} );

		// FIXED: Better close button positioning with higher z-index
		const closeButton = this.createElement(
			'button',
			{
				class: 'wps-lightbox-close',
				style: 'background: none; border: none; font-size: 24px; cursor: pointer; padding: 8px; border-radius: 4px; color: #666; z-index: 100; position: relative;',
				'aria-label': 'Close lightbox',
			},
			'×'
		);

		header.appendChild( title );
		header.appendChild( closeButton );

		// Image container
		const imageContainer = this.createElement( 'div', {
			class: 'wps-lightbox-image-container',
			style: 'flex: 1; display: flex; align-items: center; justify-content: center; position: relative; background: #f8f9fa; padding: 2rem; min-height: 400px;',
		} );

		const image = this.createElement( 'img', {
			class: 'wps-lightbox-image',
			style: 'max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 4px;',
		} );

		// Navigation buttons
		const prevButton = this.createElement(
			'button',
			{
				class: 'wps-lightbox-prev',
				style: 'position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 50px; height: 50px; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;',
				'aria-label': 'Previous image',
			},
			'‹'
		);

		const nextButton = this.createElement(
			'button',
			{
				class: 'wps-lightbox-next',
				style: 'position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 50px; height: 50px; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;',
				'aria-label': 'Next image',
			},
			'›'
		);

		imageContainer.appendChild( image );
		imageContainer.appendChild( prevButton );
		imageContainer.appendChild( nextButton );

		// Footer with counter
		const footer = this.createElement( 'div', {
			class: 'wps-lightbox-footer',
			style: 'padding: 1rem; text-align: center; background: white; border-top: 1px solid #e0e0e0; font-size: 0.9rem; color: #666;',
		} );

		// Assemble lightbox
		content.appendChild( header );
		content.appendChild( imageContainer );
		content.appendChild( footer );
		lightbox.appendChild( content );

		// Add to body
		document.body.appendChild( lightbox );

		// Store references
		this.lightbox.element = lightbox;
		this.lightbox.title = title;
		this.lightbox.image = image;
		this.lightbox.footer = footer;
		this.lightbox.closeButton = closeButton;
		this.lightbox.prevButton = prevButton;
		this.lightbox.nextButton = nextButton;

		// Bind lightbox events
		this.bindLightboxEvents();
	}

	/**
	 * Bind lightbox events with robust error handling
	 */
	bindLightboxEvents() {
		if ( ! this.lightbox.element ) {
			console.error( 'Lightbox element not found for event binding' );
			return;
		}

		try {
			// Close button
			this.lightbox.closeButton.addEventListener( 'click', ( e ) => {
				e.preventDefault();
				e.stopPropagation();
				this.closeLightbox();
			} );

			// Navigation buttons
			this.lightbox.prevButton.addEventListener( 'click', ( e ) => {
				e.preventDefault();
				e.stopPropagation();
				this.navigateLightbox( -1 );
			} );

			this.lightbox.nextButton.addEventListener( 'click', ( e ) => {
				e.preventDefault();
				e.stopPropagation();
				this.navigateLightbox( 1 );
			} );

			// Click outside to close
			this.lightbox.element.addEventListener( 'click', ( e ) => {
				if ( e.target === this.lightbox.element ) {
					this.closeLightbox();
				}
			} );

			// Keyboard navigation
			document.addEventListener( 'keydown', ( e ) => {
				if ( ! this.lightbox.isOpen ) return;

				switch ( e.key ) {
					case 'Escape':
						e.preventDefault();
						this.closeLightbox();
						break;
					case 'ArrowLeft':
						e.preventDefault();
						this.navigateLightbox( -1 );
						break;
					case 'ArrowRight':
						e.preventDefault();
						this.navigateLightbox( 1 );
						break;
				}
			} );
		} catch ( error ) {
			// Error binding lightbox events
		}
	}

	/**
	 * Open lightbox with plugin screenshots
	 *
	 * @param {Object} plugin - Plugin object with screenshots
	 * @param {number} initialIndex - Initial screenshot index to display
	 */
	openLightbox( plugin, initialIndex = 0 ) {
		if ( ! this.lightbox.element ) {
			// Lightbox element not found
			return;
		}

		if (
			! plugin ||
			! plugin.screenshots ||
			plugin.screenshots.length === 0
		) {
			console.warn( 'Plugin has no screenshots' );
			return;
		}

		try {
			this.lightbox.isOpen = true;
			this.lightbox.currentPlugin = plugin;
			this.lightbox.screenshots = plugin.screenshots;
			this.lightbox.currentIndex = Math.max(
				0,
				Math.min( initialIndex, plugin.screenshots.length - 1 )
			);

			// Update content
			const pluginName = this.sanitizeAndDecodeText(
				plugin.name || 'Plugin'
			);
			this.lightbox.title.textContent = pluginName;

			this.updateLightboxImage();

			// Show lightbox
			this.lightbox.element.style.display = 'flex';
			document.body.style.overflow = 'hidden';

			// Focus close button for accessibility
			setTimeout( () => {
				this.lightbox.closeButton?.focus();
			}, 100 );
		} catch ( error ) {
			// Error opening lightbox
		}
	}

	/**
	 * Close lightbox
	 */
	closeLightbox() {
		if ( ! this.lightbox.element || ! this.lightbox.isOpen ) {
			return;
		}

		try {
			this.lightbox.isOpen = false;
			this.lightbox.currentPlugin = null;
			this.lightbox.screenshots = [];

			this.lightbox.element.style.display = 'none';
			document.body.style.overflow = '';
		} catch ( error ) {
			// Error closing lightbox
		}
	}

	/**
	 * Navigate lightbox images
	 */
	navigateLightbox( direction ) {
		if (
			! this.lightbox.isOpen ||
			! this.lightbox.screenshots ||
			this.lightbox.screenshots.length <= 1
		) {
			return;
		}

		this.lightbox.currentIndex += direction;

		// Wrap around
		if ( this.lightbox.currentIndex < 0 ) {
			this.lightbox.currentIndex = this.lightbox.screenshots.length - 1;
		} else if (
			this.lightbox.currentIndex >= this.lightbox.screenshots.length
		) {
			this.lightbox.currentIndex = 0;
		}

		this.updateLightboxImage();
	}

	/**
	 * Update lightbox image and counter
	 */
	updateLightboxImage() {
		if (
			! this.lightbox.screenshots ||
			this.lightbox.screenshots.length === 0
		) {
			return;
		}

		try {
			const screenshot =
				this.lightbox.screenshots[ this.lightbox.currentIndex ];
			const pluginName = this.sanitizeAndDecodeText(
				this.lightbox.currentPlugin?.name || 'Plugin'
			);

			this.lightbox.image.src = screenshot.url;
			this.lightbox.image.alt = `${ pluginName } screenshot ${
				this.lightbox.currentIndex + 1
			}`;

			// Update counter
			this.lightbox.footer.textContent = `${
				this.lightbox.currentIndex + 1
			} / ${ this.lightbox.screenshots.length }`;

			// Show/hide navigation buttons
			if ( this.lightbox.screenshots.length <= 1 ) {
				this.lightbox.prevButton.style.display = 'none';
				this.lightbox.nextButton.style.display = 'none';
			} else {
				this.lightbox.prevButton.style.display = 'flex';
				this.lightbox.nextButton.style.display = 'flex';
			}
		} catch ( error ) {
			console.error( 'Error updating lightbox image:', error );
		}
	}

	/**
	 * Render the complete interface - browse only
	 */
	renderInterface() {
		this.block.innerHTML = '';

		const container = this.createElement( 'div', {
			class: 'wps-browse-interface',
		} );

		// Header
		const header = this.createElement( 'div', {
			class: 'wps-search-block__header',
		} );
		header.appendChild(
			this.createElement(
				'h2',
				{ class: 'wps-search-block__title' },
				'WordPress Plugin Directory'
			)
		);
		header.appendChild(
			this.createElement(
				'p',
				{ class: 'wps-search-block__description' },
				'Browse popular WordPress plugins from the official directory.'
			)
		);

		// Controls
		const controls = this.createElement( 'div', {
			class: 'wps-search-block__controls',
		} );

		// Simple filters
		if ( this.state.showFilters ) {
			const filterControls = this.createElement( 'div', {
				class: 'wps-filter-controls',
			} );
			const filterRow = this.createElement( 'div', {
				class: 'wps-filter-row',
			} );

			// Sort by - using WordPress core classes
			const sortItem = this.createElement( 'div', {
				class: 'wps-filter-item',
			} );
			sortItem.appendChild(
				this.createElement( 'label', {}, 'Sort by' )
			);
			const sortSelect = this.createElement( 'select', {
				class: 'components-select-control__input',
			} );

			const sortOptions = [
				{ value: 'popular', label: 'Most Popular' },
				{ value: 'new', label: 'Newest' },
				{ value: 'updated', label: 'Recently Updated' },
			];

			sortOptions.forEach( ( option ) => {
				const optionElement = this.createElement(
					'option',
					{ value: option.value },
					option.label
				);
				if ( option.value === this.state.sortBy ) {
					optionElement.selected = true;
				}
				sortSelect.appendChild( optionElement );
			} );

			sortItem.appendChild( sortSelect );
			filterRow.appendChild( sortItem );

			// Only with screenshots toggle
			const screenshotsToggle = this.createElement( 'div', {
				class: 'wps-toggle-item',
			} );
			const screenshotsCheckbox = this.createElement( 'input', {
				type: 'checkbox',
				id: 'wps-screenshots-only',
			} );
			screenshotsCheckbox.checked = this.state.onlyWithScreenshots;
			const screenshotsLabel = this.createElement(
				'label',
				{
					for: 'wps-screenshots-only',
				},
				'Only show plugins with screenshots'
			);

			screenshotsToggle.appendChild( screenshotsCheckbox );
			screenshotsToggle.appendChild( screenshotsLabel );
			filterRow.appendChild( screenshotsToggle );

			filterControls.appendChild( filterRow );
			controls.appendChild( filterControls );

			// Store filter element references
			this.filterElements = {
				sortSelect,
				screenshotsCheckbox,
			};
		}

		// Results info
		const resultsInfo = this.createElement( 'div', {
			class: 'wps-results-info',
			style: 'display: none;',
		} );
		const resultsCount = this.createElement( 'span', {
			class: 'wps-results-count',
		} );

		resultsInfo.appendChild( resultsCount );

		// Results
		const results = this.createElement( 'div', {
			class: 'wps-search-block__results',
		} );
		const grid = this.createElement( 'div', { class: 'wps-plugin-grid' } );
		const loading = this.createElement( 'div', {
			class: 'wps-loading',
			style: 'display: none;',
		} );
		loading.appendChild(
			this.createElement( 'div', { class: 'wps-spinner' } )
		);
		loading.appendChild(
			this.createElement( 'p', {}, 'Loading plugins...' )
		);

		results.appendChild( grid );
		results.appendChild( loading );

		// Load More button with WordPress classes
		const loadMoreContainer = this.createElement( 'div', {
			class: 'wps-load-more-container',
			style: 'display: none;',
		} );

		// FIXED: Create load more button with WordPress structure
		const loadMoreButtonContainer = this.createButton(
			'Load More Plugins',
			() => this.loadMorePlugins()
		);

		const loadMoreSpinner = this.createElement( 'div', {
			class: 'wps-load-more-spinner',
			style: 'display: none;',
		} );
		loadMoreSpinner.appendChild(
			this.createElement( 'div', { class: 'wps-spinner' } )
		);
		loadMoreSpinner.appendChild(
			this.createElement( 'span', {}, 'Loading more...' )
		);

		loadMoreContainer.appendChild( loadMoreButtonContainer.container );
		loadMoreContainer.appendChild( loadMoreSpinner );

		// Pagination (kept as fallback)
		const pagination = this.createElement( 'div', {
			class: 'wps-pagination',
		} );

		container.appendChild( header );
		container.appendChild( controls );
		container.appendChild( resultsInfo );
		container.appendChild( results );
		container.appendChild( loadMoreContainer );
		container.appendChild( pagination );

		this.block.appendChild( container );

		// Store references
		this.elements = {
			resultsInfo,
			resultsCount,
			grid,
			loading,
			pagination,
			loadMoreContainer,
			loadMoreButton: loadMoreButtonContainer.link,
			loadMoreSpinner,
		};
	}

	/**
	 * Bind events for all interactive elements
	 */
	bindEvents() {
		// Filter controls
		if ( this.filterElements ) {
			// Sort by
			this.filterElements.sortSelect.addEventListener(
				'change',
				( e ) => {
					this.state.sortBy = e.target.value;
					this.state.currentPage = 1;
					this.state.plugins = [];
					this.performSearch();
				}
			);

			// Screenshots only toggle
			this.filterElements.screenshotsCheckbox.addEventListener(
				'change',
				async ( e ) => {
					this.state.onlyWithScreenshots = e.target.checked;

					// If toggling ON, apply filter to current results immediately
					if (
						this.state.onlyWithScreenshots &&
						this.state.plugins.length > 0
					) {
						this.setLoading( true );
						await this.applyScreenshotFilter();
						this.renderResults();
						this.updateResultsInfo();
						this.setLoading( false );
					} else if ( ! this.state.onlyWithScreenshots ) {
						// If toggling OFF, refresh browse to show all plugins
						this.state.currentPage = 1;
						this.state.plugins = [];
						this.performSearch();
					}
				}
			);
		}
	}

	/**
	 * Load more plugins with proper screenshot filtering
	 */
	async loadMorePlugins() {
		if ( ! this.state.hasMorePages || this.state.isLoadingMore ) {
			return;
		}

		this.state.currentPage++;
		this.state.isLoadingMore = true;

		// Show load more spinner
		this.elements.loadMoreButton.parentNode.style.display = 'none';
		this.elements.loadMoreSpinner.style.display = 'flex';

		try {
			// FIXED: Load plugins with proper screenshot filtering
			await this.performSearch( true );
		} catch ( error ) {
			console.error( 'Error loading more plugins:', error );
			// Show error and re-enable button
			this.elements.loadMoreSpinner.style.display = 'none';
			this.elements.loadMoreButton.parentNode.style.display =
				'inline-block';
			this.elements.loadMoreButton.textContent = 'Try Loading More';
		} finally {
			this.state.isLoadingMore = false;
		}
	}

	/**
	 * Reset filters to defaults
	 */
	resetFilters() {
		this.state.sortBy = this.attributes.defaultSort || 'popular';
		this.state.onlyWithScreenshots = false;
		this.state.currentPage = 1;
		this.state.plugins = [];

		// Update UI
		if ( this.filterElements ) {
			this.filterElements.sortSelect.value = this.state.sortBy;
			this.filterElements.screenshotsCheckbox.checked = this.state.onlyWithScreenshots;
		}

		this.performSearch();
	}

	/**
	 * Browse plugins with current parameters
	 *
	 * @param {boolean} appendMode - Whether to append results or replace them
	 */
	async performSearch( appendMode = false ) {
		if ( this.currentRequest ) {
			this.currentRequest.abort();
		}

		if ( ! appendMode ) {
			this.setLoading( true );
		}

		// Build browse parameters
		const params = {
			action: 'query_plugins',
			per_page: this.state.onlyWithScreenshots
				? Math.min( 100, this.state.resultsPerPage * 3 ).toString()
				: this.state.resultsPerPage.toString(),
			page: this.state.currentPage.toString(),
		};
		
		// Debug: Log browse parameters
		console.log( 'WordPress Plugin Browse: Browse params:', params );

		// Handle sorting
		if ( this.state.sortBy === 'new' ) {
			params.browse = 'new';
		} else if ( this.state.sortBy === 'updated' ) {
			params.browse = 'updated';
		} else {
			params.browse = 'popular';
		}
		
		// Debug logging - show final params
		console.log( 'Final browse params:', params );

		try {
			this.currentRequest = new AbortController();

		const url = new URL(
			'/wp-json/wordpress-plugin-search/v1/query',
			window.location.origin
		);
		Object.entries( params ).forEach( ( [ key, value ] ) => {
			url.searchParams.set( key, value );
		} );
		
		// Debug: Log final URL
		console.log( 'WordPress Plugin Search: Final URL:', url.toString() );

			const response = await fetch( url.toString(), {
				headers: {
					'Content-Type': 'application/json',
					...( this.restNonce && { 'X-WP-Nonce': this.restNonce } ),
				},
				signal: this.currentRequest.signal,
				credentials: 'same-origin',
			} );

			if ( ! response.ok ) {
				throw new Error( `HTTP ${ response.status }` );
			}

			const data = await response.json();

			// Debug logging
			console.log( 'API Response:', data );

			// Validate response structure
			if ( ! data || typeof data !== 'object' ) {
				throw new Error( 'Invalid response format from server' );
			}

			let newPlugins = Array.isArray( data.plugins ) ? data.plugins : [];
			this.state.totalResults = parseInt( data.info?.results ) || 0;

			console.log(
				`Found ${ newPlugins.length } plugins, total results: ${ this.state.totalResults }`
			);

			// Check if there are more pages
			const totalPages = Math.ceil(
				this.state.totalResults / this.state.resultsPerPage
			);
			this.state.hasMorePages = this.state.currentPage < totalPages;

			// Add screenshots for all plugins
			this.addScreenshotUrls( newPlugins );

			// Apply client-side filtering for advanced options
			newPlugins = this.applyClientFilters( newPlugins );

			// FIXED: Apply screenshot filtering BEFORE appending
			if ( this.state.onlyWithScreenshots ) {
				newPlugins =
					await this.filterPluginsWithScreenshots( newPlugins );
			}

			// Append or replace plugins
			if ( appendMode && this.state.plugins.length > 0 ) {
				// Append new plugins, avoiding duplicates
				const existingSlugs = new Set(
					this.state.plugins.map( ( p ) => p.slug )
				);
				const uniqueNewPlugins = newPlugins.filter(
					( p ) => ! existingSlugs.has( p.slug )
				);
				this.state.plugins = [
					...this.state.plugins,
					...uniqueNewPlugins,
				];
			} else {
				// Replace plugins for new search
				this.state.plugins = newPlugins;
			}

			this.renderResults( appendMode );
			this.updateLoadMoreButton();
			this.updateResultsInfo();
		} catch ( error ) {
			if ( error.name !== 'AbortError' ) {
				console.error( 'Search error:', error );

				// Handle specific error types
				let errorMessage = 'Failed to search plugins.';

				if ( error.message.includes( 'HTTP 503' ) ) {
					errorMessage =
						'WordPress.org plugin directory is temporarily unavailable. Please try again later.';
				} else if ( error.message.includes( 'HTTP 502' ) ) {
					errorMessage =
						'Unable to connect to plugin directory. Please check your internet connection.';
				} else if ( error.message.includes( 'HTTP 404' ) ) {
					errorMessage =
						'Search service not found. Please refresh the page and try again.';
				} else if (
					error.name === 'TypeError' &&
					error.message.includes( 'fetch' )
				) {
					errorMessage =
						'Network error. Please check your internet connection.';
				}

				if ( ! appendMode ) {
					this.renderError( errorMessage );
				}
			}
		} finally {
			if ( ! appendMode ) {
				this.setLoading( false );
			}
			this.currentRequest = null;

			// Hide load more spinner
			this.elements.loadMoreSpinner.style.display = 'none';
		}
	}

	/**
	 * Apply client-side filtering to plugins
	 *
	 * @param {Array} plugins - Array of plugin objects
	 * @return {Array} Filtered array of plugins
	 */
	applyClientFilters( plugins ) {
		// For browse-only mode, just return plugins as-is
		// The server-side sorting handles the main sorting logic
		return [ ...plugins ];
	}

	/**
	 * Add screenshot URLs to plugins
	 */
	addScreenshotUrls( plugins ) {
		for ( const plugin of plugins ) {
			if ( plugin.slug ) {
				// Get all available screenshots (1-10)
				plugin.screenshots = [];
				for ( let i = 1; i <= 10; i++ ) {
					plugin.screenshots.push( {
						id: i,
						url: `https://ps.w.org/${ plugin.slug }/assets/screenshot-${ i }.png`,
					} );
				}
				plugin.primaryScreenshot = plugin.screenshots[ 0 ]?.url;
				plugin.currentScreenshotIndex = 0;
			}
		}
	}

	/**
	 * FIXED: Check if plugin has screenshots with caching
	 */
	async pluginHasScreenshots( plugin ) {
		if ( ! plugin.slug ) return false;

		// Check cache first
		if ( this.state.screenshotCache.has( plugin.slug ) ) {
			return this.state.screenshotCache.get( plugin.slug );
		}

		return new Promise( ( resolve ) => {
			// eslint-disable-next-line no-undef
			const img = new Image();
			const timeout = setTimeout( () => {
				img.onload = null;
				img.onerror = null;
				this.state.screenshotCache.set( plugin.slug, false );
				resolve( false );
			}, 2000 ); // Increased timeout

			img.onload = () => {
				clearTimeout( timeout );
				this.state.screenshotCache.set( plugin.slug, true );
				resolve( true );
			};

			img.onerror = () => {
				clearTimeout( timeout );
				this.state.screenshotCache.set( plugin.slug, false );
				resolve( false );
			};

			img.src = `https://ps.w.org/${ plugin.slug }/assets/screenshot-1.png`;
		} );
	}

	/**
	 * Filter plugins to only include those with screenshots
	 *
	 * @param {Array} plugins - Array of plugin objects
	 * @return {Array} Array of plugins that have screenshots
	 */
	async filterPluginsWithScreenshots( plugins ) {
		if ( ! plugins || plugins.length === 0 ) {
			return [];
		}

		const pluginsWithScreenshots = [];

		// Process plugins in smaller batches to avoid overwhelming the browser
		const batchSize = 3;
		const batches = [];

		for ( let i = 0; i < plugins.length; i += batchSize ) {
			batches.push( plugins.slice( i, i + batchSize ) );
		}

		for ( const batch of batches ) {
			const batchPromises = batch.map( async ( plugin ) => {
				if ( plugin.slug ) {
					const hasScreenshots =
						await this.pluginHasScreenshots( plugin );
					if ( hasScreenshots ) {
						return plugin;
					}
				}
				return null;
			} );

			const batchResults = await Promise.allSettled( batchPromises );

			batchResults.forEach( ( result ) => {
				if ( result.status === 'fulfilled' && result.value ) {
					pluginsWithScreenshots.push( result.value );
				}
			} );

			// Small delay between batches to prevent rate limiting
			if ( batches.indexOf( batch ) < batches.length - 1 ) {
				await new Promise( ( resolve ) => setTimeout( resolve, 150 ) );
			}
		}

		console.log(
			`Filtered ${ plugins.length } plugins down to ${ pluginsWithScreenshots.length } with screenshots`
		);
		return pluginsWithScreenshots;
	}

	/**
	 * FIXED: Apply screenshot filter to current plugins
	 */
	async applyScreenshotFilter() {
		if (
			! this.state.onlyWithScreenshots ||
			this.state.plugins.length === 0
		) {
			return;
		}

		this.state.plugins = await this.filterPluginsWithScreenshots(
			this.state.plugins
		);
	}

	/**
	 * Set loading state
	 *
	 * @param {boolean} loading - Whether to show loading state
	 */
	setLoading( loading ) {
		this.state.isLoading = loading;

		if ( loading ) {
			this.elements.loading.style.display = 'block';
			this.elements.grid.style.opacity = '0.6';
		} else {
			this.elements.loading.style.display = 'none';
			this.elements.grid.style.opacity = '1';
		}
	}

	/**
	 * Update load more button visibility and state
	 */
	updateLoadMoreButton() {
		// FIXED: Better logic for load more with screenshot filtering
		const shouldShowLoadMore =
			this.state.hasMorePages && this.state.plugins.length > 0;

		if ( shouldShowLoadMore ) {
			this.elements.loadMoreContainer.style.display = 'block';
			this.elements.loadMoreButton.parentNode.style.display =
				'inline-block';
			this.elements.loadMoreButton.textContent = 'Load More Plugins';
			this.elements.loadMoreButton.disabled = false;
		} else {
			this.elements.loadMoreContainer.style.display = 'none';
		}
	}

	/**
	 * Update results info display
	 */
	updateResultsInfo() {
		if ( this.state.plugins.length > 0 ) {
			this.elements.resultsInfo.style.display = 'flex';

			let countText = `Showing ${ this.state.plugins.length.toLocaleString() } plugin${
				this.state.plugins.length !== 1 ? 's' : ''
			}`;

			// FIXED: Better messaging for screenshot filter
			if ( this.state.onlyWithScreenshots ) {
				countText += ' with screenshots';
			}

			if ( this.state.hasMorePages && ! this.state.onlyWithScreenshots ) {
				countText += ` (${ this.state.totalResults.toLocaleString() } total available)`;
			}

			this.elements.resultsCount.textContent = countText;
		} else {
			this.elements.resultsInfo.style.display = 'none';
		}
	}

	/**
	 * Determine if a plugin is a "hidden gem"
	 */
	isHiddenGem( plugin ) {
		// Criteria for hidden gems: good rating but low install count
		const hasGoodRating = plugin.rating && plugin.rating >= 80;
		const hasLowInstalls =
			! plugin.active_installs || plugin.active_installs < 10000;
		const hasRecentUpdate =
			plugin.last_updated &&
			new Date( plugin.last_updated ) >
				new Date( Date.now() - 365 * 24 * 60 * 60 * 1000 );

		return hasGoodRating && hasLowInstalls && hasRecentUpdate;
	}

	/**
	 * Create enhanced screenshot slider with robust event handling
	 */
	createScreenshotSlider( plugin, pluginIndex ) {
		const sliderContainer = this.createElement( 'div', {
			class: 'wps-screenshot-slider',
		} );

		// If no screenshots available, show placeholder immediately
		if ( ! plugin.screenshots || plugin.screenshots.length === 0 ) {
			const placeholder = this.createElement( 'div', {
				class: 'wps-no-screenshot',
			} );
			placeholder.innerHTML =
				'<span>No screenshots available</span>';
			sliderContainer.appendChild( placeholder );
			return sliderContainer;
		}

		// Build the slider with robust event handling
		this.buildScreenshotSlider(
			sliderContainer,
			plugin,
			plugin.screenshots,
			pluginIndex
		);

		return sliderContainer;
	}

	/**
	 * Build the screenshot slider interface with robust lightbox integration
	 */
	buildScreenshotSlider( container, plugin, screenshots, pluginIndex ) {
		const currentIndex = plugin.currentScreenshotIndex || 0;

		// Main image container
		const mainImage = this.createElement( 'div', {
			class: 'wps-main-screenshot',
		} );
		const img = this.createElement( 'img', {
			src: screenshots[ currentIndex ]?.url || screenshots[ 0 ]?.url,
			alt: `${ this.sanitizeAndDecodeText( plugin.name ) } screenshot`,
			loading: 'lazy',
		} );

		// Handle image load errors
		img.addEventListener( 'error', ( e ) => {
			// Show placeholder if image fails to load
			mainImage.innerHTML =
				'<div class="wps-no-screenshot"><span>No screenshots available</span></div>';
		} );

		// ROBUST: Click to open lightbox with comprehensive error handling
		img.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			e.preventDefault();

			try {
				this.openLightbox( plugin, plugin.currentScreenshotIndex || 0 );
			} catch ( error ) {
				// Error opening lightbox from click
			}
		} );

		mainImage.appendChild( img );
		container.appendChild( mainImage );

		// Thumbnail navigation (show max 5 thumbs)
		if ( screenshots.length > 1 ) {
			const thumbs = this.createElement( 'div', {
				class: 'wps-screenshot-thumbs',
			} );

			screenshots.slice( 0, 5 ).forEach( ( screenshot, index ) => {
				const thumb = this.createElement( 'div', {
					class: `wps-screenshot-thumb ${
						index === currentIndex ? 'active' : ''
					}`,
					'data-index': index,
					tabindex: '0',
					'aria-label': `Screenshot ${ index + 1 }`,
				} );

				const thumbImg = this.createElement( 'img', {
					src: screenshot.url,
					alt: `Screenshot ${ screenshot.id }`,
					loading: 'lazy',
				} );

				// Handle thumb image errors
				thumbImg.addEventListener( 'error', ( e ) => {
					e.target.parentNode.style.display = 'none';
				} );

				// ROBUST: Click to change main image and open lightbox
				thumb.addEventListener( 'click', ( e ) => {
					e.stopPropagation();
					e.preventDefault();

					try {
						this.goToScreenshot( plugin, screenshots, img, index );
						this.updateThumbnailHighlight( thumbs, index );
						this.openLightbox( plugin, index );
					} catch ( error ) {
						console.error(
							'Error opening lightbox from thumbnail:',
							error
						);
					}
				} );

				// Keyboard navigation for thumbnails
				thumb.addEventListener( 'keydown', ( e ) => {
					if ( e.key === 'Enter' || e.key === ' ' ) {
						e.preventDefault();
						e.stopPropagation();

						try {
							this.goToScreenshot(
								plugin,
								screenshots,
								img,
								index
							);
							this.updateThumbnailHighlight( thumbs, index );
							this.openLightbox( plugin, index );
						} catch ( error ) {
							console.error(
								'Error opening lightbox from keyboard:',
								error
							);
						}
					}
				} );

				thumb.appendChild( thumbImg );
				thumbs.appendChild( thumb );
			} );

			container.appendChild( thumbs );
		}
	}

	/**
	 * Go to specific screenshot
	 */
	goToScreenshot( plugin, screenshots, imgElement, index ) {
		if ( index < 0 || index >= screenshots.length ) return;

		plugin.currentScreenshotIndex = index;

		// Update main image
		imgElement.src = screenshots[ index ].url;
		imgElement.alt = `${ this.sanitizeAndDecodeText(
			plugin.name
		) } screenshot ${ index + 1 }`;
	}

	/**
	 * Update thumbnail highlight
	 */
	updateThumbnailHighlight( thumbsContainer, activeIndex ) {
		const thumbs = thumbsContainer.querySelectorAll(
			'.wps-screenshot-thumb'
		);
		thumbs.forEach( ( thumb, index ) => {
			if ( index === activeIndex ) {
				thumb.classList.add( 'active' );
			} else {
				thumb.classList.remove( 'active' );
			}
		} );
	}

	/**
	 * Render results
	 */
	renderResults( appendMode = false ) {
		if ( ! appendMode ) {
			this.elements.grid.innerHTML = '';
		}

		if ( this.state.plugins.length === 0 && ! appendMode ) {
			const noResults = this.createElement( 'div', {
				class: 'wps-no-results',
			} );

			if ( this.hasActiveFilters() ) {
				noResults.innerHTML = `
					<p>No plugins found matching your filter criteria.</p>
					<div class="wps-search-suggestion">
						<p>Try:</p>
						<ul>
							<li>Changing the sort order</li>
							<li>Disabling the screenshots filter</li>
						</ul>
					</div>
				`;
			} else {
				noResults.textContent = 'No plugins available at the moment.';
			}

			this.elements.grid.appendChild( noResults );
			return;
		}

		// Get plugins to render
		const pluginsToRender = appendMode
			? this.state.plugins.slice( -this.state.resultsPerPage )
			: this.state.plugins;

		pluginsToRender.forEach( ( plugin, index ) => {
			const actualIndex = appendMode
				? this.state.plugins.length - this.state.resultsPerPage + index
				: index;
			const item = this.renderPluginItem( plugin, actualIndex );
			if ( item ) {
				this.elements.grid.appendChild( item );
			}
		} );
	}

	/**
	 * Check if any filters are active
	 */
	hasActiveFilters() {
		return (
			this.state.onlyWithScreenshots ||
			this.state.sortBy !== ( this.attributes.defaultSort || 'popular' )
		);
	}

	/**
	 * Render individual plugin item
	 *
	 * @param {Object} plugin - Plugin object
	 * @param {number} index - Index of the plugin in the list
	 * @return {HTMLElement|null} Rendered plugin element or null
	 */
	renderPluginItem( plugin, index ) {
		if ( ! plugin || ! plugin.name ) {
			return null;
		}

		const isGem = this.isHiddenGem( plugin );

		const item = this.createElement( 'div', {
			class: `wps-plugin-item ${ isGem ? 'wps-hidden-gem' : '' }`,
			tabindex: '0',
		} );

		// Screenshot slider comes FIRST for consistent layout
		const slider = this.createScreenshotSlider( plugin, index );
		item.appendChild( slider );

		// Plugin info section comes AFTER screenshot for proper alignment
		const info = this.createElement( 'div', { class: 'wps-plugin-info' } );

		// Title - properly decode HTML entities
		const title = this.createElement(
			'h3',
			{ class: 'wps-plugin-title' },
			this.sanitizeAndDecodeText( plugin.name )
		);
		info.appendChild( title );

		// Short description - properly styled and positioned
		if ( plugin.short_description ) {
			const description = this.createElement(
				'p',
				{
					class: 'wps-plugin-description',
					style: 'font-size: 0.9rem; color: #e0e0e0; line-height: 1.4; margin: 0.5rem 0 1rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;',
				},
				this.sanitizeAndDecodeText( plugin.short_description )
			);
			info.appendChild( description );
		}

		// Meta (rating and installs)
		const meta = this.createElement( 'div', { class: 'wps-plugin-meta' } );

		// Rating
		if ( plugin.rating ) {
			const rating = Math.round( plugin.rating / 20 );
			const stars = '★'.repeat( rating ) + '☆'.repeat( 5 - rating );
			const ratingDiv = this.createElement( 'div', {
				class: 'wps-plugin-rating',
			} );
			ratingDiv.innerHTML = `<span class="wps-rating-stars">${ stars }</span> <span class="wps-rating-text">(${
				plugin.num_ratings || 0
			})</span>`;
			meta.appendChild( ratingDiv );
		}

		// Installs
		if ( plugin.active_installs ) {
			const installs = this.createElement(
				'div',
				{ class: 'wps-plugin-installs' },
				`${ plugin.active_installs.toLocaleString() }+ installs`
			);
			meta.appendChild( installs );
		}

		info.appendChild( meta );
		item.appendChild( info );

		// Click handler for WordPress.org link
		item.addEventListener( 'click', ( e ) => {
			// Don't trigger if clicking on navigation elements or images
			if (
				e.target.closest(
					'.wps-screenshot-thumb, .wps-main-screenshot img'
				)
			) {
				return;
			}

			if ( plugin.slug ) {
				const url = `https://wordpress.org/plugins/${ encodeURIComponent(
					plugin.slug
				) }/`;
				window.open( url, '_blank', 'noopener,noreferrer' );
			}
		} );

		return item;
	}


	/**
	 * Render error message
	 *
	 * @param {string} message - Error message to display
	 */
	renderError( message ) {
		this.elements.grid.innerHTML = '';

		const errorDiv = this.createElement( 'div', { class: 'wps-error' } );
		errorDiv.innerHTML = `
			<h3>Error</h3>
			<p>${ this.sanitizeInput( message ) }</p>
		`;

		// Create retry button with WordPress structure
		const retryButtonContainer = this.createButton( 'Try Again', () =>
			this.performSearch()
		);
		errorDiv.appendChild( retryButtonContainer.container );

		this.elements.grid.appendChild( errorDiv );
	}
}
