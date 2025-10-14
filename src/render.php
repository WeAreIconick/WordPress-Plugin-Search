<?php
/**
 * @see https://github.com/WordPress/gutenberg/blob/trunk/docs/reference-guides/block-api/block-metadata.md#render
 */

// Sanitize attributes
$search_term = isset( $attributes['searchTerm'] ) ? sanitize_text_field( $attributes['searchTerm'] ) : '';
$results_per_page = isset( $attributes['resultsPerPage'] ) ? max( 1, min( 100, (int) $attributes['resultsPerPage'] ) ) : 12;
$default_sort = isset( $attributes['defaultSort'] ) ? sanitize_text_field( $attributes['defaultSort'] ) : 'popular';
$show_filters = isset( $attributes['showFilters'] ) ? (bool) $attributes['showFilters'] : true;

// Build data attributes for JavaScript
$data_attributes = array(
	'data-search-term' => esc_attr( $search_term ),
	'data-results-per-page' => esc_attr( $results_per_page ),
	'data-default-sort' => esc_attr( $default_sort ),
	'data-show-filters' => esc_attr( $show_filters ? 'true' : 'false' ),
);

$block_wrapper_attributes = get_block_wrapper_attributes( $data_attributes );
?>

<div <?php echo $block_wrapper_attributes; ?>>
	<div class="wps-loading-initial" aria-live="polite">
		<div class="wps-spinner"></div>
		<p><?php echo esc_html__( 'Loading Plugin Search...', 'wordpress-plugin-search-block-wp' ); ?></p>
	</div>
	
	<noscript>
		<div class="wps-no-javascript">
			<h3><?php echo esc_html__( 'JavaScript Required', 'wordpress-plugin-search-block-wp' ); ?></h3>
			<p>
				<?php echo esc_html__( 'This plugin search requires JavaScript. Please visit', 'wordpress-plugin-search-block-wp' ); ?> 
				<a href="https://wordpress.org/plugins/" target="_blank" rel="noopener noreferrer">
					<?php echo esc_html__( 'WordPress.org Plugin Directory', 'wordpress-plugin-search-block-wp' ); ?>
				</a> 
				<?php echo esc_html__( 'directly.', 'wordpress-plugin-search-block-wp' ); ?>
			</p>
		</div>
	</noscript>
</div>