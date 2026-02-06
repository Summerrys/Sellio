import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { DollarSign, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const CURRENCIES = [
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'THB', name: 'Thai Baht' },
];

export default function TaxCurrency({ tenant }) {
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState(tenant?.currency || 'SGD');

  const { data: taxConfig } = useQuery({
    queryKey: ['tax-config', tenant?.id],
    queryFn: async () => {
      const configs = await base44.entities.TaxConfig.filter({ tenant_id: tenant.id });
      return configs[0];
    },
    enabled: !!tenant?.id,
  });

  const [taxData, setTaxData] = useState({
    tax_name: taxConfig?.tax_name || 'GST',
    rate: taxConfig?.rate || 8,
    is_inclusive: taxConfig?.is_inclusive || false,
  });

  const updateTenantMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.Tenant.update(tenant.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      toast.success('Currency updated');
    },
  });

  const updateTaxMutation = useMutation({
    mutationFn: async (data) => {
      if (taxConfig) {
        return base44.entities.TaxConfig.update(taxConfig.id, data);
      } else {
        return base44.entities.TaxConfig.create({
          ...data,
          tenant_id: tenant.id,
          is_active: true,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-config'] });
      toast.success('Tax settings updated');
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Tax & Currency
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Currency */}
        <div>
          <Label>Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => updateTenantMutation.mutate({ currency })}
            disabled={updateTenantMutation.isPending || currency === tenant?.currency}
            className="mt-2"
            size="sm"
          >
            {updateTenantMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Update Currency
          </Button>
        </div>

        <div className="border-t pt-4 space-y-4">
          <h4 className="font-semibold">Tax Configuration</h4>
          
          <div>
            <Label htmlFor="tax-name">Tax Name</Label>
            <Input
              id="tax-name"
              value={taxData.tax_name}
              onChange={(e) => setTaxData({ ...taxData, tax_name: e.target.value })}
              placeholder="GST, VAT, Sales Tax"
            />
          </div>

          <div>
            <Label htmlFor="tax-rate">Tax Rate (%)</Label>
            <Input
              id="tax-rate"
              type="number"
              step="0.01"
              value={taxData.rate}
              onChange={(e) => setTaxData({ ...taxData, rate: parseFloat(e.target.value) })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Tax Inclusive Pricing</Label>
              <p className="text-sm text-slate-500">Tax is included in product prices</p>
            </div>
            <Switch
              checked={taxData.is_inclusive}
              onCheckedChange={(checked) => setTaxData({ ...taxData, is_inclusive: checked })}
            />
          </div>

          <Button
            onClick={() => updateTaxMutation.mutate(taxData)}
            disabled={updateTaxMutation.isPending}
          >
            {updateTaxMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Tax Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}