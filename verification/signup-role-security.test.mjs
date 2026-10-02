import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';

const source = fs.readFileSync('src/components/tenant/TenantContext.jsx', 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
let permissionFunction;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'hasPermission') permissionFunction = node.init;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(ast);
assert.ok(permissionFunction, 'Real permission function must be found');
function permissions({ membership = null, grants = [], simulate = null } = {}) {
  return vm.runInNewContext('(' + source.slice(permissionFunction.start, permissionFunction.end) + ')', {
    devRoleOverride: simulate,
    isSuperAdmin: false, // All newly self-created profiles are ordinary users.
    tenantUser: membership ? [membership] : [],
    userPermissions: grants,
    PERMISSION_ALIASES: {},
  });
}
test('ordinary profile with verified owner membership retains merchant access', () => {
  assert.equal(permissions({ membership: { is_owner: true } })('products.create'), true);
  assert.equal(permissions({ membership: { is_owner: true } })('settings.edit'), true);
});
test('ordinary profile without store membership has no merchant authority', () => {
  assert.equal(permissions()('products.create'), false);
});
test('non-owner membership retains only its assigned permissions', () => {
  const can = permissions({ membership: { is_owner: false }, grants: ['products.view'] });
  assert.equal(can('products.view'), true);
  assert.equal(can('products.delete'), false);
});
test('simulated staff permissions do not inherit owner authority', () => {
  const can = permissions({ membership: { is_owner: true }, simulate: 'staff', grants: ['products.view'] });
  assert.equal(can('products.view'), true);
  assert.equal(can('settings.edit'), false);
});
