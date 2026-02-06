import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Play, CheckCircle, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';

export default function SecurityTests() {
  const { isSuperAdmin } = useTenant();
  const [testReport, setTestReport] = useState(null);

  const runSchemaValidation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('validateSchemaIntegrity', {});
      return response.data;
    },
    onSuccess: (data) => {
      setTestReport({ type: 'schema', data });
    },
  });

  const runIsolationTest = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('testTenantIsolation', {});
      return response.data;
    },
    onSuccess: (data) => {
      setTestReport({ type: 'isolation', data });
    },
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-slate-500">Super Admin access required</p>
        </Card>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PASS': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'FAIL': return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'WARNING': return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'ERROR': return <AlertCircle className="w-4 h-4 text-red-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PASS': return 'bg-green-50 border-green-200';
      case 'FAIL': return 'bg-red-50 border-red-200';
      case 'WARNING': return 'bg-yellow-50 border-yellow-200';
      case 'ERROR': return 'bg-red-50 border-red-200';
      default: return 'bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="🔒 Security Test Suite"
        description="Validate schema integrity and tenant isolation"
      />

      {/* Test Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Schema Integrity Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-4">
              Validates referential integrity, tenant isolation, enums, defaults, and data types.
            </p>
            <Button 
              onClick={() => runSchemaValidation.mutate()} 
              disabled={runSchemaValidation.isPending}
              className="w-full"
            >
              {runSchemaValidation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Schema Test
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-600" />
              Tenant Isolation Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-4">
              <strong>CRITICAL:</strong> Validates that tenants cannot access each other's data.
            </p>
            <Button 
              onClick={() => runIsolationTest.mutate()} 
              disabled={runIsolationTest.isPending}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              {runIsolationTest.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Isolation Test
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Test Results */}
      {testReport && (
        <Card>
          <CardHeader>
            <CardTitle>Test Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Schema Validation Report */}
            {testReport.type === 'schema' && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Schema Integrity Report</h3>
                    <p className="text-sm text-slate-500">{testReport.data.timestamp}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">{testReport.data.summary.passed}</div>
                    <div className="text-sm text-slate-500">Passed</div>
                  </div>
                </div>

                {testReport.data.checks.map((check, idx) => (
                  <div key={idx} className="space-y-3">
                    <h4 className="font-semibold text-slate-900">{check.category}</h4>
                    {check.note && (
                      <p className="text-xs text-slate-500 italic">{check.note}</p>
                    )}
                    {check.tests.map((test, testIdx) => (
                      <div key={testIdx} className={`p-3 rounded-lg border ${getStatusColor(test.status)}`}>
                        <div className="flex items-start gap-2">
                          {getStatusIcon(test.status)}
                          <div className="flex-1">
                            <p className="font-medium text-sm">{test.name}</p>
                            <p className="text-xs text-slate-600 mt-1">{test.message}</p>
                            {test.recommendation && (
                              <p className="text-xs text-blue-600 mt-2">💡 {test.recommendation}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Recommendations */}
                {testReport.data.recommendations && testReport.data.recommendations.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3">📋 Recommendations</h4>
                    {testReport.data.recommendations.map((rec, idx) => (
                      <Alert key={idx} className="mb-2">
                        <AlertDescription>
                          <div>
                            <Badge className={
                              rec.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                              rec.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'
                            }>
                              {rec.priority}
                            </Badge>
                            <strong className="ml-2">{rec.title}</strong>
                            <p className="text-sm mt-1">{rec.description}</p>
                            {rec.example && (
                              <pre className="text-xs bg-slate-50 p-2 rounded mt-2 overflow-x-auto">
                                {rec.example}
                              </pre>
                            )}
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Tenant Isolation Report */}
            {testReport.type === 'isolation' && (
              <>
                {/* Verdict */}
                <Alert className={testReport.data.verdict.secure ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}>
                  <AlertDescription>
                    <div className="flex items-center gap-3">
                      {testReport.data.verdict.secure ? (
                        <CheckCircle className="w-8 h-8 text-green-600" />
                      ) : (
                        <AlertCircle className="w-8 h-8 text-red-600" />
                      )}
                      <div>
                        <p className="font-bold text-lg">{testReport.data.verdict.message}</p>
                        {testReport.data.verdict.critical_issues_count > 0 && (
                          <p className="text-sm mt-1">
                            {testReport.data.verdict.critical_issues_count} critical security issues detected
                          </p>
                        )}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>

                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <div className="text-2xl font-bold">{testReport.data.summary.total_tests}</div>
                    <div className="text-sm text-slate-500">Total Tests</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{testReport.data.summary.passed}</div>
                    <div className="text-sm text-slate-500">Passed</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">{testReport.data.summary.failed}</div>
                    <div className="text-sm text-slate-500">Failed</div>
                  </div>
                </div>

                {/* Critical Issues */}
                {testReport.data.summary.critical_issues.length > 0 && (
                  <Alert className="border-red-500 bg-red-50">
                    <AlertDescription>
                      <p className="font-bold text-red-700 mb-2">🚨 CRITICAL SECURITY ISSUES:</p>
                      <ul className="list-disc pl-5 space-y-1">
                        {testReport.data.summary.critical_issues.map((issue, idx) => (
                          <li key={idx} className="text-sm text-red-600">{issue}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Test Sections */}
                {testReport.data.test_sections.map((section, idx) => (
                  <div key={idx} className="space-y-3">
                    <h4 className="font-semibold text-slate-900">{section.name}</h4>
                    {section.tests.map((test, testIdx) => (
                      <div key={testIdx} className={`p-3 rounded-lg border ${getStatusColor(test.status)}`}>
                        <div className="flex items-start gap-2">
                          {getStatusIcon(test.status)}
                          <div className="flex-1">
                            <p className="font-medium text-sm">{test.name}</p>
                            <p className="text-xs text-slate-600 mt-1">{test.message}</p>
                            {test.critical && (
                              <Badge className="mt-2 bg-red-600 text-white">CRITICAL</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Recommendations */}
                {testReport.data.verdict.recommendations && testReport.data.verdict.recommendations.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3">📋 Recommendations</h4>
                    {testReport.data.verdict.recommendations.map((rec, idx) => (
                      <Alert key={idx} className="mb-2">
                        <AlertDescription className="text-sm">{rec}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}