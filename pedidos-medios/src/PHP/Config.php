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

    public static function get_supabase_url(): string
    {
        $url = get_option(self::OPTION_SUPABASE_URL, '');
        if (empty($url) && defined('PEDIDOS_SUPABASE_URL')) {
            $url = constant('PEDIDOS_SUPABASE_URL');
        }
        if (empty($url) && getenv('VITE_SUPABASE_URL')) {
            $url = (string) getenv('VITE_SUPABASE_URL');
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
        return is_string($key) ? sanitize_text_field($key) : '';
    }

    public static function get_environment(): string
    {
        $env = get_option(self::OPTION_ENVIRONMENT, 'development');
        if (empty($env) && defined('WP_ENVIRONMENT_TYPE')) {
            $env = constant('WP_ENVIRONMENT_TYPE');
        }
        return in_array($env, ['development', 'staging', 'production'], true) ? $env : 'development';
    }

    public static function get_base_path(): string
    {
        $path = get_option(self::OPTION_BASE_PATH, '/formulariomedios');
        return is_string($path) && !empty($path) ? sanitize_text_field($path) : '/formulariomedios';
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
            'contractVersion'      => self::get_contract_version(),
            'pluginVersion'        => defined('PEDIDOS_MEDIOS_VERSION') ? PEDIDOS_MEDIOS_VERSION : '0.1.0-alpha',
        ];
    }
}
