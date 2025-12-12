import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, Plus, Search, GripVertical, Pencil } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";

export default function WidgetConfigPanel({ widget, onClose, onSave }) {
  const [config, setConfig] = useState(widget || {});
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFields, setSelectedFields] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [showMetricPicker, setShowMetricPicker] = useState(false);
  const [metricSearchTerm, setMetricSearchTerm] = useState("");
  const queryClient = useQueryClient();

  const { data: syncConfigs } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  const { data: libraryMetrics } = useQuery({
    queryKey: ['library-metrics-all'],
    queryFn: () => base44.entities.MetricDefinition.filter({ enabled: true }),
    initialData: [],
  });

  const sourceConfig = syncConfigs.find(s =>
    s.id === config.data_source ||
    s.name === config.data_source ||
    s.local_table_name === config.data_source
  );

  const availableFields = sourceConfig?.detected_schema?.fields?.map(f => f.name) || [];
  
  const filteredFields = availableFields.filter(field =>
    field.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMetrics = libraryMetrics.filter(metric =>
    metric.name.toLowerCase().includes(metricSearchTerm.toLowerCase())
  );

  const filteredFieldsForMetrics = availableFields.filter(field =>
    field.toLowerCase().includes(metricSearchTerm.toLowerCase())
  );

  useEffect(() => {
    if (config.query_config?.columns) {
      setSelectedFields(config.query_config.columns.map(col => 
        typeof col === 'string' ? col : col.field
      ));
    }
    if (config.query_config?.metric_ids) {
      setSelectedMetrics(config.query_config.metric_ids);
    }
  }, [config]);

  const addField = (fieldName) => {
    if (!selectedFields.includes(fieldName)) {
      const newFields = [...selectedFields, fieldName];
      setSelectedFields(newFields);
      updateConfig({
        query_config: {
          ...config.query_config,
          columns: newFields.map(f => ({ field: f, visible: true }))
        }
      });
    }
  };

  const removeField = (fieldName) => {
    const newFields = selectedFields.filter(f => f !== fieldName);
    setSelectedFields(newFields);
    updateConfig({
      query_config: {
        ...config.query_config,
        columns: newFields.map(f => ({ field: f, visible: true }))
      }
    });
  };

  const addMetric = (metricId) => {
    if (!selectedMetrics.includes(metricId)) {
      const newMetrics = [...selectedMetrics, metricId];
      setSelectedMetrics(newMetrics);
      updateConfig({
        query_config: {
          ...config.query_config,
          metric_ids: newMetrics
        }
      });
    }
  };

  const removeMetric = (metricId) => {
    const newMetrics = selectedMetrics.filter(m => m !== metricId);
    setSelectedMetrics(newMetrics);
    updateConfig({
      query_config: {
        ...config.query_config,
        metric_ids: newMetrics
      }
    });
  };

  const updateConfig = (updates) => {
    setConfig({ ...config, ...updates });
  };

  const handleSave = () => {
    onSave(config);
  };

  const getMetricBadge = (metric) => {
    if (metric.type === 'aggregation') {
      const func = metric.definition?.function?.toUpperCase() || 'AGG';
      return func.substring(0, 3);
    }
    return 'CALC';
  };

  const getMetricColor = (metric) => {
    if (metric.type === 'aggregation') {
      const func = metric.definition?.function;
      if (func === 'sum') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      if (func === 'count') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      if (func === 'avg') return 'bg-green-500/20 text-green-400 border-green-500/30';
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
    return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex">
      <div className="ml-auto w-full max-w-md h-full glass-card border-l border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-[#00d4ff]" />
            <h2 className="text-lg font-bold text-white">Widget Properties</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="setup" className="w-full">
            <TabsList className="glass-card border-b border-white/10 w-full rounded-none">
              <TabsTrigger value="setup" className="flex-1">Setup</TabsTrigger>
              <TabsTrigger value="style" className="flex-1">Style</TabsTrigger>
              <TabsTrigger value="data" className="flex-1">Data</TabsTrigger>
            </TabsList>

            <TabsContent value="setup" className="p-4 space-y-6">
              {/* Chart Type */}
              <div className="space-y-2">
                <Label className="text-white text-sm font-semibold">Chart types</Label>
                <Select
                  value={config.type}
                  onValueChange={(v) => updateConfig({ type: v })}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="table" className="text-white">Table</SelectItem>
                    <SelectItem value="kpi_card" className="text-white">KPI Card</SelectItem>
                    <SelectItem value="kpi_with_trend" className="text-white">KPI with Trend</SelectItem>
                    <SelectItem value="stats_bar" className="text-white">Stats Bar</SelectItem>
                    <SelectItem value="line_chart" className="text-white">Line Chart</SelectItem>
                    <SelectItem value="bar_chart" className="text-white">Bar Chart</SelectItem>
                    <SelectItem value="pie_chart" className="text-white">Pie Chart</SelectItem>
                    <SelectItem value="area_chart" className="text-white">Area Chart</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Data Source */}
              <div className="space-y-2">
                <Label className="text-white text-sm font-semibold">Data source</Label>
                <Select
                  value={config.data_source}
                  onValueChange={(v) => updateConfig({ data_source: v })}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue placeholder="Select data source" />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    {syncConfigs.map(sync => (
                      <SelectItem key={sync.id} value={sync.id} className="text-white">
                        {sync.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dimension */}
              {config.type !== 'table' && (
                <div className="space-y-2">
                  <Label className="text-white text-sm font-semibold">Dimension</Label>
                  <Select
                    value={config.query_config?.group_by || ''}
                    onValueChange={(v) => updateConfig({
                      query_config: { ...config.query_config, group_by: v || undefined }
                    })}
                  >
                    <SelectTrigger className="glass-card border-white/10 text-white">
                      <SelectValue placeholder="Add dimension" />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      <SelectItem value={null} className="text-white">None</SelectItem>
                      {availableFields.map(field => (
                        <SelectItem key={field} value={field} className="text-white">
                          {field}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Metrics */}
              <div className="space-y-2">
                <Label className="text-white text-sm font-semibold">Metric</Label>
                
                {selectedMetrics.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {selectedMetrics.map(metricId => {
                      const metric = libraryMetrics.find(m => m.id === metricId);
                      if (!metric) return null;
                      return (
                        <div
                          key={metricId}
                          className="flex items-center gap-2 p-2 glass-card border-white/10 rounded group"
                        >
                          <Badge className={`${getMetricColor(metric)} text-xs px-1.5 py-0.5`}>
                            {getMetricBadge(metric)}
                          </Badge>
                          <span className="flex-1 text-white text-sm">{metric.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMetric(metricId)}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-500/20 h-6 w-6"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMetricPicker(!showMetricPicker)}
                    className="glass-card border-white/10 text-[#00d4ff] w-full justify-start"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add metric
                  </Button>

                  {/* Metric Picker Panel */}
                  {showMetricPicker && (
                    <>
                      <div className="fixed inset-0 z-[100]" onClick={() => setShowMetricPicker(false)} />
                      <div 
                        className="absolute left-0 top-0 glass-card border-white/10 rounded-lg w-72 max-h-[400px] flex flex-col shadow-2xl z-[101]" 
                        onClick={(e) => e.stopPropagation()}
                      >
                      <div className="p-3 border-b border-white/10">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            placeholder="Search"
                            value={metricSearchTerm}
                            onChange={(e) => setMetricSearchTerm(e.target.value)}
                            className="glass-card border-white/10 text-white pl-10 text-sm"
                            autoFocus
                          />
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {/* Chart Fields */}
                        {filteredFieldsForMetrics.length > 0 && (
                          <div className="space-y-1">
                            <Label className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Chart fields</Label>
                            {filteredFieldsForMetrics.map(field => (
                              <button
                                key={field}
                                onClick={() => {
                                  addField(field);
                                  setShowMetricPicker(false);
                                  setMetricSearchTerm("");
                                }}
                                className="w-full flex items-center gap-2 p-2 rounded hover:bg-[#00d4ff]/10 text-left transition-colors"
                              >
                                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs px-1.5 py-0.5">
                                  123
                                </Badge>
                                <span className="text-white text-sm">{field}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Default group (Metrics from Library) */}
                        {filteredMetrics.length > 0 && (
                          <div className="space-y-1">
                            <Label className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Default group</Label>
                            {filteredMetrics.map(metric => (
                              <button
                                key={metric.id}
                                onClick={() => {
                                  addMetric(metric.id);
                                  setShowMetricPicker(false);
                                  setMetricSearchTerm("");
                                }}
                                className="w-full flex items-center gap-2 p-2 rounded hover:bg-[#00d4ff]/10 text-left transition-colors"
                              >
                                <Badge className={`${getMetricColor(metric)} text-xs px-1.5 py-0.5`}>
                                  {getMetricBadge(metric)}
                                </Badge>
                                <span className="text-white text-sm">{metric.name}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {filteredMetrics.length === 0 && filteredFieldsForMetrics.length === 0 && (
                          <div className="text-center py-8 text-gray-400">
                            <p>No metrics or fields found</p>
                            <p className="text-xs mt-2">Try a different search term</p>
                          </div>
                        )}

                        {/* Add calculated field button */}
                        <div className="pt-2 border-t border-white/10">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.open('/metrics-library', '_blank');
                              setShowMetricPicker(false);
                            }}
                            className="glass-card border-[#00d4ff]/30 text-[#00d4ff] w-full justify-start text-sm h-8"
                          >
                            <Plus className="w-3 h-3 mr-2" />
                            Add calculated field
                          </Button>
                        </div>
                      </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Limit for tables */}
              {config.type === 'table' && (
                <div className="space-y-2">
                  <Label className="text-white text-sm font-semibold">Number of rows</Label>
                  <Input
                    type="number"
                    value={config.query_config?.limit || 100}
                    onChange={(e) => updateConfig({
                      query_config: {
                        ...config.query_config,
                        limit: parseInt(e.target.value) || 100
                      }
                    })}
                    className="glass-card border-white/10 text-white"
                  />
                </div>
              )}

              {/* Sort */}
              <div className="space-y-2">
                <Label className="text-white text-sm font-semibold">Sort</Label>
                <Select
                  value={config.query_config?.sort_by || ''}
                  onValueChange={(v) => updateConfig({
                    query_config: { ...config.query_config, sort_by: v || undefined }
                  })}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue placeholder="Add sort" />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value={null} className="text-white">None</SelectItem>
                    {availableFields.map(field => [
                      <SelectItem key={`${field}-asc`} value={field} className="text-white">
                        {field} (Ascending)
                      </SelectItem>,
                      <SelectItem key={`${field}-desc`} value={`-${field}`} className="text-white">
                        {field} (Descending)
                      </SelectItem>
                    ])}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="style" className="p-4 space-y-6">
              {/* Widget Name */}
              <div className="space-y-2">
                <Label className="text-white text-sm font-semibold">Widget Name</Label>
                <Input
                  value={config.name || ''}
                  onChange={(e) => updateConfig({ name: e.target.value })}
                  className="glass-card border-white/10 text-white"
                  placeholder="Enter widget name"
                />
              </div>

              {/* Widget Width */}
              <div className="space-y-2">
                <Label className="text-white text-sm font-semibold">Width</Label>
                <Select
                  value={config.display_config?.width || 'full'}
                  onValueChange={(v) => updateConfig({
                    display_config: { ...config.display_config, width: v }
                  })}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="full" className="text-white">Full Width</SelectItem>
                    <SelectItem value="half" className="text-white">Half Width</SelectItem>
                    <SelectItem value="third" className="text-white">Third Width</SelectItem>
                    <SelectItem value="quarter" className="text-white">Quarter Width</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Show Title */}
              <div className="flex items-center justify-between">
                <Label className="text-white text-sm font-semibold">Show title</Label>
                <Switch
                  checked={config.display_config?.show_title !== false}
                  onCheckedChange={(checked) => updateConfig({
                    display_config: { ...config.display_config, show_title: checked }
                  })}
                />
              </div>
            </TabsContent>

            <TabsContent value="data" className="p-4 space-y-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="metric-search"
                  placeholder="Search fields and metrics..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="glass-card border-white/10 text-white pl-10"
                />
              </div>

              {/* Data Source Name */}
              <div className="flex items-center gap-2 p-2 glass-card border-[#00d4ff]/30 rounded">
                <div className="w-6 h-6 rounded-full bg-[#00d4ff]/20 flex items-center justify-center">
                  <span className="text-[#00d4ff] text-xs font-bold">🗂️</span>
                </div>
                <span className="text-white font-medium text-sm">
                  {sourceConfig?.name || 'Select data source'}
                </span>
              </div>

              {/* Fields List */}
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Fields</Label>
                {filteredFields.map(field => (
                  <button
                    key={field}
                    onClick={() => addField(field)}
                    className={`w-full flex items-center gap-2 p-2 rounded text-sm transition-colors ${
                      selectedFields.includes(field)
                        ? 'bg-green-500/20 text-green-400'
                        : 'hover:bg-white/5 text-gray-300'
                    }`}
                  >
                    <span className="text-xs text-gray-500">ABC</span>
                    <span>{field}</span>
                    {selectedFields.includes(field) && (
                      <span className="ml-auto text-green-400">✓</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Metrics List */}
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Metrics</Label>
                {filteredMetrics.map(metric => (
                  <button
                    key={metric.id}
                    onClick={() => addMetric(metric.id)}
                    className={`w-full flex items-center gap-2 p-2 rounded text-sm transition-colors ${
                      selectedMetrics.includes(metric.id)
                        ? 'bg-green-500/20 text-green-400'
                        : 'hover:bg-white/5 text-gray-300'
                    }`}
                  >
                    <Badge className={`${getMetricColor(metric)} text-xs px-1.5 py-0.5`}>
                      {getMetricBadge(metric)}
                    </Badge>
                    <span>{metric.name}</span>
                    {selectedMetrics.includes(metric.id) && (
                      <span className="ml-auto text-green-400">✓</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="pt-4 border-t border-white/10 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('/metrics-library', '_blank')}
                  className="glass-card border-[#00d4ff]/30 text-[#00d4ff] w-full justify-start"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add a field
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="glass-card border-[#00d4ff]/30 text-[#00d4ff] w-full justify-start"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add a parameter
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 glass-card border-white/10 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}