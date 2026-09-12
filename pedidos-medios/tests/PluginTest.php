<?php

declare(strict_types=1);

namespace PedidosMedios\Tests;

/**
 * Smoke test conceptual para el plugin WordPress pedidos-medios.
 */
class PluginTest
{
    public static function run(): bool
    {
        // Verificar constantes
        if (!defined('PEDIDOS_MEDIOS_VERSION')) {
            echo "FAIL: PEDIDOS_MEDIOS_VERSION not defined\n";
            return false;
        }

        echo "PASS: Plugin baseline syntax and constants OK\n";
        return true;
    }
}
