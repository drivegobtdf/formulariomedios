<?php
/**
 * Plugin Name:       Pedidos — Secretaría de Medios
 * Plugin URI:        https://github.com/drivegobtdf/formulariomedios
 * Description:       App frontend y host de integración institucional para el sistema de PEDIDOS (Secretaría de Medios - Gobierno de Tierra del Fuego AIAS).
 * Version:           0.1.0-alpha
 * Requires at least: 6.0
 * Requires PHP:      8.2
 * Author:            Secretaría de Medios — Gobierno de Tierra del Fuego AIAS
 * Author URI:        https://www.tierradelfuego.gob.ar
 * License:           Proprietary
 * Text Domain:       pedidos-medios
 * Domain Path:       /languages
 */

declare(strict_types=1);

namespace PedidosMedios;

// Bloquear acceso directo fuera del entorno de WordPress
if (!defined('ABSPATH')) {
    exit;
}

// Definición de constantes del plugin
define('PEDIDOS_MEDIOS_VERSION', '0.1.0-alpha');
define('PEDIDOS_MEDIOS_FILE', __FILE__);
define('PEDIDOS_MEDIOS_PATH', plugin_dir_path(__FILE__));
define('PEDIDOS_MEDIOS_URL', plugin_dir_url(__FILE__));
define('PEDIDOS_MEDIOS_CONTRACT_VERSION', '3.0');

// Autoload simple de clases nativas PHP dentro de src/PHP/
spl_autoload_register(function (string $class): void {
    $prefix = 'PedidosMedios\\';
    $base_dir = PEDIDOS_MEDIOS_PATH . 'src/PHP/';

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';

    if (file_exists($file)) {
        require_once $file;
    }
});

// Hooks de activación y desactivación segura (flush_rewrite_rules SOLO en eventos de ciclo de vida)
register_activation_hook(PEDIDOS_MEDIOS_FILE, [Plugin::class, 'activate']);
register_deactivation_hook(PEDIDOS_MEDIOS_FILE, [Plugin::class, 'deactivate']);

// Inicialización del plugin
add_action('plugins_loaded', [Plugin::class, 'init']);
