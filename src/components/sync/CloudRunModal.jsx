import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Search, RefreshCw, CheckCircle, ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function CloudRunModal({ open, onClose, config }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    sync_type: 'cloud_run',
    enabled: true,
    api_url: '',
    api_key: '',
    api_method: 'GET',
    response_format: 'json_array',
    pagination_type: 'none',
    page_size: '1000',
    frequency: 'hourly',
    api_headers: '',
    api_payload: '',
    response_path: '',
    detected_schema: null
  });
  const [testing, setTesting] = useState(false);
  const [autoParsing, setAutoParsing] = useState(false);
  const [detectedFields, setDetectedFields] = useState([]);
  const [apiResponse, setApiResponse] = useState(null);

  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name,
        sync_type: 'cloud_run',
        enabled: config.enabled,
        api_url: config.api_url || '',
        api_key: config.api_key || '',
        api_method: config.api_method || 'GET',
        response_format: config.response_format || 'json_array',
        pagination_type: config.pagination_type || 'none',
        page_size: config.page_size || '1000',
        frequency: config.frequency || 'hourly',
        api_headers: config.api_headers || '',
        api_payload: config.api_payload || '',
        response_path: config.response_path || '',
        detected_schema: config.detected_schema || null
      });
      if (config.detected_schema?.fields) {
        setDetectedFields(config.detected_schema.fields);
      }
      setApiResponse(null);
    } else {
      setFormData({
        name: '',
        sync_type: 'cloud_run',
        enabled: true,
        api_url: '',
        api_key: '',
        api_method: 'GET',
        response_format: 'json_array',
        pagination_type: 'none',
        page_size: '1000',
        frequency: 'hourly',
        api_headers: '',
        api_payload: '',
        response_path: '',
        detected_schema: null
      });
      setDetectedFields([]);
      setApiResponse(null);
    }
  }, [config, open]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const dataToSave = {
        ...data,
        detected_schema: detectedFields.length > 0 ? { fields: detectedFields } : null
      };
      
      if (config) {
        return base44.entities.SyncConfiguration.update(config.id, dataToSave);
      }
      return base44.entities.SyncConfiguration.create(dataToSave);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-configs'] });
      alert(config ? "Cloud Run sync updated successfully" : "Cloud Run sync created successfully");
      onClose();
    },
    onError: (error) => {
      alert("Error saving sync configuration: " + error.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const testEndpoint = async () => {
    if (!formData.api_url) {
      alert("Please enter a Service URL first");
      return;
    }

    setTesting(true);
    
    try {
      const { data } = await base44.functions.invoke('testCloudRunEndpoint', {
        api_url: formData.api_url,
        api_method: formData.api_method,
        api_key: formData.api_key,
        api_headers: formData.api_headers,
        api_payload: formData.api_payload
      });

      if (data.success) {
        setApiResponse(data.sample_data);
        alert(`✅ Connection successful!\n\nStatus: ${data.status}\nType: ${data.is_array ? 'Array' : 'Object'}\nRecords: ${data.record_count}\n\nCheck console for response data.`);
        console.log('API Response:', data.sample_data);
      } else {
        alert(`❌ Connection failed:\n${data.error || `Status ${data.status}: ${data.statusText}`}`);
      }
    } catch (error) {
      alert(`❌ Connection failed:\n${error.message}`);
    } finally {
      setTesting(false);
    }
  };

  const autoParse = async () => {
    if (!formData.api_url) {
      alert("Please test the endpoint first");
      return;
    }

    setAutoParsing(true);
    
    try {
      const { data } = await base44.functions.invoke('parseCloudRunSchema', {
        api_url: formData.api_url,
        api_method: formData.api_method,
        api_key: formData.api_key,
        api_headers: formData.api_headers,
        api_payload: formData.api_payload,
        response_path: formData.response_path
      });

      console.log('Schema Detection Response:', data);

      if (data.success) {
        setDetectedFields(data.fields);
        setApiResponse(data.sample_record);
        alert(`✅ Schema parsed successfully!\n\nFound ${data.total_fields} fields from ${data.records_analyzed} records\n\nFields detected:\n${data.fields.map(f => `- ${f.name} (${f.type})`).join('\n')}`);
        console.log('Detected Fields:', data.fields);
        console.log('Sample Record:', data.sample_record);
      } else {
        alert(`❌ Schema parsing failed:\n${data.error}`);
      }
    } catch (error) {
      console.error('Schema parsing error:', error);
      alert(`❌ Schema parsing failed:\n${error.message}`);
    } finally {
      setAutoParsing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-[#0f0f23] via-[#1a1a3e] to-[#0f0f23] z-[9999] overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 glass-card border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {config ? 'Edit Cloud Run API Sync' : 'Add Cloud Run API'}
              </h1>
              <p className="text-gray-400 text-sm mt-1">Configure your Cloud Run service connection</p>
            </div>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
            className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {config ? 'Update Configuration' : 'Save Configuration'}
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="absolute top-[88px] left-0 right-0 bottom-0 overflow-y-auto px-6 py-6">
        <form onSubmit={handleSubmit} className="space-y-6 max-w-6xl mx-auto pb-6">
          {/* Basic Settings */}
          <Card className="glass-card border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Basic Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-white">Enable Auto-Sync</Label>
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={(v) => setFormData({ ...formData, enabled: v })}
                />
              </div>

              <div>
                <Label className="text-white">Sync Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Live Leads API"
                  className="glass-card border-white/10 text-white"
                  required
                />
              </div>

              <div>
                <Label className="text-white">Service URL *</Label>
                <Input
                  value={formData.api_url}
                  onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
                  placeholder="https://your-cloud-run-service.run.app"
                  className="glass-card border-white/10 text-white"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Full Cloud Run service URL (endpoint path should be in the Cloud Run function)</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">API Key (optional)</Label>
                  <Input
                    type="password"
                    value={formData.api_key}
                    onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                    placeholder="🔒 Optional"
                    className="glass-card border-white/10 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white">Method</Label>
                  <Select value={formData.api_method} onValueChange={(v) => setFormData({ ...formData, api_method: v })}>
                    <SelectTrigger className="glass-card border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sync Configuration */}
          <Card className="glass-card border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Sync Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Response Format</Label>
                  <Select value={formData.response_format} onValueChange={(v) => setFormData({ ...formData, response_format: v })}>
                    <SelectTrigger className="glass-card border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      <SelectItem value="json_array">JSON Array</SelectItem>
                      <SelectItem value="paginated">Paginated</SelectItem>
                      <SelectItem value="single_object">Single Object</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white">Sync Frequency</Label>
                  <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
                    <SelectTrigger className="glass-card border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      <SelectItem value="manual">Manual Only</SelectItem>
                      <SelectItem value="5min">Every 5 Minutes</SelectItem>
                      <SelectItem value="15min">Every 15 Minutes</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.response_format === 'paginated' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white">Pagination Type</Label>
                    <Select value={formData.pagination_type} onValueChange={(v) => setFormData({ ...formData, pagination_type: v })}>
                      <SelectTrigger className="glass-card border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-card border-white/10">
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="offset">Offset</SelectItem>
                        <SelectItem value="cursor">Cursor</SelectItem>
                      </SelectContent>
                  </Select>
                  </div>
                  <div>
                    <Label className="text-white">Page Size</Label>
                    <Input
                      value={formData.page_size}
                      onChange={(e) => setFormData({ ...formData, page_size: e.target.value })}
                      placeholder="1000"
                      className="glass-card border-white/10 text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-white">Response Data Path (optional)</Label>
                <Input
                  value={formData.response_path}
                  onChange={(e) => setFormData({ ...formData, response_path: e.target.value })}
                  placeholder="e.g., data.results or leave empty for root array"
                  className="glass-card border-white/10 text-white"
                />
                <p className="text-xs text-gray-400 mt-1">If response is nested, specify the path to the data array (e.g., "data" or "response.items")</p>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Configuration */}
          <Card className="glass-card border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Advanced Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-white">API Headers (JSON)</Label>
                <Textarea
                  value={formData.api_headers}
                  onChange={(e) => setFormData({ ...formData, api_headers: e.target.value })}
                  placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                  className="glass-card border-white/10 text-white font-mono text-sm"
                  rows={3}
                />
              </div>

              {formData.api_method === 'POST' && (
                <div>
                  <Label className="text-white">Request Payload (JSON)</Label>
                  <Textarea
                    value={formData.api_payload}
                    onChange={(e) => setFormData({ ...formData, api_payload: e.target.value })}
                    placeholder='{"filter": "active", "limit": 1000}'
                    className="glass-card border-white/10 text-white font-mono text-sm"
                    rows={3}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Testing Section */}
          <Card className="glass-card border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Test & Schema Detection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={testEndpoint}
                  disabled={testing}
                  className="flex-1 glass-card border-white/10 text-white"
                >
                  {testing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Test Endpoint
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={autoParse}
                  disabled={autoParsing}
                  className="flex-1 glass-card border-white/10 text-white"
                >
                  {autoParsing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Auto-Parse Schema
                    </>
                  )}
                </Button>
              </div>

              {apiResponse && (
                <div className="space-y-2">
                  <Label className="text-white">Sample API Response (check browser console for full data)</Label>
                  <div className="glass-card border-white/10 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-gray-300 font-mono">
                      {JSON.stringify(apiResponse, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {detectedFields.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-white">Detected Schema ({detectedFields.length} fields)</Label>
                  <div className="glass-card border-white/10 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10">
                          <TableHead className="text-gray-400">Field Name</TableHead>
                          <TableHead className="text-gray-400">Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detectedFields.map((field, idx) => (
                          <TableRow key={idx} className="border-white/10">
                            <TableCell className="text-white font-mono text-sm">{field.name}</TableCell>
                            <TableCell>
                              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 border">
                                {field.type}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}