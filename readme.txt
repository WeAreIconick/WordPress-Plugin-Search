=== WordPress.org Plugin Search ===

Contributors:      iconick
Tags:              plugins, search, directory
Tested up to:      6.8
Stable tag:        1.0.0
License:           GPLv2 or later
License URI:       https://www.gnu.org/licenses/gpl-2.0.html

A simple plugin search interface for the WordPress.org repository with WordPress core Modal component.

== Description ==

Add a clean, simple plugin search interface to your website that connects directly to the WordPress.org plugin repository. Now featuring a WordPress-style modal for viewing plugin screenshots.

**Features:**

* Clean, simple search interface
* Real-time search with instant results
* Plugin cards showing ratings, install counts, and descriptions
* WordPress core Modal component for screenshot viewing
* Responsive design that works on all devices
* Secure API integration with WordPress.org
* No external dependencies - uses only WordPress core

**Perfect for:**

* WordPress blogs and resource sites
* Developer portfolios
* Plugin comparison pages
* Any site that wants to help users discover WordPress plugins

The block provides a straightforward way for visitors to search and discover plugins without leaving your site. Results show essential information like ratings, installation counts, and descriptions, with links to download or view more details on WordPress.org.

Screenshots can be viewed in a beautiful WordPress-style modal that provides a clean, accessible viewing experience with proper navigation controls.

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/wordpress-plugin-search/` or install through WordPress admin
2. Activate the plugin
3. Add the "WordPress Plugin Search" block to any post or page
4. Configure search settings in the block sidebar

== Frequently Asked Questions ==

= Does this make external API calls? =

Yes, it uses the official WordPress.org Plugin API to fetch plugin information. All calls are cached for performance.

= Can I customize the appearance? =

Yes, you can customize the styling with CSS and configure display options in the block settings.

= Are there rate limits? =

The block includes built-in caching and follows WordPress.org API best practices to avoid rate limits.

= How do I view plugin screenshots? =

Click on any plugin screenshot to open it in a WordPress-style modal viewer with navigation controls.

== Screenshots ==

1. Simple search interface with clean results
2. Plugin cards showing ratings and install counts
3. WordPress core Modal component for screenshot viewing
4. Block settings in the editor sidebar
5. Mobile-responsive design

== Changelog ==

= 1.0.0 =
* Major release with enhanced search functionality
* Fixed search caching issues that caused duplicate results
* Improved performance and reliability
* Enhanced user experience with better error handling
* Advanced filtering options (rating, installs, screenshots)
* Hidden gems detection for discovering quality plugins
* Responsive design with lightbox screenshot viewer
* Secure, cached API calls with proper sanitization

= 0.1.0 =
* Initial release
* Simple, clean plugin search interface
* WordPress.org API integration
* WordPress core Modal component for screenshots
* Responsive design
* Secure, cached API calls