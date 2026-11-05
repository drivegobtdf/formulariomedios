/** CAM-08 contracts; SQL functional checks in disposable PostgreSQL are mandatory. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root=process.cwd();
const migration=readFileSync(join(root,'supabase/migrations/20261105002000_cam08_internal_notes_history.sql'),'utf8');
const api=readFileSync(join(root,'pedidos-medios/frontend/src/services/gestionApi.ts'),'utf8');
const ui=readFileSync(join(root,'pedidos-medios/frontend/src/pages/PedidoDetallePage.tsx'),'utf8');
describe('CAM-08 notas internas',()=>{
  it('edición y borrado lógico sin pérdida del original',()=>{
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.nota_pedido_update(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.nota_pedido_delete(');
    expect(migration).toContain('deleted_at=now()');
    expect(migration).not.toMatch(/DELETE FROM public\.notas_pedido\b/);
  });
  it('sólo visibilidad interna, autor o administrador; edición concurrente',()=>{
    expect(migration).toContain("v_nota.visibilidad <> 'interna'");
    expect(migration).toContain("v_role <> 'administrador' AND v_nota.autor_user_id <> v_actor");
    expect(migration).toContain('NOTE_VERSION_CONFLICT');
    expect(migration).toContain('FOR UPDATE');
  });
  it('historial privado con texto previo y posterior, auditoría sin PII',()=>{
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.nota_pedido_historial');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('private.is_team_or_admin()');
    expect(migration).toContain('texto_anterior');
    expect(migration).toContain('texto_nuevo');
    expect(migration).toContain("'notas_pedido',p_nota_id::text,'update'");
  });
  it('UI muestra marca editada y restringe controles por autor/administrador',()=>{
    expect(api).toContain('edited_at, revision, deleted_at');
    expect(api).toContain(".is('deleted_at', null)");
    expect(api).toContain('updateNotaPedido');
    expect(api).toContain('deleteNotaPedido');
    expect(ui).toContain("n.visibilidad === 'interna'");
    expect(ui).toContain('n.autor_user_id === user?.id');
    expect(ui).toContain('Editada');
  });
});
