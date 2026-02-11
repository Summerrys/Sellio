import { v4 as uuidv4 } from 'npm:uuid@9.0.0';

const DATA_FILE = '/tmp/data_core_tenant.json';

// Initialize file if not exists
async function initFile() {
  try {
    await Deno.readTextFile(DATA_FILE);
  } catch {
    await Deno.writeTextFile(DATA_FILE, JSON.stringify([]));
  }
}

// Read all records
async function readAll() {
  await initFile();
  const content = await Deno.readTextFile(DATA_FILE);
  return JSON.parse(content);
}

// Write all records
async function writeAll(records) {
  await Deno.writeTextFile(DATA_FILE, JSON.stringify(records, null, 2));
}

// Validation
function validate(data, isUpdate = false) {
  const errors = [];
  
  if (!isUpdate) {
    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      errors.push({ field: 'name', message: 'Name is required' });
    }
    if (!data.slug || typeof data.slug !== 'string' || data.slug.trim() === '') {
      errors.push({ field: 'slug', message: 'Slug is required' });
    }
    if (!data.owner_email || typeof data.owner_email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.owner_email)) {
      errors.push({ field: 'owner_email', message: 'Valid owner email is required' });
    }
  }
  
  if (data.name && data.name.length > 100) {
    errors.push({ field: 'name', message: 'Name must be 100 characters or less' });
  }
  
  if (data.status && !['active', 'suspended', 'trial', 'cancelled'].includes(data.status)) {
    errors.push({ field: 'status', message: 'Invalid status' });
  }
  
  if (data.plan && !['free', 'starter', 'professional', 'enterprise'].includes(data.plan)) {
    errors.push({ field: 'plan', message: 'Invalid plan' });
  }
  
  return errors;
}

Deno.serve(async (req) => {
  try {
    const { operation, id, data, filters, sort, limit, offset } = await req.json();
    
    // CREATE
    if (operation === 'create') {
      const errors = validate(data);
      if (errors.length > 0) {
        return Response.json({ error: 'Validation failed', errors }, { status: 400 });
      }
      
      const records = await readAll();
      const newRecord = {
        id: uuidv4(),
        ...data,
        status: data.status || 'trial',
        plan: data.plan || 'free',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      records.push(newRecord);
      await writeAll(records);
      
      return Response.json(newRecord);
    }
    
    // READ by ID
    if (operation === 'read') {
      if (!id) {
        return Response.json({ error: 'ID is required' }, { status: 400 });
      }
      
      const records = await readAll();
      const record = records.find(r => r.id === id);
      
      if (!record) {
        return Response.json({ error: 'Record not found', entity: 'tenant', id }, { status: 404 });
      }
      
      return Response.json(record);
    }
    
    // LIST
    if (operation === 'list') {
      let records = await readAll();
      
      // Apply filters
      if (filters) {
        records = records.filter(record => {
          return Object.entries(filters).every(([key, value]) => record[key] === value);
        });
      }
      
      // Apply sorting
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
      
      // Apply pagination
      const start = offset || 0;
      const end = limit ? start + limit : records.length;
      records = records.slice(start, end);
      
      return Response.json(records);
    }
    
    // UPDATE
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
        return Response.json({ error: 'Record not found', entity: 'tenant', id }, { status: 404 });
      }
      
      records[index] = {
        ...records[index],
        ...data,
        updated_at: new Date().toISOString()
      };
      
      await writeAll(records);
      return Response.json(records[index]);
    }
    
    // DELETE
    if (operation === 'delete') {
      if (!id) {
        return Response.json({ error: 'ID is required' }, { status: 400 });
      }
      
      const records = await readAll();
      const index = records.findIndex(r => r.id === id);
      
      if (index === -1) {
        return Response.json({ error: 'Record not found', entity: 'tenant', id }, { status: 404 });
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