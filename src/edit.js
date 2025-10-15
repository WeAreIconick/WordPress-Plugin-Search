/**
 * Retrieves the translation of text.
 *
 * @see https://developer.wordpress.org/block-editor/reference-guides/packages/packages-i18n/
 */
import { __ } from '@wordpress/i18n';

/**
 * React hook that is used to mark the block wrapper element.
 * It provides all the necessary props like the class name.
 *
 * @see https://developer.wordpress.org/block-editor/reference-guides/packages/packages-block-editor/#useblockprops
 */
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import {
	PanelBody,
	TextControl,
	SelectControl,
	ToggleControl,
	Spinner,
	Notice,
	Modal,
	Button,
} from '@wordpress/components';
import { useState, useEffect } from '@wordpress/element';
import { store as coreDataStore } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';

/**
 * Lets webpack process CSS, SASS or SCSS files referenced in JavaScript files.
 * Those files can contain any CSS code that gets applied to the editor.
 *
 * @see https://www.npmjs.com/package/@wordpress/scripts#using-css
 */
import './editor.scss';

/**
 * The edit function describes the structure of your block in the context of the
 * editor. This represents what the editor will render when the block is used.
 *
 * @see https://developer.wordpress.org/block-editor/reference-guides/block-api/block-edit-save/#edit
 *
 * @return {Element} Element to render.
 */
export default function Edit( { attributes, setAttributes } ) {
	const { resultsPerPage, defaultSort, showFilters } = attributes;

	const [ previewPlugins, setPreviewPlugins ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ modalOpen, setModalOpen ] = useState( false );
	const [ modalPlugin, setModalPlugin ] = useState( null );
	const [ modalImageIndex, setModalImageIndex ] = useState( 0 );

	// Use WordPress core data store for REST API calls
	const { restNonce } = useSelect( ( select ) => {
		const { getCurrentUser } = select( coreDataStore );
		const user = getCurrentUser();
		return {
			restNonce: user?.meta?.rest_nonce || window.wpApiSettings?.nonce,
		};
	}, [] );

	// Load preview data
	useEffect( () => {
		const loadPreviewData = async () => {
			try {
				setIsLoading( true );
				setError( null );

				// Load plugins for preview based on defaultSort
				const pluginParams = new URLSearchParams( {
					action: 'query_plugins',
					browse:
						defaultSort === 'newest'
							? 'new'
							: defaultSort === 'updated'
							? 'updated'
							: 'popular',
					per_page: '6',
				} );

				const pluginResponse = await fetch(
					`/wp-json/wordpress-plugin-search/v1/query?${ pluginParams }`,
					{
						headers: {
							'Content-Type': 'application/json',
							...( restNonce && { 'X-WP-Nonce': restNonce } ),
						},
					}
				);

				if ( pluginResponse.ok ) {
					const pluginData = await pluginResponse.json();
					if (
						pluginData.plugins &&
						Array.isArray( pluginData.plugins )
					) {
						const pluginsWithScreenshots = pluginData.plugins.map(
							( plugin ) => {
								if ( plugin.slug ) {
									// Generate screenshot URLs for slider
									plugin.screenshots = [];
									for ( let i = 1; i <= 5; i++ ) {
										plugin.screenshots.push( {
											id: i,
											url: `https://ps.w.org/${ plugin.slug }/assets/screenshot-${ i }.png`,
										} );
									}
									plugin.primaryScreenshot =
										plugin.screenshots[ 0 ]?.url;
								}
								return plugin;
							}
						);
						setPreviewPlugins( pluginsWithScreenshots );
					}
				} else {
					throw new Error(
						`Failed to load plugins: ${ pluginResponse.status }`
					);
				}
			} catch ( loadError ) {
				console.error( 'Error loading preview data:', loadError );
				setError( loadError.message );
				setPreviewPlugins( [] );
			} finally {
				setIsLoading( false );
			}
		};

		loadPreviewData();
	}, [ restNonce, defaultSort ] );

	const resultsPerPageOptions = [
		{ label: '12', value: 12 },
		{ label: '24', value: 24 },
		{ label: '48', value: 48 },
	];

	const sortOptions = [
		{
			label: __( 'Most Popular', 'wordpress-plugin-search-block-wp' ),
			value: 'popular',
		},
		{
			label: __( 'Recently Updated', 'wordpress-plugin-search-block-wp' ),
			value: 'updated',
		},
		{
			label: __( 'Newest', 'wordpress-plugin-search-block-wp' ),
			value: 'new',
		},
	];

	// Open modal for screenshot viewing
	const openModal = ( plugin, imageIndex = 0 ) => {
		if ( ! plugin.screenshots || plugin.screenshots.length === 0 ) {
			return;
		}
		setModalPlugin( plugin );
		setModalImageIndex( imageIndex );
		setModalOpen( true );
	};

	// Close modal
	const closeModal = () => {
		setModalOpen( false );
		setModalPlugin( null );
		setModalImageIndex( 0 );
	};

	// Navigate modal images
	const navigateModal = ( direction ) => {
		if ( ! modalPlugin?.screenshots ) return;

		let newIndex = modalImageIndex + direction;
		if ( newIndex < 0 ) {
			newIndex = modalPlugin.screenshots.length - 1;
		} else if ( newIndex >= modalPlugin.screenshots.length ) {
			newIndex = 0;
		}
		setModalImageIndex( newIndex );
	};

	// Create screenshot slider for editor preview
	const createScreenshotSlider = ( plugin ) => {
		if ( ! plugin.screenshots || plugin.screenshots.length === 0 ) {
			return (
				<div className="wps-no-screenshot">
					<span>No screenshots available</span>
				</div>
			);
		}

		return (
			<div className="wps-screenshot-slider">
				<div
					className="wps-main-screenshot"
					onClick={ () => openModal( plugin, 0 ) }
					style={ { cursor: 'zoom-in' } }
				>
					<img
						src={ plugin.primaryScreenshot }
						alt={ `${ plugin.name } screenshot` }
						loading="lazy"
						onError={ ( e ) => {
							e.target.style.display = 'none';
							e.target.parentNode.innerHTML =
								'<div class="wps-no-screenshot"><span>No screenshots available</span></div>';
						} }
					/>
				</div>
				<div className="wps-screenshot-thumbs">
					{ plugin.screenshots
						.slice( 0, 5 )
						.map( ( screenshot, index ) => (
							<div
								key={ screenshot.id }
								className={ `wps-screenshot-thumb ${
									index === 0 ? 'active' : ''
								}` }
								onClick={ () => openModal( plugin, index ) }
								style={ { cursor: 'pointer' } }
							>
								<img
									src={ screenshot.url }
									alt={ `Screenshot ${ screenshot.id }` }
									loading="lazy"
									onError={ ( e ) => {
										e.target.parentNode.style.display =
											'none';
									} }
								/>
							</div>
						) ) }
				</div>
			</div>
		);
	};

	const renderPluginItem = ( plugin, index ) => {
		if ( ! plugin || ! plugin.name ) {
			return null;
		}

		const rating = plugin.rating ? Math.round( plugin.rating / 20 ) : 0;
		const stars = '★'.repeat( rating ) + '☆'.repeat( 5 - rating );

		return (
			<div key={ plugin.slug || index } className="wps-plugin-item">
				{ createScreenshotSlider( plugin ) }

				<div className="wps-plugin-info">
					<h3 className="wps-plugin-title">{ plugin.name }</h3>

					<div className="wps-plugin-meta">
						{ plugin.rating && (
							<div className="wps-plugin-rating">
								<span className="wps-rating-stars">
									{ stars }
								</span>
								<span className="wps-rating-text">
									({ plugin.num_ratings || 0 })
								</span>
							</div>
						) }

						{ plugin.active_installs && (
							<div className="wps-plugin-installs">
								{ plugin.active_installs.toLocaleString() }+
								installs
							</div>
						) }
					</div>
				</div>
			</div>
		);
	};

	return (
		<>
			<InspectorControls>
				<PanelBody
					title={ __(
						'Browse Settings',
						'wordpress-plugin-search-block-wp'
					) }
					initialOpen={ true }
				>
					<SelectControl
						label={ __(
							'Default Sort Order',
							'wordpress-plugin-search-block-wp'
						) }
						value={ defaultSort }
						options={ sortOptions }
						onChange={ ( value ) =>
							setAttributes( { defaultSort: value } )
						}
						help={ __(
							'Choose how plugins are sorted by default',
							'wordpress-plugin-search-block-wp'
						) }
					/>

					<SelectControl
						label={ __(
							'Results Per Page',
							'wordpress-plugin-search-block-wp'
						) }
						value={ resultsPerPage }
						options={ resultsPerPageOptions }
						onChange={ ( value ) =>
							setAttributes( {
								resultsPerPage: parseInt( value ),
							} )
						}
					/>

					<ToggleControl
						label={ __(
							'Show Filters',
							'wordpress-plugin-search-block-wp'
						) }
						checked={ showFilters }
						onChange={ ( value ) =>
							setAttributes( { showFilters: value } )
						}
						help={ __(
							'Display sorting and filtering options to users',
							'wordpress-plugin-search-block-wp'
						) }
					/>
				</PanelBody>
			</InspectorControls>

			<div { ...useBlockProps( { className: 'wps-search-block' } ) }>
				<div className="wps-search-block__header">
					<h2 className="wps-search-block__title">
						{ __(
							'WordPress Plugin Directory',
							'wordpress-plugin-search-block-wp'
						) }
					</h2>
					<p className="wps-search-block__description">
						{ __(
							'Browse popular WordPress plugins from the official directory.',
							'wordpress-plugin-search-block-wp'
						) }
					</p>
				</div>

				<div className="wps-search-block__controls">

					{ showFilters && (
						<div className="wps-filter-controls">
							<div className="wps-filter-row">
								<div className="wps-filter-item">
									<label>
										{ __(
											'Sort by',
											'wordpress-plugin-search-block-wp'
										) }
									</label>
									<select disabled>
										<option>
											{ sortOptions.find(
												( opt ) =>
													opt.value === defaultSort
											)?.label || 'Most Popular' }
										</option>
									</select>
								</div>
								<div className="wps-filter-item">
									<label>
										{ __(
											'Only with screenshots',
											'wordpress-plugin-search-block-wp'
										) }
									</label>
									<input type="checkbox" disabled />
								</div>
							</div>
						</div>
					) }
				</div>

				<div className="wps-search-block__results">
					{ error && (
						<Notice status="error" isDismissible={ false }>
							{ __(
								'Error loading plugins:',
								'wordpress-plugin-search-block-wp'
							) }{ ' ' }
							{ error }
						</Notice>
					) }

					{ isLoading ? (
						<div className="wps-loading">
							<Spinner />
							<p>
								{ __(
									'Loading plugin directory...',
									'wordpress-plugin-search-block-wp'
								) }
							</p>
						</div>
					) : (
						<div className="wps-plugin-grid">
							{ previewPlugins.length > 0 ? (
								previewPlugins.map( renderPluginItem )
							) : (
								<p className="wps-no-results">
									{ __(
										'No plugins to display. This is a preview in the editor.',
										'wordpress-plugin-search-block-wp'
									) }
								</p>
							) }
						</div>
					) }
				</div>

				<div className="wps-search-block__footer">
					<p className="wps-editor-note">
						{ __(
							'This is an editor preview. Full browsing, sorting, filtering, and screenshot viewing will work on the front end.',
							'wordpress-plugin-search-block-wp'
						) }
					</p>
				</div>
			</div>

			{ modalOpen && modalPlugin && (
				<Modal
					title={ modalPlugin.name }
					onRequestClose={ closeModal }
					isFullScreen={ false }
					size="large"
					className="wps-screenshot-modal"
				>
					<div style={ { padding: '1rem', textAlign: 'center' } }>
						{ modalPlugin.screenshots &&
							modalPlugin.screenshots[ modalImageIndex ] && (
								<img
									src={
										modalPlugin.screenshots[
											modalImageIndex
										].url
									}
									alt={ `${ modalPlugin.name } screenshot ${
										modalImageIndex + 1
									}` }
									style={ {
										maxWidth: '100%',
										maxHeight: '70vh',
										height: 'auto',
										borderRadius: '4px',
										boxShadow:
											'0 4px 12px rgba(0, 0, 0, 0.1)',
									} }
								/>
							) }

						{ modalPlugin.screenshots &&
							modalPlugin.screenshots.length > 1 && (
								<div
									style={ {
										display: 'flex',
										justifyContent: 'space-between',
										alignItems: 'center',
										marginTop: '1rem',
										padding: '0 1rem',
									} }
								>
									<Button
										isSecondary
										onClick={ () => navigateModal( -1 ) }
										disabled={ modalImageIndex === 0 }
									>
										{ __(
											'Previous',
											'wordpress-plugin-search-block-wp'
										) }
									</Button>

									<span
										style={ {
											color: '#666',
											fontSize: '0.9rem',
										} }
									>
										{ modalImageIndex + 1 } /{ ' ' }
										{ modalPlugin.screenshots.length }
									</span>

									<Button
										isSecondary
										onClick={ () => navigateModal( 1 ) }
										disabled={
											modalImageIndex ===
											modalPlugin.screenshots.length - 1
										}
									>
										{ __(
											'Next',
											'wordpress-plugin-search-block-wp'
										) }
									</Button>
								</div>
							) }
					</div>
				</Modal>
			) }
		</>
	);
}
