<?php
/**
 * Plugin Name:       WordPress.org Plugin Search
 * Description:       A simple plugin search interface for the WordPress.org repository.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            iconick
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wordpress-plugin-search-block-wp
 *
 * @package WordPressPluginSearch
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Registers the block
 */
if ( ! function_exists( 'wordpress_plugin_search_wordpress_plugin_search_block_init' ) ) {
	function wordpress_plugin_search_wordpress_plugin_search_block_init() {
		register_block_type( __DIR__ . '/build/' );
	}
	add_action( 'init', 'wordpress_plugin_search_wordpress_plugin_search_block_init' );
}

/**
 * Register REST API endpoint
 */
if ( ! function_exists( 'wordpress_plugin_search_register_api_endpoints' ) ) {
	function wordpress_plugin_search_register_api_endpoints() {
		register_rest_route( 'wordpress-plugin-search/v1', '/query', array(
			'methods' => 'GET',
			'callback' => 'wordpress_plugin_search_api_query',
			'permission_callback' => '__return_true',
			'args' => array(
				'action' => array(
					'required' => true,
					'type' => 'string',
					'enum' => array( 'query_plugins' ),
					'sanitize_callback' => 'sanitize_text_field',
				),
				'search' => array(
					'type' => 'string',
					'sanitize_callback' => 'sanitize_text_field',
				),
				'browse' => array(
					'type' => 'string',
					'enum' => array( 'popular', 'new', 'updated' ),
					'default' => 'popular',
					'sanitize_callback' => 'sanitize_text_field',
				),
				'per_page' => array(
					'type' => 'integer',
					'minimum' => 1,
					'maximum' => 100,
					'default' => 100,
				),
				'page' => array(
					'type' => 'integer',
					'minimum' => 1,
					'default' => 1,
				),
			),
		) );
	}
	add_action( 'rest_api_init', 'wordpress_plugin_search_register_api_endpoints' );
}

/**
 * Add test endpoint for debugging
 */
if ( ! function_exists( 'wordpress_plugin_search_register_test_endpoint' ) ) {
	function wordpress_plugin_search_register_test_endpoint() {
		register_rest_route( 'wordpress-plugin-search/v1', '/test', array(
			'methods' => 'GET',
			'callback' => function() {
				return array(
					'success' => true,
					'message' => 'Plugin search API is working',
					'timestamp' => current_time( 'mysql' ),
					'plugins_api_available' => function_exists( 'plugins_api' )
				);
			},
			'permission_callback' => '__return_true'
		) );
	}
	add_action( 'rest_api_init', 'wordpress_plugin_search_register_test_endpoint' );
}

/**
 * Add cache clearing endpoint for debugging
 */
if ( ! function_exists( 'wordpress_plugin_search_register_cache_endpoint' ) ) {
	function wordpress_plugin_search_register_cache_endpoint() {
		register_rest_route( 'wordpress-plugin-search/v1', '/clear-cache', array(
			'methods' => 'POST',
			'callback' => function() {
				global $wpdb;
				$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_wps_%'" );
				$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_wps_%'" );
				return array(
					'success' => true,
					'message' => 'Plugin search cache cleared',
					'timestamp' => current_time( 'mysql' )
				);
			},
			'permission_callback' => '__return_true'
		) );
	}
	add_action( 'rest_api_init', 'wordpress_plugin_search_register_cache_endpoint' );
}

/**
 * Add cache debugging endpoint
 */
if ( ! function_exists( 'wordpress_plugin_search_register_cache_debug_endpoint' ) ) {
	function wordpress_plugin_search_register_cache_debug_endpoint() {
		register_rest_route( 'wordpress-plugin-search/v1', '/cache-debug', array(
			'methods' => 'GET',
			'callback' => function() {
				global $wpdb;
				$transients = $wpdb->get_results( 
					"SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE '_transient_wps_%' ORDER BY option_name"
				);
				
				$debug_info = array();
				foreach ( $transients as $transient ) {
					$key = str_replace( '_transient_', '', $transient->option_name );
					$data = maybe_unserialize( $transient->option_value );
					$debug_info[] = array(
						'key' => $key,
						'has_data' => ! empty( $data ),
						'data_type' => gettype( $data ),
						'plugin_count' => isset( $data['plugins'] ) ? count( $data['plugins'] ) : 0
					);
				}
				
				return array(
					'total_transients' => count( $transients ),
					'transients' => $debug_info
				);
			},
			'permission_callback' => '__return_true'
		) );
	}
	add_action( 'rest_api_init', 'wordpress_plugin_search_register_cache_debug_endpoint' );
}

/**
 * Handle API queries
 */
if ( ! function_exists( 'wordpress_plugin_search_api_query' ) ) {
	function wordpress_plugin_search_api_query( $request ) {
		// Include admin functions
		if ( ! function_exists( 'plugins_api' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
		}
		
		$action = sanitize_text_field( $request->get_param( 'action' ) );
		
		if ( 'query_plugins' !== $action ) {
			return new WP_Error( 'invalid_action', 'Invalid action', array( 'status' => 400 ) );
		}
		
		// Build API parameters first
		$api_args = array();
		
		// Always set a default browse parameter
		$browse = $request->get_param( 'browse' );
		if ( $browse && in_array( $browse, array( 'popular', 'new', 'updated' ), true ) ) {
			$api_args['browse'] = $browse;
		} else {
			$api_args['browse'] = 'popular'; // Default to popular plugins
		}
		
		if ( $request->get_param( 'search' ) ) {
			$api_args['search'] = sanitize_text_field( $request->get_param( 'search' ) );
		}
		
		if ( $request->get_param( 'per_page' ) ) {
			$per_page = absint( $request->get_param( 'per_page' ) );
			if ( $per_page > 0 && $per_page <= 100 ) {
				$api_args['per_page'] = $per_page;
			}
		}
		
		if ( $request->get_param( 'page' ) ) {
			$page = absint( $request->get_param( 'page' ) );
			if ( $page > 0 ) {
				$api_args['page'] = $page;
			}
		}
		
		// Build cache key based on actual API parameters
		$cache_params = $api_args;
		$cache_key = 'wps_' . hash( 'sha256', wp_json_encode( $cache_params ) );
		
		// Debug: Log cache key and parameters
		error_log( 'WordPress Plugin Search: Cache key: ' . $cache_key );
		error_log( 'WordPress Plugin Search: Cache params: ' . wp_json_encode( $cache_params ) );
		
		// Check cache
		$cached_response = get_transient( $cache_key );
		if ( false !== $cached_response ) {
			error_log( 'WordPress Plugin Search: Returning cached response for key: ' . $cache_key );
			return rest_ensure_response( $cached_response );
		}
		
		error_log( 'WordPress Plugin Search: No cache found, making API request' );
		
		// Set fields for performance
		$api_args['fields'] = array(
			'icons' => true,
			'active_installs' => true,
			'short_description' => true,
			'rating' => true,
			'num_ratings' => true,
			'last_updated' => true,
			'downloaded' => true,
			'requires' => true,
			'tested' => true,
			'download_link' => true,
			'homepage' => true,
		);
		
		// Debug: Log what we're sending to the API
		error_log( 'WordPress Plugin Search: API args: ' . wp_json_encode( $api_args ) );
		
		// Make API request
		$response = plugins_api( $action, $api_args );
		
		if ( is_wp_error( $response ) ) {
			// Return a more user-friendly error
			return new WP_Error( 
				'api_error', 
				'Unable to connect to WordPress.org plugin directory. Please try again later.', 
				array( 'status' => 503 ) 
			);
		}
		
		// Check if response is valid
		if ( ! is_object( $response ) || ! isset( $response->plugins ) ) {
			error_log( 'WordPress Plugin Search: Invalid API response structure' );
			return new WP_Error( 
				'invalid_response', 
				'Invalid response from plugin directory. Please try again.', 
				array( 'status' => 502 ) 
			);
		}
		
		// Sanitize response
		$sanitized_response = wordpress_plugin_search_sanitize_response( $response );
		
		// Ensure we have a valid plugins array
		if ( ! isset( $sanitized_response['plugins'] ) || ! is_array( $sanitized_response['plugins'] ) ) {
			$sanitized_response['plugins'] = array();
		}
		
		// Ensure we have valid info
		if ( ! isset( $sanitized_response['info'] ) || ! is_array( $sanitized_response['info'] ) ) {
			$sanitized_response['info'] = array( 'results' => count( $sanitized_response['plugins'] ) );
		}
		
		// Cache for 1 hour
		set_transient( $cache_key, $sanitized_response, HOUR_IN_SECONDS );
		
		return rest_ensure_response( $sanitized_response );
	}
}

/**
 * Sanitize API response
 */
if ( ! function_exists( 'wordpress_plugin_search_sanitize_response' ) ) {
	function wordpress_plugin_search_sanitize_response( $response ) {
		$response_array = (array) $response;
		
		// Sanitize plugins array
		if ( isset( $response_array['plugins'] ) && is_array( $response_array['plugins'] ) ) {
			foreach ( $response_array['plugins'] as $key => $plugin ) {
				$response_array['plugins'][$key] = wordpress_plugin_search_sanitize_plugin( $plugin );
			}
		}
		
		// Sanitize info
		if ( isset( $response_array['info'] ) && is_array( $response_array['info'] ) ) {
			foreach ( $response_array['info'] as $key => $value ) {
				if ( is_string( $value ) ) {
					$response_array['info'][$key] = sanitize_text_field( $value );
				} elseif ( is_numeric( $value ) ) {
					$response_array['info'][$key] = (int) $value;
				}
			}
		}
		
		return $response_array;
	}
}

/**
 * Sanitize individual plugin data
 */
if ( ! function_exists( 'wordpress_plugin_search_sanitize_plugin' ) ) {
	function wordpress_plugin_search_sanitize_plugin( $plugin ) {
		$plugin_array = (array) $plugin;
		$sanitized = array();
		
		// Safe text fields that need proper HTML entity decoding
		$text_fields = array(
			'slug', 'version', 'author', 'author_profile', 'requires', 'tested',
			'requires_php', 'last_updated', 'added', 'homepage', 'download_link'
		);
		
		foreach ( $text_fields as $field ) {
			if ( isset( $plugin_array[ $field ] ) ) {
				$sanitized[ $field ] = sanitize_text_field( $plugin_array[ $field ] );
			}
		}
		
		// Special handling for name and description - decode HTML entities properly
		if ( isset( $plugin_array['name'] ) ) {
			// Decode HTML entities first, then sanitize
			$name = html_entity_decode( $plugin_array['name'], ENT_QUOTES | ENT_HTML5, 'UTF-8' );
			$sanitized['name'] = sanitize_text_field( $name );
		}
		
		if ( isset( $plugin_array['short_description'] ) ) {
			// Decode HTML entities first, then strip tags and sanitize
			$description = html_entity_decode( $plugin_array['short_description'], ENT_QUOTES | ENT_HTML5, 'UTF-8' );
			$sanitized['short_description'] = sanitize_text_field( wp_strip_all_tags( $description ) );
		}
		
		// Numeric fields
		$numeric_fields = array( 'rating', 'num_ratings', 'active_installs', 'downloaded' );
		foreach ( $numeric_fields as $field ) {
			if ( isset( $plugin_array[ $field ] ) ) {
				$sanitized[ $field ] = (int) $plugin_array[ $field ];
			}
		}
		
		// Icons with URL validation
		if ( isset( $plugin_array['icons'] ) && is_array( $plugin_array['icons'] ) ) {
			$sanitized['icons'] = array();
			foreach ( $plugin_array['icons'] as $size => $url ) {
				if ( filter_var( $url, FILTER_VALIDATE_URL ) ) {
					$sanitized['icons'][ sanitize_text_field( $size ) ] = esc_url_raw( $url );
				}
			}
		}
		
		return $sanitized;
	}
}