<?php

declare(strict_types=1);

namespace PedidosMedios;

/**
 * Renderizador del contenedor (mount point) de la aplicación frontend SPA.
 */
class AppShell
{
    private static bool $shortcode_rendered = false;

    public static function register(): void
    {
        add_shortcode('pedidos_medios_app', [self::class, 'render_shortcode']);
    }

    /**
     * Renderiza el elemento HTML mount point donde React montará la SPA.
     *
     * @param array<string, mixed>|string $atts
     */
    public static function render_shortcode($atts = []): string
    {
        self::$shortcode_rendered = true;

        // Forzar encolado de assets si el shortcode se procesa durante la renderización del contenido
        if (function_exists('add_action')) {
            Assets::enqueue_assets();
        }

        return '<div id="pedidos-app" class="pedidos-app" data-contract-version="' . esc_attr(Config::get_contract_version()) . '"></div>';
    }

    public static function is_shortcode_rendered(): bool
    {
        return self::$shortcode_rendered;
    }
}
