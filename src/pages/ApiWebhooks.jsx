import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Key,
  Webhook,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  Edit,
  X
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";

export default function ApiWebhooks() {
  const [view, setView] = useState('list'); // 'list', 'create-api', 'edit-api', 'create-webhook', 'edit-webhook'
  const [editingApiKey, setEditingApiKey] = useState(null);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [apiKeyForm, setApiKeyForm] = useState({
    name: '',
    permissions: ['read'],
    method: 'GET',
    request_url: '',
    body: '',
    headers: [{ key: 'Content-Type', value: 'application/json' }]
  });
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    method: 'POST',
    event_types: [],
    headers: [{ key: 'Content-Type', value: 'application/json' }],
    body_template: '',
    secret: ''
  });
  const [revealedKeys, setRevealedKeys] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);

  const queryClient = useQueryClient();

  const { data: apiKeys } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => base44.entities.ApiKey.list('-created_date'),
    initialData: [],
  });

  const { data: webhooks } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => base44.entities.Webhook.list('-created_date'),
    initialData: [],
  });

  const saveApiKeyMutation = useMutation({
    mutationFn: (data) => {
      if (editingApiKey) {
        return base44.entities.ApiKey.update(editingApiKey.id, data);
      } else {
        const generatedKey = 'sk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        return base44.entities.ApiKey.create({
          ...data,
          key: generatedKey
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['api-keys']);
      setView('list');
      setEditingApiKey(null);
      resetApiKeyForm();
      if (!editingApiKey) {
        alert('API key created successfully!');
      }
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: (id) => base44.entities.ApiKey.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['api-keys']);
    },
  });

  const toggleApiKeyMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.ApiKey.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries(['api-keys']);
    },
  });

  const saveWebhookMutation = useMutation({
    mutationFn: (data) => {
      if (editingWebhook) {
        return base44.entities.Webhook.update(editingWebhook.id, data);
      } else {
        const secret = 'whsec_' + Math.random().toString(36).substring(2, 15);
        return base44.entities.Webhook.create({
          ...data,
          secret,
          last_status: 'pending'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['webhooks']);
      setView('list');
      setEditingWebhook(null);
      resetWebhookForm();
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (id) => base44.entities.Webhook.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['webhooks']);
    },
  });

  const toggleWebhookMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.Webhook.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries(['webhooks']);
    },
  });

  const resetApiKeyForm = () => {
    setApiKeyForm({
      name: '',
      permissions: ['read'],
      method: 'GET',
      request_url: '',
      body: '',
      headers: [{ key: 'Content-Type', value: 'application/json' }]
    });
  };

  const resetWebhookForm = () => {
    setWebhookForm({
      name: '',
      url: '',
      method: 'POST',
      event_types: [],
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body_template: '',
      secret: ''
    });
  };

  const handleEditApiKey = (key) => {
    setEditingApiKey(key);
    setApiKeyForm({
      name: key.name,
      permissions: key.permissions,
      method: key.method || 'GET',
      request_url: key.request_url || '',
      body: key.body || '',
      headers: key.headers || [{ key: 'Content-Type', value: 'application/json' }]
    });
    setView('edit-api');
  };

  const handleEditWebhook = (webhook) => {
    setEditingWebhook(webhook);
    setWebhookForm({
      name: webhook.name,
      url: webhook.url,
      method: webhook.method || 'POST',
      event_types: webhook.event_types,
      headers: webhook.headers || [{ key: 'Content-Type', value: 'application/json' }],
      body_template: webhook.body_template || '',
      secret: webhook.secret
    });
    setView('edit-webhook');
  };

  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleKeyVisibility = (keyId) => {
    setRevealedKeys({ ...revealedKeys, [keyId]: !revealedKeys[keyId] });
  };

  const maskKey = (key) => {
    return key.substring(0, 7) + '•'.repeat(20);
  };

  const addHeader = (form, setForm) => {
    setForm({ ...form, headers: [...form.headers, { key: '', value: '' }] });
  };

  const updateHeader = (index, field, value, form, setForm) => {
    const newHeaders = [...form.headers];
    newHeaders[index][field] = value;
    setForm({ ...form, headers: newHeaders });
  };

  const removeHeader = (index, form, setForm) => {
    setForm({ ...form, headers: form.headers.filter((_, i) => i !== index) });
  };

  const eventTypes = [
    'lead.created',
    'lead.updated',
    'lead.sold',
    'lead.rejected',
    'lead.returned',
    'sync.completed',
    'sync.failed'
  ];

  // List View
  if (view === 'list') {
    return (
      <div className="space-y-6">
        <div>
          <Link to={createPageUrl("AdminSettings")}>
            <Button variant="ghost" className="text-white hover:bg-white/10 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin Settings
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">API & Webhooks</h1>
          <p className="text-gray-400">Manage API keys and webhook configurations</p>
        </div>

        <Tabs defaultValue="api-keys" className="w-full">
          <TabsList className="glass-card border-white/10">
            <TabsTrigger value="api-keys" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="flex items-center gap-2">
              <Webhook className="w-4 h-4" />
              Webhooks
            </TabsTrigger>
          </TabsList>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-gray-400">
                Create and manage API keys for programmatic access to your data
              </p>
              <Button
                onClick={() => {
                  resetApiKeyForm();
                  setView('create-api');
                }}
                className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create API Key
              </Button>
            </div>

            <Card className="glass-card border-white/10">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-gray-400">Name</TableHead>
                      <TableHead className="text-gray-400">Key</TableHead>
                      <TableHead className="text-gray-400">Method</TableHead>
                      <TableHead className="text-gray-400">Permissions</TableHead>
                      <TableHead className="text-gray-400">Last Used</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeys.length === 0 ? (
                      <TableRow className="border-white/10 hover:bg-white/5">
                        <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                          No API keys created yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      apiKeys.map((key) => (
                        <TableRow key={key.id} className="border-white/10 hover:bg-white/5">
                          <TableCell className="text-white font-medium">{key.name}</TableCell>
                          <TableCell className="text-gray-400 font-mono">
                            <div className="flex items-center gap-2">
                              <span>{revealedKeys[key.id] ? key.key : maskKey(key.key)}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleKeyVisibility(key.id)}
                                className="h-6 w-6 text-gray-400 hover:text-white hover:bg-white/10"
                              >
                                {revealedKeys[key.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCopyKey(key.key)}
                                className="h-6 w-6 text-gray-400 hover:text-white hover:bg-white/10"
                              >
                                {copiedKey === key.key ? (
                                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 border">
                              {key.method || 'GET'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {key.permissions.map(p => (
                                <Badge key={p} className="bg-blue-500/20 text-blue-400 border-blue-500/30 border text-xs">
                                  {p}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-400 text-sm">
                            {key.last_used ? format(new Date(key.last_used), 'MMM dd, yyyy') : 'Never'}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={key.enabled}
                              onCheckedChange={(enabled) => toggleApiKeyMutation.mutate({ id: key.id, enabled })}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditApiKey(key)}
                                className="text-[#00d4ff] hover:bg-[#00d4ff]/20 hover:text-[#00d4ff]"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this API key?')) {
                                    deleteApiKeyMutation.mutate(key.id);
                                  }
                                }}
                                className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-gray-400">
                Configure webhooks to receive real-time notifications about events
              </p>
              <Button
                onClick={() => {
                  resetWebhookForm();
                  setView('create-webhook');
                }}
                className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Webhook
              </Button>
            </div>

            <Card className="glass-card border-white/10">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-gray-400">Name</TableHead>
                      <TableHead className="text-gray-400">URL</TableHead>
                      <TableHead className="text-gray-400">Method</TableHead>
                      <TableHead className="text-gray-400">Events</TableHead>
                      <TableHead className="text-gray-400">Last Triggered</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooks.length === 0 ? (
                      <TableRow className="border-white/10 hover:bg-white/5">
                        <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                          No webhooks configured yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      webhooks.map((webhook) => (
                        <TableRow key={webhook.id} className="border-white/10 hover:bg-white/5">
                          <TableCell className="text-white font-medium">{webhook.name}</TableCell>
                          <TableCell className="text-gray-400 text-sm max-w-xs truncate">
                            {webhook.url}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 border">
                              {webhook.method || 'POST'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 border">
                              {webhook.event_types.length} events
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-400 text-sm">
                            {webhook.last_triggered ? format(new Date(webhook.last_triggered), 'MMM dd, HH:mm') : 'Never'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {webhook.last_status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                              {webhook.last_status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                              {webhook.last_status === 'pending' && <Clock className="w-4 h-4 text-gray-400" />}
                              <Switch
                                checked={webhook.enabled}
                                onCheckedChange={(enabled) => toggleWebhookMutation.mutate({ id: webhook.id, enabled })}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditWebhook(webhook)}
                                className="text-[#00d4ff] hover:bg-[#00d4ff]/20 hover:text-[#00d4ff]"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this webhook?')) {
                                    deleteWebhookMutation.mutate(webhook.id);
                                  }
                                }}
                                className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Create/Edit API Key View
  if (view === 'create-api' || view === 'edit-api') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => setView('list')}
              className="text-white hover:bg-white/10 mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to List
            </Button>
            <h1 className="text-3xl font-bold text-white mb-2">
              {view === 'create-api' ? 'Create API Key' : 'Edit API Key'}
            </h1>
          </div>
        </div>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6 space-y-6">
            {/* Properties Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Properties</h3>
              
              <div>
                <Label className="text-white">Title *</Label>
                <Input
                  value={apiKeyForm.name}
                  onChange={(e) => setApiKeyForm({ ...apiKeyForm, name: e.target.value })}
                  placeholder="e.g., Production API"
                  className="glass-card border-white/10 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Method</Label>
                  <Select
                    value={apiKeyForm.method}
                    onValueChange={(v) => setApiKeyForm({ ...apiKeyForm, method: v })}
                  >
                    <SelectTrigger className="glass-card border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      <SelectItem value="GET" className="text-white">GET</SelectItem>
                      <SelectItem value="POST" className="text-white">POST</SelectItem>
                      <SelectItem value="PUT" className="text-white">PUT</SelectItem>
                      <SelectItem value="PATCH" className="text-white">PATCH</SelectItem>
                      <SelectItem value="DELETE" className="text-white">DELETE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-white">Request URL</Label>
                  <Input
                    value={apiKeyForm.request_url}
                    onChange={(e) => setApiKeyForm({ ...apiKeyForm, request_url: e.target.value })}
                    placeholder="https://api.example.com/endpoint"
                    className="glass-card border-white/10 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Body Section */}
            <div className="space-y-2">
              <Label className="text-white">Body</Label>
              <Textarea
                value={apiKeyForm.body}
                onChange={(e) => setApiKeyForm({ ...apiKeyForm, body: e.target.value })}
                placeholder='{\n  "key": "value"\n}'
                className="glass-card border-white/10 text-white font-mono min-h-[200px]"
              />
              <p className="text-xs text-gray-400">Use JSON format for request body</p>
            </div>

            {/* Headers Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-white">Headers</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addHeader(apiKeyForm, setApiKeyForm)}
                  className="glass-card border-white/10 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Header
                </Button>
              </div>
              {apiKeyForm.headers.map((header, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    value={header.key}
                    onChange={(e) => updateHeader(index, 'key', e.target.value, apiKeyForm, setApiKeyForm)}
                    placeholder="Header name"
                    className="glass-card border-white/10 text-white"
                  />
                  <Input
                    value={header.value}
                    onChange={(e) => updateHeader(index, 'value', e.target.value, apiKeyForm, setApiKeyForm)}
                    placeholder="Header value"
                    className="glass-card border-white/10 text-white"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeHeader(index, apiKeyForm, setApiKeyForm)}
                    className="text-red-400 hover:bg-red-500/20"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Permissions Section */}
            <div className="space-y-2">
              <Label className="text-white">Permissions</Label>
              <div className="grid grid-cols-4 gap-3">
                {['read', 'write', 'delete', 'admin'].map(permission => (
                  <div key={permission} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={apiKeyForm.permissions.includes(permission)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setApiKeyForm({
                            ...apiKeyForm,
                            permissions: [...apiKeyForm.permissions, permission]
                          });
                        } else {
                          setApiKeyForm({
                            ...apiKeyForm,
                            permissions: apiKeyForm.permissions.filter(p => p !== permission)
                          });
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-white capitalize">{permission}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setView('list')}
            className="glass-card border-white/10 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={() => saveApiKeyMutation.mutate(apiKeyForm)}
            disabled={!apiKeyForm.name}
            className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
          >
            {view === 'create-api' ? 'Save and Continue' : 'Save Changes'}
          </Button>
        </div>
      </div>
    );
  }

  // Create/Edit Webhook View
  if (view === 'create-webhook' || view === 'edit-webhook') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => setView('list')}
              className="text-white hover:bg-white/10 mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to List
            </Button>
            <h1 className="text-3xl font-bold text-white mb-2">
              {view === 'create-webhook' ? 'Create Webhook' : 'Edit Webhook'}
            </h1>
          </div>
        </div>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6 space-y-6">
            {/* Properties Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Properties</h3>
              
              <div>
                <Label className="text-white">Name *</Label>
                <Input
                  value={webhookForm.name}
                  onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                  placeholder="e.g., Lead Notifications"
                  className="glass-card border-white/10 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Method</Label>
                  <Select
                    value={webhookForm.method}
                    onValueChange={(v) => setWebhookForm({ ...webhookForm, method: v })}
                  >
                    <SelectTrigger className="glass-card border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      <SelectItem value="GET" className="text-white">GET</SelectItem>
                      <SelectItem value="POST" className="text-white">POST</SelectItem>
                      <SelectItem value="PUT" className="text-white">PUT</SelectItem>
                      <SelectItem value="PATCH" className="text-white">PATCH</SelectItem>
                      <SelectItem value="DELETE" className="text-white">DELETE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-white">Endpoint URL *</Label>
                  <Input
                    value={webhookForm.url}
                    onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                    placeholder="https://your-domain.com/webhook"
                    className="glass-card border-white/10 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Event Types Section */}
            <div className="space-y-2">
              <Label className="text-white">Event Types *</Label>
              <div className="grid grid-cols-2 gap-3">
                {eventTypes.map(event => (
                  <div key={event} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={webhookForm.event_types.includes(event)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setWebhookForm({
                            ...webhookForm,
                            event_types: [...webhookForm.event_types, event]
                          });
                        } else {
                          setWebhookForm({
                            ...webhookForm,
                            event_types: webhookForm.event_types.filter(t => t !== event)
                          });
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-white text-sm">{event}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Body Template Section */}
            <div className="space-y-2">
              <Label className="text-white">Body Template (JSON)</Label>
              <Textarea
                value={webhookForm.body_template}
                onChange={(e) => setWebhookForm({ ...webhookForm, body_template: e.target.value })}
                placeholder='{\n  "event": "{{event_type}}",\n  "data": "{{data}}"\n}'
                className="glass-card border-white/10 text-white font-mono min-h-[200px]"
              />
              <p className="text-xs text-gray-400">Use {`{{variable}}`} syntax for dynamic values</p>
            </div>

            {/* Headers Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-white">Headers</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addHeader(webhookForm, setWebhookForm)}
                  className="glass-card border-white/10 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Header
                </Button>
              </div>
              {webhookForm.headers.map((header, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    value={header.key}
                    onChange={(e) => updateHeader(index, 'key', e.target.value, webhookForm, setWebhookForm)}
                    placeholder="Header name"
                    className="glass-card border-white/10 text-white"
                  />
                  <Input
                    value={header.value}
                    onChange={(e) => updateHeader(index, 'value', e.target.value, webhookForm, setWebhookForm)}
                    placeholder="Header value"
                    className="glass-card border-white/10 text-white"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeHeader(index, webhookForm, setWebhookForm)}
                    className="text-red-400 hover:bg-red-500/20"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setView('list')}
            className="glass-card border-white/10 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={() => saveWebhookMutation.mutate(webhookForm)}
            disabled={!webhookForm.name || !webhookForm.url || webhookForm.event_types.length === 0}
            className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
          >
            {view === 'create-webhook' ? 'Save and Continue' : 'Save Changes'}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}