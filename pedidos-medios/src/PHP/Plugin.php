<?php

declare(strict_types=1);

namespace PedidosMedios;

/**
 * Orquestador principal del ciclo de vida del plugin WordPress.
 */
class Plugin
{
    private static bool $initialized = false;

    /**
     * Inicializa los componentes y módulos del plugin.
     */
    public static function init(): void
    {
        if (self::$initialized) {
            return;
        }
        self::$initialized = true;

        Routes::register();
        Assets::register();
        AppShell::register();
    }

    /**
     * Hook de activación: registra reglas de reescritura y las descarga a la base de datos UNA SOLA VEZ.
     */
    public static function activate(): void
    {
        Routes::add_rewrite_rules();
        if (function_exists('flush_rewrite_rules')) {
            flush_rewrite_rules();
        }
    }

    /**
     * Hook de desactivación: limpia las reglas de reescritura.
     */
    public static function deactivate(): void
    {
        if (function_exists('flush_rewrite_rules')) {
            flush_rewrite_rules();
        }
    }
}
