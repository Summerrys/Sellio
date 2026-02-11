import { v4 as uuidv4 } from 'npm:uuid@9.0.0';

const DATA_FILE = '/tmp/data_core_user.json';

async function initFile() {
  try {
    await Deno.readTextFile(DATA_FILE);
  } catch {
    await Deno.writeTextFile(DATA_FILE, JSON.stringify([]));
  }
}

async function readAll() {
  await initFile();
  const content = await Deno.readTextFile(DATA_FILE);
  return JSON.parse(content);
}

async function writeAll(records) {
  await Deno.writeTextFile(DATA_FILE, JSON.stringify(records, null, 2));
}

function validate(data, isUpdate = false) {
  const errors = [];
  
  if (!isUpdate) {
    if (!data.email || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push({ field: 'email', message: 'Valid email is required' });
    }
    if (!data.full_name || typeof data.full_name !== 'string' || data.full_name.trim() === '') {
      errors.push({ field: 'full_name', message: 'Full name is required' });
    }
  }
  
  if (data.full_name && data.full_name.length > 100) {
    errors.push({ field: 'full_name', message: 'Full name must be 100 characters or less' });
  }
  
  if (data.role && !['admin', 'user'].includes(data.role)) {
    errors.push({ field: 'role', message: 'Role must be admin or user' });
  }
  
  return errors;
}

Deno.serve(async (req) => {
  try {
    const { operation, id, data, filters, sort, limit, offset } = await req.json();
    
    if (operation === 'create') {
      const errors = validate(data);
      if (errors.length > 0) {
        return Response.json({ error: 'Validation failed', errors }, { status: 400 });
      }
      
      const records = await readAll();
      
      // Check duplicate email
      if (records.find(r => r.email === data.email)) {
        return Response.json({ error: 'Email already exists' }, { status: 400 });
      }
      
      const newRecord = {
        id: uuidv4(),
        ...data,
        role: data.role || 'user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      records.push(newRecord);
      await writeAll(records);
      
      return Response.json(newRecord);
    }
    
    if (operation === 'read') {
      if (!id) {
        return Response.json({ error: 'ID is required' }, { status: 400 });
      }
      
      const records = await readAll();
      const record = records.find(r => r.id === id);
      
      if (!record) {
        return Response.json({ error: 'Record not found', entity: 'user', id }, { status: 404 });
      }
      
      return Response.json(record);
    }
    
    if (operation === 'list') {
      let records = await readAll();
      
      if (filters) {
        records = records.filter(record => {
          return Object.entries(filters).every(([key, value]) => record[key] === value);
        });
      }
      
      if (sort) {
        const [field, order] = Object.entries(sort)[0];
        records.sort((a, b) => {
          if (order === 1 || order === 'asc') {
            return a[field] > b[field] ? 1 : -1;
          } else {
            return a[field] < b[field] ? 1 : -1;
          }
        });
      }
      
      const start = offset || 0;
      const end = limit ? start + limit : records.length;
      records = records.slice(start, end);
      
      return Response.json(records);
    }
    
    if (operation === 'update') {
      if (!id) {
        return Response.json({ error: 'ID is required' }, { status: 400 });
      }
      
      const errors = validate(data, true);
      if (errors.length > 0) {
        return Response.json({ error: 'Validation failed', errors }, { status: 400 });
      }
      
      const records = await readAll();
      const index = records.findIndex(r => r.id === id);
      
      if (index === -1) {
        return Response.json({ error: 'Record not found', entity: 'user', id }, { status: 404 });
      }
      
      records[index] = {
        ...records[index],
        ...data,
        updated_at: new Date().toISOString()
      };
      
      await writeAll(records);
      return Response.json(records[index]);
    }
    
    if (operation === 'delete') {
      if (!id) {
        return Response.json({ error: 'ID is required' }, { status: 400 });
      }
      
      const records = await readAll();
      const index = records.findIndex(r => r.id === id);
      
      if (index === -1) {
        return Response.json({ error: 'Record not found', entity: 'user', id }, { status: 404 });
      }
      
      records.splice(index, 1);
      await writeAll(records);
      
      return Response.json({ success: true, message: 'Record deleted' });
    }
    
    return Response.json({ error: 'Invalid operation' }, { status: 400 });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});