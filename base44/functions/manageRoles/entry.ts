import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { action, role_name, description, permissions, id } = await req.json();

    if (!action) {
      return Response.json({ error: 'Action required' }, { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY')
    );

    // CREATE role
    if (action === 'create') {
      if (!role_name) {
        return Response.json({ error: 'Role name required' }, { status: 400 });
      }

      const { data: newRole, error } = await supabase
        .from('roles')
        .insert({
          role_name,
          description: description || '',
          permissions: permissions || [],
          is_active: true,
        })
        .select();

      if (error) throw error;
      return Response.json({ success: true, data: newRole[0] });
    }

    // LIST all roles
    if (action === 'list') {
      const { data: roles, error } = await supabase
        .from('roles')
        .select('*')
        .eq('is_active', true)
        .order('created_date', { ascending: false });

      if (error) throw error;
      return Response.json({ success: true, data: roles });
    }

    // UPDATE role
    if (action === 'update') {
      if (!id) {
        return Response.json({ error: 'Role ID required' }, { status: 400 });
      }

      const { data: updatedRole, error } = await supabase
        .from('roles')
        .update({
          role_name: role_name || undefined,
          description: description !== undefined ? description : undefined,
          permissions: permissions || undefined,
        })
        .eq('id', id)
        .select();

      if (error) throw error;
      return Response.json({ success: true, data: updatedRole[0] });
    }

    // DELETE role (soft delete)
    if (action === 'delete') {
      if (!id) {
        return Response.json({ error: 'Role ID required' }, { status: 400 });
      }

      const { data: deletedRole, error } = await supabase
        .from('roles')
        .update({ is_active: false })
        .eq('id', id)
        .select();

      if (error) throw error;
      return Response.json({ success: true, message: 'Role deleted' });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});