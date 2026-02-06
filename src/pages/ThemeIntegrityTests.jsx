import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/components/tenant/TenantContext';
import { useTheme } from '@/components/theme/ThemeProvider';
import { COLOR_SETS, generateThemeVariables } from '@/components/theme/themeUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import PageHeader from '@/components/ui-custom/PageHeader';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Loader2,
  Palette,
  Eye,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

export default function ThemeIntegrityTests() {
  const [testResults, setTestResults] = useState({});
  const [runningTests, setRunningTests] = useState({});
  const [selectedTheme, setSelectedTheme] = useState('Indigo');
  const { tenantId } = useTenant();
  const { currentTheme, setTheme } = useTheme();

  // Calculate contrast ratio (WCAG)
  const getLuminance = (r, g, b) => {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const getContrastRatio = (rgb1, rgb2) => {
    const l1 = getLuminance(...rgb1);
    const l2 = getLuminance(...rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  const parseRgb = (rgbString) => {
    const parts = rgbString.split(' ').map(Number);
    return parts.length === 3 ? parts : [0, 0, 0];
  };

  const runCssVariableTest = useMutation({
    mutationFn: async () => {
      const results = [];
      const root = document.documentElement;

      for (const colorSet of COLOR_SETS.slice(0, 8)) {
        const variables = generateThemeVariables(colorSet.dark, colorSet.light);
        
        // Test 1: All required variables exist
        const requiredVars = [
          '--color-primary',
          '--color-primary-light',
          '--color-primary-50',
          '--color-primary-100',
          '--color-primary-200',
          '--color-primary-300',
          '--color-primary-400',
          '--color-primary-500',
          '--color-primary-600',
          '--color-primary-700',
          '--color-primary-800',
          '--color-primary-900',
        ];

        const missingVars = requiredVars.filter(v => !variables[v]);
        
        results.push({
          name: `${colorSet.name}: CSS Variables Generated`,
          passed: missingVars.length === 0,
          message: missingVars.length === 0 
            ? `All ${requiredVars.length} variables generated`
            : `Missing: ${missingVars.join(', ')}`,
          critical: missingVars.length > 0,
          theme: colorSet.name
        });

        // Test 2: No undefined or NaN values
        const invalidVars = Object.entries(variables).filter(([k, v]) => 
          !v || v.includes('NaN') || v.includes('undefined')
        );
        
        results.push({
          name: `${colorSet.name}: No Invalid Values`,
          passed: invalidVars.length === 0,
          message: invalidVars.length === 0 
            ? 'All values valid'
            : `Invalid: ${invalidVars.map(([k]) => k).join(', ')}`,
          critical: invalidVars.length > 0,
          theme: colorSet.name
        });

        // Test 3: Smooth gradient check
        const shadeKeys = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
        const shades = shadeKeys.map(k => {
          const val = variables[`--color-primary-${k}`];
          const [r, g, b] = parseRgb(val);
          return getLuminance(r, g, b);
        });

        // Check if luminance decreases smoothly
        let gradientSmooth = true;
        for (let i = 1; i < shades.length; i++) {
          if (shades[i] > shades[i - 1]) {
            gradientSmooth = false;
            break;
          }
        }

        results.push({
          name: `${colorSet.name}: Smooth Gradient`,
          passed: gradientSmooth,
          message: gradientSmooth 
            ? 'Shades create smooth light-to-dark gradient'
            : 'Gradient has inconsistencies',
          theme: colorSet.name
        });
      }

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, cssVariables: results }));
      toast.success('CSS Variable Tests Completed');
    },
    onError: (error) => {
      toast.error(`CSS Variable Tests Failed: ${error.message}`);
    }
  });

  const runContrastTest = useMutation({
    mutationFn: async () => {
      const results = [];

      for (const colorSet of COLOR_SETS.slice(0, 8)) {
        const variables = generateThemeVariables(colorSet.dark, colorSet.light);
        
        const primaryDark = parseRgb(variables['--color-primary']);
        const primaryLight = parseRgb(variables['--color-primary-light']);
        const white = [255, 255, 255];
        const black = [0, 0, 0];

        // Test 1: White text on primary dark background
        const ratio1 = getContrastRatio(white, primaryDark);
        results.push({
          name: `${colorSet.name}: White on Dark`,
          passed: ratio1 >= 4.5,
          message: `Contrast: ${ratio1.toFixed(2)}:1 ${ratio1 >= 4.5 ? '✓ WCAG AA' : '✗ FAILS WCAG AA'}`,
          critical: ratio1 < 4.5,
          theme: colorSet.name,
          data: { ratio: ratio1.toFixed(2), requirement: '4.5:1' }
        });

        // Test 2: Primary dark text on white background
        const ratio2 = getContrastRatio(primaryDark, white);
        results.push({
          name: `${colorSet.name}: Dark on White`,
          passed: ratio2 >= 4.5,
          message: `Contrast: ${ratio2.toFixed(2)}:1 ${ratio2 >= 4.5 ? '✓ WCAG AA' : '✗ FAILS WCAG AA'}`,
          critical: ratio2 < 4.5,
          theme: colorSet.name,
          data: { ratio: ratio2.toFixed(2), requirement: '4.5:1' }
        });

        // Test 3: Primary dark text on primary light background
        const ratio3 = getContrastRatio(primaryDark, primaryLight);
        results.push({
          name: `${colorSet.name}: Dark on Light`,
          passed: ratio3 >= 3.0,
          message: `Contrast: ${ratio3.toFixed(2)}:1 ${ratio3 >= 3.0 ? '✓ Readable' : '⚠ Low contrast'}`,
          critical: ratio3 < 2.0,
          theme: colorSet.name,
          data: { ratio: ratio3.toFixed(2), requirement: '3.0:1' }
        });
      }

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, contrast: results }));
      toast.success('Contrast Tests Completed');
    },
    onError: (error) => {
      toast.error(`Contrast Tests Failed: ${error.message}`);
    }
  });

  const runComponentTest = useMutation({
    mutationFn: async () => {
      const results = [];
      const root = document.documentElement;

      // Test current theme is applied
      const primaryColor = getComputedStyle(root).getPropertyValue('--color-primary').trim();
      const primaryLight = getComputedStyle(root).getPropertyValue('--color-primary-light').trim();

      results.push({
        name: 'Theme Currently Applied',
        passed: primaryColor && primaryLight && primaryColor !== '',
        message: primaryColor 
          ? `Primary: rgb(${primaryColor}), Light: rgb(${primaryLight})`
          : 'No theme variables detected',
        critical: !primaryColor
      });

      // Test visual components use CSS variables
      results.push({
        name: 'Navigation Component',
        passed: false,
        message: 'MANUAL: Verify sidebar uses theme colors (not hardcoded)',
        critical: false
      });

      results.push({
        name: 'Button Components',
        passed: false,
        message: 'MANUAL: Verify primary buttons use --color-primary background',
        critical: false
      });

      results.push({
        name: 'Cards & Badges',
        passed: false,
        message: 'MANUAL: Verify cards/badges use primary light tints',
        critical: false
      });

      results.push({
        name: 'Forms & Inputs',
        passed: false,
        message: 'MANUAL: Verify focused inputs use primary dark border',
        critical: false
      });

      results.push({
        name: 'Tables & Lists',
        passed: false,
        message: 'MANUAL: Verify table headers use primary light background',
        critical: false
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, components: results }));
      toast.success('Component Tests Completed');
    },
    onError: (error) => {
      toast.error(`Component Tests Failed: ${error.message}`);
    }
  });

  const runThemeSwitchTest = useMutation({
    mutationFn: async () => {
      const results = [];

      // Test 1: Theme persistence in DB
      const configs = await base44.entities.ThemeConfig.filter({ tenant_id: tenantId });
      results.push({
        name: 'Theme Stored in Database',
        passed: configs.length > 0,
        message: configs.length > 0 
          ? `Current: ${configs[0].color_set_name}`
          : 'No theme config found - will use default',
        data: configs[0] || null
      });

      // Test 2: Theme switching without reload
      results.push({
        name: 'Live Theme Switching',
        passed: false,
        message: 'MANUAL: Change theme → verify components update WITHOUT page reload',
        critical: false
      });

      // Test 3: Rapid switching
      results.push({
        name: 'Rapid Theme Switching',
        passed: false,
        message: 'MANUAL: Click through all 8 themes quickly → verify no glitches',
        critical: false
      });

      // Test 4: Persistence after refresh
      results.push({
        name: 'Theme Persists After Refresh',
        passed: false,
        message: 'MANUAL: Change theme → refresh page → verify theme is still applied',
        critical: false
      });

      // Test 5: Cross-tab sync
      results.push({
        name: 'Cross-Tab Theme Sync',
        passed: false,
        message: 'MANUAL: Open 2 tabs → change theme in one → refresh other → verify updated',
        critical: false
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, switching: results }));
      toast.success('Theme Switching Tests Completed');
    },
    onError: (error) => {
      toast.error(`Theme Switching Tests Failed: ${error.message}`);
    }
  });

  const runEdgeCaseTest = useMutation({
    mutationFn: async () => {
      const results = [];

      // Test 1: Fallback to default
      const colorSet = COLOR_SETS.find(s => s.name === currentTheme);
      results.push({
        name: 'Fallback to Indigo Default',
        passed: !!colorSet,
        message: colorSet 
          ? `Current theme "${currentTheme}" is valid`
          : `Invalid theme - should fallback to Indigo`,
        critical: !colorSet
      });

      // Test 2: Check for hardcoded colors in components
      results.push({
        name: 'No Hardcoded Theme Colors',
        passed: false,
        message: 'MANUAL: Run grep to find hardcoded hex colors in component files',
        critical: false,
        data: {
          command: 'grep -rn "#0941a2\\|#a8c8fb\\|#6bd68a" components/ pages/ --include="*.js" --include="*.jsx"',
          expected: 'Only matches in themeUtils.js'
        }
      });

      // Test 3: Customer-facing pages use tenant theme
      results.push({
        name: 'Customer Pages Use Tenant Theme',
        passed: false,
        message: 'MANUAL: Open QR menu page → verify it uses same theme as dashboard',
        critical: false
      });

      // Test 4: Print styles
      results.push({
        name: 'Print Stylesheet Compatibility',
        passed: false,
        message: 'MANUAL: Print preview a page → verify theme colors render (not white-on-white)',
        critical: false
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, edgeCases: results }));
      toast.success('Edge Case Tests Completed');
    },
    onError: (error) => {
      toast.error(`Edge Case Tests Failed: ${error.message}`);
    }
  });

  const testSuites = [
    {
      id: 'cssVariables',
      title: 'CSS Variable Generation',
      description: 'Test all 8 themes generate valid CSS variables',
      icon: Palette,
      mutation: runCssVariableTest,
      critical: true
    },
    {
      id: 'contrast',
      title: 'Contrast & Accessibility',
      description: 'WCAG AA contrast ratio tests for all themes',
      icon: Eye,
      mutation: runContrastTest,
      critical: true
    },
    {
      id: 'components',
      title: 'Component Theme Application',
      description: 'Verify components use theme variables (not hardcoded)',
      icon: Palette,
      mutation: runComponentTest,
      critical: false
    },
    {
      id: 'switching',
      title: 'Theme Switching & Persistence',
      description: 'Test live switching, persistence, cross-tab sync',
      icon: RefreshCw,
      mutation: runThemeSwitchTest,
      critical: true
    },
    {
      id: 'edgeCases',
      title: 'Edge Cases & Fallbacks',
      description: 'Test defaults, invalid themes, print styles',
      icon: AlertTriangle,
      mutation: runEdgeCaseTest,
      critical: false
    }
  ];

  const runAllTests = async () => {
    try {
      for (const suite of testSuites) {
        setRunningTests(prev => ({ ...prev, [suite.id]: true }));
        await suite.mutation.mutateAsync();
        setRunningTests(prev => ({ ...prev, [suite.id]: false }));
      }
      toast.success('All theme integrity tests completed');
    } catch (error) {
      toast.error(`Test failed: ${error.message}`);
      setRunningTests({});
    }
  };

  const applyThemePreview = (themeName) => {
    setSelectedTheme(themeName);
    const colorSet = COLOR_SETS.find(s => s.name === themeName);
    if (!colorSet) return;

    const variables = generateThemeVariables(colorSet.dark, colorSet.light);
    const root = document.documentElement;

    Object.entries(variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  };

  const getStatusIcon = (passed, critical) => {
    if (passed === null || passed === false) {
      return critical 
        ? <XCircle className="w-4 h-4 text-red-600" />
        : <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    }
    return <CheckCircle className="w-4 h-4 text-green-600" />;
  };

  const getStatusColor = (passed, critical) => {
    if (passed === null || passed === false) {
      return critical 
        ? 'text-red-700 bg-red-50 border-red-200'
        : 'text-yellow-700 bg-yellow-50 border-yellow-200';
    }
    return 'text-green-700 bg-green-50 border-green-200';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Theme Integrity Test Suite"
        description="Comprehensive tests for theming engine across all 8 color themes"
        action={
          <Button
            onClick={runAllTests}
            className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))]"
            disabled={Object.values(runningTests).some(v => v)}
          >
            {Object.values(runningTests).some(v => v) ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Palette className="w-4 h-4 mr-2" />
                Run All Tests
              </>
            )}
          </Button>
        }
      />

      {/* Theme Preview Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Live Theme Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {COLOR_SETS.slice(0, 8).map((theme) => (
              <button
                key={theme.name}
                onClick={() => applyThemePreview(theme.name)}
                className={`p-3 rounded-lg border-2 transition-all ${
                  selectedTheme === theme.name 
                    ? 'border-slate-900 shadow-md'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex gap-2 mb-2">
                  <div 
                    className="w-8 h-8 rounded"
                    style={{ backgroundColor: theme.dark }}
                  />
                  <div 
                    className="w-8 h-8 rounded"
                    style={{ backgroundColor: theme.light }}
                  />
                </div>
                <p className="text-xs font-medium text-slate-700">{theme.name}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600 mb-3">Preview Components:</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm">Primary Button</Button>
              <Button size="sm" variant="outline">Outline Button</Button>
              <Badge>Badge</Badge>
              <Badge variant="outline">Outline Badge</Badge>
            </div>
            <Progress value={60} className="mt-3" />
            <Input placeholder="Focused input" className="mt-3" />
          </div>
        </CardContent>
      </Card>

      {/* Test Suites */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {testSuites.map((suite) => {
          const Icon = suite.icon;
          const isRunning = runningTests[suite.id];
          const results = testResults[suite.id];

          return (
            <Card key={suite.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {suite.title}
                        {suite.critical && (
                          <Badge variant="destructive" className="text-xs">Critical</Badge>
                        )}
                      </CardTitle>
                      <p className="text-sm text-slate-500">{suite.description}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => suite.mutation.mutate()}
                  disabled={isRunning}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>Run Tests</>
                  )}
                </Button>

                {results && results.length > 0 && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {results.map((result, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border text-sm ${getStatusColor(result.passed, result.critical)}`}
                      >
                        <div className="flex items-start gap-2">
                          {getStatusIcon(result.passed, result.critical)}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{result.name}</p>
                            <p className="text-xs opacity-90 mt-0.5">{result.message}</p>
                            {result.data && (
                              <pre className="text-xs mt-2 opacity-75 overflow-auto max-h-24 bg-black/5 p-2 rounded">
                                {JSON.stringify(result.data, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!results && !isRunning && (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No tests run yet. Click "Run Tests" to start.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary */}
      {Object.keys(testResults).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-2xl font-bold text-green-700">
                  {Object.values(testResults).flat().filter(r => r.passed === true).length}
                </p>
                <p className="text-sm text-green-600">Passed</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-2xl font-bold text-red-700">
                  {Object.values(testResults).flat().filter(r => (r.passed === false || r.passed === null) && r.critical).length}
                </p>
                <p className="text-sm text-red-600">Failed (Critical)</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-2xl font-bold text-yellow-700">
                  {Object.values(testResults).flat().filter(r => (r.passed === false || r.passed === null) && !r.critical).length}
                </p>
                <p className="text-sm text-yellow-600">Manual Tests</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-2xl font-bold text-slate-700">
                  {Object.values(testResults).flat().length}
                </p>
                <p className="text-sm text-slate-600">Total Tests</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}