<?php

declare(strict_types=1);

namespace PedidosMedios;

/**
 * Gestión de reglas de reescritura y rutas para la SPA de PEDIDOS.
 */
class Routes
{
    public const QUERY_VAR = 'pedidos_medios_app';

    public static function register(): void
    {
        add_action('init', [self::class, 'add_rewrite_rules']);
        add_filter('query_vars', [self::class, 'add_query_vars']);
        add_action('template_redirect', [self::class, 'handle_spa_routing']);
    }

    public static function add_rewrite_rules(): void
    {
        $base = trim(Config::get_base_path(), '/');
        // Capturar únicamente sub-rutas con al menos un segmento hijo (ej: /formulariomedios/mis-solicitudes)
        // y delegar la resolución a la página base de WordPress para que procese el shortcode [pedidos_medios_app]
        add_rewrite_rule(
            '^' . preg_quote($base, '/') . '/(.+)/?$',
            'index.php?pagename=' . $base . '&' . self::QUERY_VAR . '=$matches[1]',
            'top'
        );
    }

    /**
     * @param array<int, string> $vars
     * @return array<int, string>
     */
    public static function add_query_vars(array $vars): array
    {
        $vars[] = self::QUERY_VAR;
        return $vars;
    }

    /**
     * Determina si la petición actual corresponde a la aplicación PEDIDOS.
     * Compatible con single-site, multisite con subdominios y multisite con subdirectorios.
     */
    public static function is_pedidos_route(): bool
    {
        // Verificar por query_var de WordPress
        if (function_exists('get_query_var') && get_query_var(self::QUERY_VAR)) {
            return true;
        }

        // Verificación de respaldo por REQUEST_URI
        if (isset($_SERVER['REQUEST_URI'])) {
            $request_path = (string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH);
            $base_path = Config::get_base_path();
            
            // Si el sitio corre en subdirectorio multisite (ej: /medios/formulariomedios)
            if (function_exists('home_url')) {
                $home_path = (string) parse_url((string) home_url($base_path), PHP_URL_PATH);
                if (!empty($home_path) && str_starts_with($request_path, $home_path)) {
                    return true;
                }
            }

            if (str_starts_with($request_path, $base_path)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Asegura que las subrutas SPA no generen status 404 en WordPress.
     */
    public static function handle_spa_routing(): void
    {
        if (!self::is_pedidos_route()) {
            return;
        }

        global $wp_query;
        if ($wp_query && is_object($wp_query) && isset($wp_query->is_404) && $wp_query->is_404) {
            $wp_query->is_404 = false;
            if (function_exists('status_header')) {
                status_header(200);
            }
        }
    }
}
