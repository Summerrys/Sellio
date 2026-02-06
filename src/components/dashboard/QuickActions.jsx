import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import RequirePermission from '../auth/RequirePermission';
import { Plus, ShoppingCart, UserPlus, Package } from 'lucide-react';

export default function QuickActions() {
  return (
    <Card className="p-6 border-0 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 mb-5">Quick Actions</h3>
      
      <div className="grid grid-cols-1 gap-3">
        <RequirePermission permission="products.create" silent>
          <Link to={createPageUrl('Products')}>
            <Button className="w-full justify-start bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] gap-3 h-11">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <span>Add New Product</span>
            </Button>
          </Link>
        </RequirePermission>

        <RequirePermission permission="orders.create" silent>
          <Link to={createPageUrl('Orders')}>
            <Button variant="outline" className="w-full justify-start gap-3 h-11 hover:bg-[rgb(var(--color-primary-50))]">
              <div className="w-8 h-8 rounded-lg bg-[rgb(var(--color-primary-50))] flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-[rgb(var(--color-primary))]" />
              </div>
              <span>Create Order</span>
            </Button>
          </Link>
        </RequirePermission>

        <RequirePermission permission="staff.create" silent>
          <Link to={createPageUrl('Staff')}>
            <Button variant="outline" className="w-full justify-start gap-3 h-11 hover:bg-[rgb(var(--color-primary-50))]">
              <div className="w-8 h-8 rounded-lg bg-[rgb(var(--color-primary-50))] flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-[rgb(var(--color-primary))]" />
              </div>
              <span>Invite Staff</span>
            </Button>
          </Link>
        </RequirePermission>

        <RequirePermission permission="inventory.view" silent>
          <Link to={createPageUrl('Inventory')}>
            <Button variant="outline" className="w-full justify-start gap-3 h-11 hover:bg-[rgb(var(--color-primary-50))]">
              <div className="w-8 h-8 rounded-lg bg-[rgb(var(--color-primary-50))] flex items-center justify-center">
                <Package className="w-4 h-4 text-[rgb(var(--color-primary))]" />
              </div>
              <span>View Inventory</span>
            </Button>
          </Link>
        </RequirePermission>
      </div>
    </Card>
  );
}