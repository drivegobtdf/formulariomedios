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
    }

    public static function add_rewrite_rules(): void
    {
        $base = trim(Config::get_base_path(), '/');
        // Redirigir cualquier sub-ruta bajo /formulariomedios/* al parámetro query_var
        add_rewrite_rule(
            '^' . preg_quote($base, '/') . '(/.*)?$',
            'index.php?' . self::QUERY_VAR . '=1',
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
     */
    public static function is_pedidos_route(): bool
    {
        // Verificar por query_var de WordPress
        if (get_query_var(self::QUERY_VAR)) {
            return true;
        }

        // Verificación de respaldo por REQUEST_URI
        if (isset($_SERVER['REQUEST_URI'])) {
            $request_path = (string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH);
            $base_path = Config::get_base_path();
            if (str_starts_with($request_path, $base_path)) {
                return true;
            }
        }

        return false;
    }
}
