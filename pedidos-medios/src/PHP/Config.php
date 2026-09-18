<?php

declare(strict_types=1);

namespace PedidosMedios;

/**
 * Gestor de configuración pública para la SPA cliente.
 * Solo maneja parámetros públicos. NUNCA maneja ni expone claves privadas.
 */
class Config
{
    public const OPTION_SUPABASE_URL = 'pedidos_medios_supabase_url';
    public const OPTION_SUPABASE_ANON_KEY = 'pedidos_medios_supabase_anon_key';
    public const OPTION_ENVIRONMENT = 'pedidos_medios_environment';
    public const OPTION_BASE_PATH = 'pedidos_medios_base_path';
    public const OPTION_PUBLIC_APP_URL = 'pedidos_medios_public_app_url';

    public static function get_supabase_url(): string
    {
        $url = get_option(self::OPTION_SUPABASE_URL, '');
        if (empty($url) && defined('PEDIDOS_SUPABASE_URL')) {
            $url = constant('PEDIDOS_SUPABASE_URL');
        }
        if (empty($url) && getenv('VITE_SUPABASE_URL')) {
            $url = (string) getenv('VITE_SUPABASE_URL');
        }
        if (empty($url)) {
            $url = 'https://yqfkzgqvezarzhlwiilo.supabase.co';
        }
        if (function_exists('apply_filters')) {
            $url = (string) apply_filters('pedidos_medios_supabase_url', $url);
        }
        return is_string($url) ? esc_url_raw($url) : '';
    }

    public static function get_supabase_publishable_key(): string
    {
        $key = get_option(self::OPTION_SUPABASE_ANON_KEY, '');
        if (empty($key) && defined('PEDIDOS_SUPABASE_ANON_KEY')) {
            $key = constant('PEDIDOS_SUPABASE_ANON_KEY');
        }
        if (empty($key) && getenv('VITE_SUPABASE_ANON_KEY')) {
            $key = (string) getenv('VITE_SUPABASE_ANON_KEY');
        }
        if (empty($key)) {
            $key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZmt6Z3F2ZXphcnpobHdpaWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMjYyMjcsImV4cCI6MjEwNDgwMjIyN30.HtH8wtoexhpHLz4IHYtGkMWBF3_WuthkR_XroB4ODfU';
        }
        if (function_exists('apply_filters')) {
            $key = (string) apply_filters('pedidos_medios_supabase_anon_key', $key);
        }
        return is_string($key) ? sanitize_text_field($key) : '';
    }

    public static function get_environment(): string
    {
        $env = get_option(self::OPTION_ENVIRONMENT, '');
        if (empty($env) && defined('WP_ENVIRONMENT_TYPE')) {
            $env = constant('WP_ENVIRONMENT_TYPE');
        }
        if (empty($env)) {
            $env = 'production';
        }
        if (function_exists('apply_filters')) {
            $env = (string) apply_filters('pedidos_medios_environment', $env);
        }
        return in_array($env, ['development', 'staging', 'production'], true) ? $env : 'production';
    }

    public static function get_base_path(): string
    {
        $path = get_option(self::OPTION_BASE_PATH, '');
        if (empty($path) && defined('PEDIDOS_MEDIOS_BASE_PATH')) {
            $path = constant('PEDIDOS_MEDIOS_BASE_PATH');
        }
        if (empty($path)) {
            $path = '/formulariomedios';
        }
        if (function_exists('apply_filters')) {
            $path = (string) apply_filters('pedidos_medios_base_path', $path);
        }

        $path = trim(is_string($path) ? $path : '');
        if (empty($path)) {
            $path = '/formulariomedios';
        }

        // Si se paso una URL completa (http://, https://, o //), extraer solo el path
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://') || str_starts_with($path, '//')) {
            $parsed = parse_url($path, PHP_URL_PATH);
            $path = is_string($parsed) && !empty($parsed) ? $parsed : '/formulariomedios';
        }

        // Normalizar multiples slashes
        $path = (string) preg_replace('#/+#', '/', $path);

        // Asegurar leading slash
        if (!str_starts_with($path, '/')) {
            $path = '/' . $path;
        }

        // Quitar trailing slash si tiene mas de un caracter
        if (strlen($path) > 1 && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }

        return sanitize_text_field($path);
    }

    public static function get_public_app_url(): string
    {
        $url = get_option(self::OPTION_PUBLIC_APP_URL, '');
        if (empty($url) && defined('PEDIDOS_MEDIOS_PUBLIC_APP_URL')) {
            $url = constant('PEDIDOS_MEDIOS_PUBLIC_APP_URL');
        }
        if (empty($url) && function_exists('home_url')) {
            $url = home_url(self::get_base_path());
        }
        if (empty($url)) {
            $url = self::get_base_path();
        }
        if (function_exists('apply_filters')) {
            $url = (string) apply_filters('pedidos_medios_public_app_url', $url);
        }
        return is_string($url) ? esc_url_raw($url) : '';
    }

    public static function get_contract_version(): string
    {
        return defined('PEDIDOS_MEDIOS_CONTRACT_VERSION') ? PEDIDOS_MEDIOS_CONTRACT_VERSION : '3.0';
    }

    /**
     * Retorna el arreglo de configuración pública que se inyectará al navegador.
     *
     * @return array<string, mixed>
     */
    public static function get_public_config(): array
    {
        return [
            'supabaseUrl'          => self::get_supabase_url(),
            'supabaseAnonKey'      => self::get_supabase_publishable_key(),
            'environment'          => self::get_environment(),
            'basePath'             => self::get_base_path(),
            'publicAppUrl'         => self::get_public_app_url(),
            'contractVersion'      => self::get_contract_version(),
            'pluginVersion'        => defined('PEDIDOS_MEDIOS_VERSION') ? PEDIDOS_MEDIOS_VERSION : '0.1.0-alpha',
        ];
    }
}
