import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;

function getCloudKeys() {
  try {
    const rawOutput = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF} --reveal --output json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(rawOutput);
    let anonKey = '';
    let serviceKey = '';

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.name === 'anon' || item.name === 'publishable' || item.type === 'anon') {
          anonKey = item.api_key || item.key || item.value || '';
        }
        if (item.name === 'service_role' || item.name === 'secret' || item.type === 'service_role') {
          serviceKey = item.api_key || item.key || item.value || '';
        }
      }
    } else if (typeof parsed === 'object') {
      anonKey = parsed.anon || parsed.publishable || parsed.SUPABASE_ANON_KEY || '';
      serviceKey = parsed.service_role || parsed.secret || parsed.SUPABASE_SERVICE_ROLE_KEY || '';
    }

    return { anonKey, serviceKey };
  } catch (err) {
    throw new Error('No se pudieron obtener las claves de Supabase Cloud: ' + (err as Error).message);
  }
}

test.describe('PEDIDOS — Flujo Integrado E2E: Navegador + Supabase Cloud + Google Drive Real', () => {
  let anonKey = '';
  let serviceKey = '';
  let tempFilePath = '';
  const createdEnvioIds: string[] = [];
  const createdUserIds: string[] = [];

  test.beforeAll(() => {
    const keys = getCloudKeys();
    anonKey = keys.anonKey;
    serviceKey = keys.serviceKey;

    // Crear archivo sintético real de prueba (PDF válido)
    const tempDir = path.resolve('scratch');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    tempFilePath = path.join(tempDir, `e2e_test_${Date.now()}.pdf`);
    const pdfContent = Buffer.from('%PDF-1.4\n%E2E Integrated Real Cloud Test File\n1 0 obj<</Type/Catalog>>endobj\nxref\ntrailer<</Root 1 0 R>>\nstartxref\n%%EOF');
    fs.writeFileSync(tempFilePath, pdfContent);
  });

  test.afterAll(async () => {
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch { void 0; }
    }

    // Limpieza segura en Cloud DB
    if (serviceKey) {
      const serviceClient = createClient(SUPABASE_PROJECT_URL, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      for (const uId of createdUserIds) {
        try { await serviceClient.from('usuarios_acceso').delete().eq('user_id', uId); } catch { void 0; }
        try { await serviceClient.auth.admin.deleteUser(uId); } catch { void 0; }
      }

      for (const envioId of createdEnvioIds) {
        try {
          const { data: peds } = await serviceClient.from('pedidos').select('id').eq('envio_id', envioId);
          const pedIds = peds?.map((p) => p.id) || [];
          if (pedIds.length > 0) {
            await serviceClient.from('archivo_pedido').delete().in('pedido_id', pedIds);
            await serviceClient.from('enlace_pedido').delete().in('pedido_id', pedIds);
          }
          await serviceClient.from('upload_reservations').delete().eq('envio_id', envioId);
          await serviceClient.from('enlaces_material').delete().eq('envio_id', envioId);
          await serviceClient.from('pedidos').delete().eq('envio_id', envioId);
          await serviceClient.from('domain_events').delete().eq('aggregate_id', envioId);
          await serviceClient.from('audit_log').delete().eq('recurso_id', envioId);
          await serviceClient.from('envios_formulario').delete().eq('id', envioId);
        } catch { void 0; }
      }
    }
  });

  test('debe completar el recorrido público de 2 PEDs con subida y verificación real a Google Drive y descarga RBAC', async ({ page }) => {
    // 1. Inyectar configuración del entorno Cloud en el navegador del usuario
    await page.addInitScript(({ url, key }) => {
      window.__PEDIDOS_CONFIG__ = {
        supabaseUrl: url,
        supabaseAnonKey: key,
        environment: 'staging',
        basePath: '/formulariomedios',
      };
    }, { url: SUPABASE_PROJECT_URL, key: anonKey });

    // Navegar al formulario
    await page.goto('/formulariomedios/');
    await expect(page.locator('#pedidos-app')).toBeVisible();

    // -------------------------------------------------------------
    // PASO 1: Datos de Contacto y Categorías
    // -------------------------------------------------------------
    const testEmail = `e2e.${Date.now()}@tierradelfuego.gob.ar`;
    await page.fill('#contacto_nombre', 'Mariana E2E Integración');
    await page.fill('#contacto_telefono', '+54 2901 998877');
    await page.fill('#contacto_correo', testEmail);
    await page.fill('#contacto_area', 'Secretaría de Comunicación E2E');

    // Seleccionar 2 Categorías: Diseño Gráfico y Cobertura de Eventos
    await page.check('input[aria-label="Diseño gráfico"]');
    await page.check('input[aria-label="Cobertura de eventos"]');

    await page.click('button:has-text("Continuar al Detalle de Solicitudes")');

    // -------------------------------------------------------------
    // PASO 2: Detalle de Servicios (2 PEDs)
    // -------------------------------------------------------------
    await expect(page.locator('h2')).toContainText('2. Detalle y Especificación de Servicios');

    // Diseño Gráfico: Seleccionar Flyer
    await page.check('input[type="checkbox"] >> xpath=..//strong[contains(text(), "Flyer")]/ancestor::label/input');
    await page.selectOption('#flyer_formato', 'Cuadrado 1:1 (Feed Instagram/Facebook)');
    await page.fill('#flyer_fecha_limite', '2026-12-15');
    await page.fill('#flyer_texto', 'Campaña Oficial de Pruebas Integradas E2E.');

    // Cobertura de Eventos
    await page.fill('#cob_fecha', '2026-12-20');
    await page.fill('#cob_hora_inicio', '10:00');
    await page.fill('#cob_lugar', 'Casa de Gobierno, Ushuaia');
    await page.selectOption('#cob_ciudad', 'Ushuaia');
    await page.fill('#cob_autoridades', 'Gobernador y Ministros');
    await page.fill('#cob_requerimientos', 'Fotografía y cobertura completa.');

    await page.click('button:has-text("Continuar a Adjuntos y Enlaces")');

    // -------------------------------------------------------------
    // PASO 3: Adjuntos y Subida Real a Google Drive
    // -------------------------------------------------------------
    await expect(page.locator('h2')).toContainText('3. Archivos Adjuntos y Enlaces de Referencia');

    // Adjuntar archivo sintético real mediante el input de archivo
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tempFilePath);

    // Esperar a que el navegador complete la subida directa a Google Drive y verificación backend
    await expect(page.locator('text=Verificado en almacenamiento')).toBeVisible({ timeout: 30000 });

    await page.click('button:has-text("Continuar al Resumen y Confirmación")');

    // -------------------------------------------------------------
    // PASO 4: Resumen y Confirmación Final
    // -------------------------------------------------------------
    await expect(page.locator('h2')).toContainText('4. Resumen y Confirmación Final');
    await expect(page.locator('text=Solicitudes a Generar (2 PEDs)')).toBeVisible();
    await expect(page.locator('text=Flyer para redes sociales')).toBeVisible();
    await expect(page.locator('text=Cobertura de eventos')).toBeVisible();

    // Confirmar checkbox
    const confirmCheckbox = page.locator('input[type="checkbox"] >> xpath=..//strong[contains(text(), "Confirmo que revisé los datos")]/ancestor::label/input');
    await confirmCheckbox.check();

    // Enviar formulario (creación atómica en Cloud DB)
    await page.click('button:has-text("Enviar solicitudes")');

    // -------------------------------------------------------------
    // PASO 5: Resultado Exitoso
    // -------------------------------------------------------------
    await expect(page.locator('text=¡Solicitud Recibida con Éxito!')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('text=Tus Solicitudes Registradas (2)')).toBeVisible();

    // Verificar que se listan los códigos PED generados
    const pedCodes = page.locator('.code-value, .pedidos-ped-code-box');
    await expect(pedCodes.first()).toBeVisible();

    // -------------------------------------------------------------
    // PASO 6: Verificación en Base de Datos Cloud y Descarga RBAC
    // -------------------------------------------------------------
    const serviceClient = createClient(SUPABASE_PROJECT_URL, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: envioData, error: envioError } = await serviceClient
      .from('envios_formulario')
      .select('*, pedidos(*)')
      .eq('correo', testEmail)
      .maybeSingle();

    if (envioError) {
      console.error('Error fetching envioData:', envioError);
    }
    expect(envioData).not.toBeNull();
    if (envioData) {
      createdEnvioIds.push(envioData.id);
      expect(envioData.pedidos.length).toBe(2);

      // Verificar códigos de PED
      const codigos = envioData.pedidos.map((p: { pedido_visible: string }) => p.pedido_visible);
      expect(codigos.some((c: string) => c.includes('-D'))).toBe(true);
      expect(codigos.some((c: string) => c.includes('-C'))).toBe(true);

      // Verificar archivo asociado mediante upload_reservations
      const { data: resData, error: resError } = await serviceClient
        .from('upload_reservations')
        .select('*, archivos(*)')
        .eq('envio_id', envioData.id);

      if (resError) {
        console.error('Error fetching reservations:', resError);
      }
      expect(resData && resData.length > 0).toBe(true);
      const archivoId = resData![0].archivo_id;
      expect(archivoId).toBeDefined();
      expect(resData![0].archivos.estado).toBe('verified');

      // Crear usuario de prueba para verificar descarga RBAC
      const testAdminEmail = `admin.e2e.${Date.now()}@example.invalid`;
      const testPassword = `P@ss_${crypto.randomBytes(8).toString('hex')}`;
      const { data: authUser } = await serviceClient.auth.admin.createUser({
        email: testAdminEmail,
        password: testPassword,
        email_confirm: true,
      });

      if (authUser.user) {
        createdUserIds.push(authUser.user.id);
        await serviceClient.from('usuarios_acceso').insert({
          user_id: authUser.user.id,
          nombre: 'Admin E2E',
          apellido: 'Test',
          nombre_usuario: `admin.e2e.${Date.now()}`,
          estado_acceso: 'aprobado',
          app_role: 'administrador',
        });

        // Obtener sesión/JWT del usuario
        const anonClient = createClient(SUPABASE_PROJECT_URL, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: sessionData } = await anonClient.auth.signInWithPassword({
          email: testAdminEmail,
          password: testPassword,
        });

        const userJwt = sessionData.session?.access_token;
        expect(userJwt).toBeDefined();

        // Ejecutar descarga autenticada desde el navegador
        const downloadRes = await page.evaluate(async ({ url, jwt, archId, anonK }) => {
          const downloadUrl = `${url}/functions/v1/drive-download?archivo_id=${archId}`;
          const res = await fetch(downloadUrl, {
            headers: {
              'apikey': anonK,
              'Authorization': `Bearer ${jwt}`,
            },
          });
          const content = await res.text();
          return {
            status: res.status,
            contentType: res.headers.get('content-type'),
            contentDisposition: res.headers.get('content-disposition'),
            cacheControl: res.headers.get('cache-control'),
            xContentTypeOptions: res.headers.get('x-content-type-options'),
            length: content.length,
            startsWithPdf: content.startsWith('%PDF-1.4'),
          };
        }, { url: SUPABASE_PROJECT_URL, jwt: userJwt!, archId: archivoId, anonK: anonKey });

        expect(downloadRes.status).toBe(200);
        expect(downloadRes.contentType).toBe('application/pdf');
        expect(downloadRes.contentDisposition).toContain('attachment');
        expect(downloadRes.cacheControl).toContain('no-store');
        expect(downloadRes.xContentTypeOptions).toBe('nosniff');
        expect(downloadRes.startsWithPdf).toBe(true);
      }
    }
  });
});
