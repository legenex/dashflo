import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Search, RefreshCw, CheckCircle, Upload, ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function EditBigQuerySync() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const configId = urlParams.get('id');

  const { data: config, isLoading } = useQuery({
    queryKey: ['sync-config', configId],
    queryFn: async () => {
      if (!configId) return null;
      const configs = await base44.entities.SyncConfiguration.list();
      return configs.find(c => c.id === configId);
    },
    enabled: !!configId,
  });

  const [formData, setFormData] = useState({
    name: '',
    sync_type: 'bigquery',
    enabled: true,
    project_id: '',
    dataset: '',
    table_name: '',
    service_account_json: '',
    frequency: 'hourly',
    incremental_mode: false,
    incremental_field: 'timestamp',
    local_table_name: '',
    detected_schema: null,
    response_path: ''
  });
  const [testing, setTesting] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [detectedFields, setDetectedFields] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState(null);

  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name,
        sync_type: 'bigquery',
        enabled: config.enabled,
        project_id: config.project_id || '',
        dataset: config.dataset || '',
        table_name: config.table_name || '',
        service_account_json: config.service_account_json || '',
        frequency: config.frequency || 'hourly',
        incremental_mode: config.incremental_mode || false,
        incremental_field: config.incremental_field || 'timestamp',
        local_table_name: config.local_table_name || '',
        detected_schema: config.detected_schema || null,
        response_path: config.response_path || ''
      });
      if (config.detected_schema?.fields) {
        setDetectedFields(config.detected_schema.fields);
      }
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (!data.local_table_name && data.table_name) {
        data.local_table_name = `${data.table_name}_mirror`;
      }
      
      const dataToSave = {
        ...data,
        detected_schema: detectedFields.length > 0 ? { fields: detectedFields } : null
      };
      
      if (configId) {
        return base44.entities.SyncConfiguration.update(configId, dataToSave);
      }
      return base44.entities.SyncConfiguration.create(dataToSave);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-configs'] });
      alert(configId ? "BigQuery sync updated successfully" : "BigQuery sync created successfully");
      navigate(createPageUrl('DataSyncSources'));
    },
    onError: (error) => {
      alert("Error saving sync configuration: " + error.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const testConnection = async () => {
    if (!formData.project_id || !formData.dataset || !formData.table_name || !formData.service_account_json) {
      alert("Please fill in all required fields first");
      return;
    }

    setTesting(true);
    setConnectionStatus(null);
    
    try {
      const { data } = await base44.functions.invoke('testBigQueryConnection', {
        project_id: formData.project_id,
        dataset: formData.dataset,
        table_name: formData.table_name,
        service_account_json: formData.service_account_json
      });

      if (data.success) {
        setConnectionStatus('success');
        alert(`✅ Connection successful!\n\nProject: ${data.project}\nDataset: ${data.dataset}\nTable: ${data.table}\nRows: ${data.row_count?.toLocaleString() || 'N/A'}`);
      } else {
        setConnectionStatus('error');
        alert(`❌ Connection failed:\n${data.error}`);
      }
    } catch (error) {
      setConnectionStatus('error');
      alert(`❌ Connection failed:\n${error.message}`);
    } finally {
      setTesting(false);
    }
  };

  const autoDetectSchema = async () => {
    if (!formData.project_id || !formData.dataset || !formData.table_name || !formData.service_account_json) {
      alert("Please fill in all required fields and test connection first");
      return;
    }

    setAutoDetecting(true);
    
    try {
      const { data } = await base44.functions.invoke('detectBigQuerySchema', {
        project_id: formData.project_id,
        dataset: formData.dataset,
        table_name: formData.table_name,
        service_account_json: formData.service_account_json
      });

      if (data.success) {
        setDetectedFields(data.fields);
        alert(`✅ Schema detected successfully!\n\nFound ${data.total_fields} fields`);
      } else {
        alert(`❌ Schema detection failed:\n${data.error}`);
      }
    } catch (error) {
      alert(`❌ Schema detection failed:\n${error.message}`);
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result);
          setFormData({ ...formData, service_account_json: JSON.stringify(json, null, 2) });
        } catch (error) {
          alert("Invalid JSON file");
        }
      };
      reader.readAsText(file);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-8 h-8 text-[#00d4ff] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl('DataSyncSources'))}
            className="text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white">
              {configId ? 'Edit BigQuery Table Sync' : 'Add BigQuery Table'}
            </h1>
            <p className="text-gray-400 mt-1">Configure your BigQuery table connection</p>
          </div>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={saveMutation.isPending}
          className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          {configId ? 'Update Configuration' : 'Save Configuration'}
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
                placeholder="e.g., Masterview Leads"
                className="glass-card border-white/10 text-white"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-white">Project ID *</Label>
                <Input
                  value={formData.project_id}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                  placeholder="my-project-id"
                  className="glass-card border-white/10 text-white"
                  required
                />
              </div>
              <div>
                <Label className="text-white">Dataset *</Label>
                <Input
                  value={formData.dataset}
                  onChange={(e) => setFormData({ ...formData, dataset: e.target.value })}
                  placeholder="my_dataset"
                  className="glass-card border-white/10 text-white"
                  required
                />
              </div>
              <div>
                <Label className="text-white">Table *</Label>
                <Input
                  value={formData.table_name}
                  onChange={(e) => setFormData({ ...formData, table_name: e.target.value })}
                  placeholder="my_table"
                  className="glass-card border-white/10 text-white"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-white">Service Account JSON *</Label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="glass-card border-white/10 text-white"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="glass-card border-white/10 text-white"
                    onClick={() => document.getElementById('file-upload').click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload
                  </Button>
                </div>
                <Textarea
                  value={formData.service_account_json}
                  onChange={(e) => setFormData({ ...formData, service_account_json: e.target.value })}
                  placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", ...}'
                  className="glass-card border-white/10 text-white font-mono text-sm"
                  rows={4}
                />
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
                <Label className="text-white">Sync Frequency</Label>
                <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="manual">Manual Only</SelectItem>
                    <SelectItem value="15min">Every 15 Minutes</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily_2am">Daily at 2 AM</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-white">Local Mirror Table</Label>
                <Input
                  value={formData.local_table_name}
                  onChange={(e) => setFormData({ ...formData, local_table_name: e.target.value })}
                  placeholder="Auto-generated"
                  className="glass-card border-white/10 text-white"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank to auto-generate</p>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-white">Sync Type</Label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!formData.incremental_mode}
                    onChange={() => setFormData({ ...formData, incremental_mode: false })}
                    className="w-4 h-4"
                  />
                  <span className="text-white">Full Sync</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={formData.incremental_mode}
                    onChange={() => setFormData({ ...formData, incremental_mode: true })}
                    className="w-4 h-4"
                  />
                  <span className="text-white">Incremental</span>
                </label>
              </div>
            </div>

            {formData.incremental_mode && (
              <div>
                <Label className="text-white">Incremental Field</Label>
                <Select value={formData.incremental_field} onValueChange={(v) => setFormData({ ...formData, incremental_field: v })}>
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="timestamp">timestamp</SelectItem>
                    <SelectItem value="updated_at">updated_at</SelectItem>
                    <SelectItem value="_PARTITIONTIME">_PARTITIONTIME</SelectItem>
                    <SelectItem value="created_date">created_date</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">Field used to track new/updated records</p>
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
              <p className="text-xs text-gray-400 mt-1">If response is nested, specify the path to the data array</p>
            </div>
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
                onClick={testConnection}
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
                    Test Connection
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={autoDetectSchema}
                disabled={autoDetecting}
                className="flex-1 glass-card border-white/10 text-white"
              >
                {autoDetecting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Detecting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Auto-Detect Schema
                  </>
                )}
              </Button>
            </div>

            {detectedFields.length > 0 && (
              <div className="space-y-2">
                <Label className="text-white">Detected Schema ({detectedFields.length} fields)</Label>
                <div className="glass-card border-white/10 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="text-gray-400">Field Name</TableHead>
                        <TableHead className="text-gray-400">Type</TableHead>
                        <TableHead className="text-gray-400">Mode</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detectedFields.map((field, idx) => (
                        <TableRow key={idx} className="border-white/10">
                          <TableCell className="text-white font-mono text-sm">{field.name}</TableCell>
                          <TableCell>
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 border">
                              {field.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-400">{field.mode}</TableCell>
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
  );
}