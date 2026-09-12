<?php

declare(strict_types=1);

namespace PedidosMedios;

/**
 * Gestión y encolado de assets (JS y CSS) generados por Vite para la SPA.
 */
class Assets
{
    private static bool $enqueued = false;

    public static function register(): void
    {
        add_action('wp_enqueue_scripts', [self::class, 'enqueue_assets']);
        add_filter('script_loader_tag', [self::class, 'add_module_type_to_script'], 10, 3);
    }

    /**
     * Encola los scripts y estilos de la aplicación únicamente si es una ruta o página de PEDIDOS.
     */
    public static function enqueue_assets(): void
    {
        // Evitar encolar múltiples veces
        if (self::$enqueued) {
            return;
        }

        // Cargar solo en rutas de PEDIDOS o cuando se detecte el shortcode
        if (!self::should_enqueue()) {
            return;
        }

        self::$enqueued = true;
        $manifest_data = self::get_manifest_data();
        $entry = self::find_manifest_entry($manifest_data);

        if ($entry !== null) {
            $js_file = isset($entry['file']) ? (string) $entry['file'] : '';
            $css_files = isset($entry['css']) && is_array($entry['css']) ? $entry['css'] : [];

            // Encolar CSS
            foreach ($css_files as $idx => $css_file) {
                wp_enqueue_style(
                    'pedidos-medios-style-' . $idx,
                    PEDIDOS_MEDIOS_URL . 'dist/' . $css_file,
                    [],
                    PEDIDOS_MEDIOS_VERSION
                );
            }

            // Encolar JS principal
            if (!empty($js_file)) {
                wp_enqueue_script(
                    'pedidos-medios-app',
                    PEDIDOS_MEDIOS_URL . 'dist/' . $js_file,
                    [],
                    PEDIDOS_MEDIOS_VERSION,
                    true
                );

                // Inyectar configuración pública segura al frontend
                wp_add_inline_script(
                    'pedidos-medios-app',
                    'window.__PEDIDOS_CONFIG__ = ' . wp_json_encode(Config::get_public_config()) . ';',
                    'before'
                );
            }
        } else {
            // Fallback de desarrollo o build sin manifest nombrado
            $fallback_js = PEDIDOS_MEDIOS_PATH . 'dist/app.js';
            $fallback_css = PEDIDOS_MEDIOS_PATH . 'dist/app.css';

            if (file_exists($fallback_css)) {
                wp_enqueue_style(
                    'pedidos-medios-style-fallback',
                    PEDIDOS_MEDIOS_URL . 'dist/app.css',
                    [],
                    PEDIDOS_MEDIOS_VERSION
                );
            }

            if (file_exists($fallback_js)) {
                wp_enqueue_script(
                    'pedidos-medios-app',
                    PEDIDOS_MEDIOS_URL . 'dist/app.js',
                    [],
                    PEDIDOS_MEDIOS_VERSION,
                    true
                );

                wp_add_inline_script(
                    'pedidos-medios-app',
                    'window.__PEDIDOS_CONFIG__ = ' . wp_json_encode(Config::get_public_config()) . ';',
                    'before'
                );
            }
        }
    }

    /**
     * Determina si se deben cargar los assets en la petición actual.
     */
    public static function should_enqueue(): bool
    {
        if (Routes::is_pedidos_route()) {
            return true;
        }

        if (AppShell::is_shortcode_rendered()) {
            return true;
        }

        // Inspección defensiva de post_content en singular
        if (is_singular()) {
            $post = get_post();
            if ($post && has_shortcode((string) $post->post_content, 'pedidos_medios_app')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Lee el archivo manifest.json generado por Vite en el directorio dist.
     *
     * @return array<string, mixed>
     */
    private static function get_manifest_data(): array
    {
        $manifest_path_vite = PEDIDOS_MEDIOS_PATH . 'dist/.vite/manifest.json';
        $manifest_path_root = PEDIDOS_MEDIOS_PATH . 'dist/manifest.json';

        $manifest_file = file_exists($manifest_path_vite) ? $manifest_path_vite : (file_exists($manifest_path_root) ? $manifest_path_root : null);

        if ($manifest_file && is_readable($manifest_file)) {
            $json = (string) file_get_contents($manifest_file);
            $data = json_decode($json, true);
            if (is_array($data)) {
                return $data;
            }
        }

        return [];
    }

    /**
     * Localiza el chunk de entrada principal dentro del manifest de Vite.
     *
     * @param array<string, mixed> $manifest_data
     * @return array<string, mixed>|null
     */
    private static function find_manifest_entry(array $manifest_data): ?array
    {
        if (empty($manifest_data)) {
            return null;
        }

        // 1. Coincidencia directa por index.html o src/main.tsx
        if (isset($manifest_data['index.html']) && is_array($manifest_data['index.html'])) {
            return $manifest_data['index.html'];
        }
        if (isset($manifest_data['src/main.tsx']) && is_array($manifest_data['src/main.tsx'])) {
            return $manifest_data['src/main.tsx'];
        }

        // 2. Búsqueda por flag isEntry === true
        foreach ($manifest_data as $item) {
            if (is_array($item) && !empty($item['isEntry'])) {
                return $item;
            }
        }

        return null;
    }

    /**
     * Agrega type="module" al script principal de Vite.
     */
    public static function add_module_type_to_script(string $tag, string $handle, string $src): string
    {
        if ($handle === 'pedidos-medios-app') {
            return sprintf('<script type="module" src="%s" id="%s-js"></script>' . "\n", esc_url($src), esc_attr($handle));
        }
        return $tag;
    }
}
