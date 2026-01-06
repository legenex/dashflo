import React, { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import CalculatedFieldModal from "./CalculatedFieldModal";

export default function WidgetSidebar({ widget, onClose, syncConfigs, dashboardPage }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    type: 'kpi_with_trend',
    data_source: '',
    query_config: {
      aggregations: [],
      calculated_fields: [],
      metric_ids: []
    },
    display_config: {
      width: 'full',
      show_title: true
    },
    dashboard_pages: [dashboardPage || 'Dashboard'],
    enabled: true
  });

  const [selectedSource, setSelectedSource] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [showFieldModal, setShowFieldModal] = useState(false);

  const { data: libraryMetrics } = useQuery({
    queryKey: ['library-metrics'],
    queryFn: () => base44.entities.MetricDefinition.filter({ enabled: true }),
    initialData: [],
  });

  useEffect(() => {
    if (widget) {
      setFormData({
        name: widget.name || '',
        type: widget.type || 'kpi_with_trend',
        data_source: widget.data_source || '',
        query_config: widget.query_config || { aggregations: [], calculated_fields: [], metric_ids: [] },
        display_config: widget.display_config || { width: 'full', show_title: true },
        dashboard_pages: widget.dashboard_pages || [dashboardPage || 'Dashboard'],
        enabled: widget.enabled !== false
      });

      const source = syncConfigs.find(s =>
        s.local_table_name === widget.data_source || s.name === widget.data_source
      );
      setSelectedSource(source);
    }
  }, [widget, syncConfigs, dashboardPage]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (widget) {
        return base44.entities.Widget.update(widget.id, data);
      }
      return base44.entities.Widget.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-widgets'] });
      onClose();
    }
  });

  const handleSave = () => {
    if (!formData.name || !formData.data_source) {
      alert("Please fill in widget title and data source");
      return;
    }
    saveMutation.mutate(formData);
  };

  const handleDataSourceChange = (value) => {
    setFormData({ ...formData, data_source: value });
    const source = syncConfigs.find(s =>
      s.local_table_name === value || s.name === value
    );
    setSelectedSource(source);
  };

  const availableFields = selectedSource?.detected_schema?.fields?.map(f => f.name) || [];

  const addMetric = (metricId) => {
    const currentIds = formData.query_config.metric_ids || [];
    if (!currentIds.includes(metricId)) {
      setFormData({
        ...formData,
        query_config: {
          ...formData.query_config,
          metric_ids: [...currentIds, metricId]
        }
      });
    }
  };

  const removeMetric = (metricId) => {
    const currentIds = formData.query_config.metric_ids || [];
    setFormData({
      ...formData,
      query_config: {
        ...formData.query_config,
        metric_ids: currentIds.filter(id => id !== metricId)
      }
    });
  };

  const addCalculatedField = () => {
    setEditingField(null);
    setShowFieldModal(true);
  };

  const editCalculatedField = (field, index) => {
    setEditingField({ ...field, index });
    setShowFieldModal(true);
  };

  const saveCalculatedField = (field) => {
    const fields = [...(formData.query_config.calculated_fields || [])];
    if (editingField?.index !== undefined) {
      fields[editingField.index] = field;
    } else {
      fields.push(field);
    }
    setFormData({
      ...formData,
      query_config: {
        ...formData.query_config,
        calculated_fields: fields
      }
    });
    setShowFieldModal(false);
    setEditingField(null);
  };

  const removeCalculatedField = (index) => {
    const fields = (formData.query_config.calculated_fields || []).filter((_, i) => i !== index);
    setFormData({
      ...formData,
      query_config: {
        ...formData.query_config,
        calculated_fields: fields
      }
    });
  };

  return (
    <>
      <div className="fixed inset-y-0 right-0 w-96 glass-card border-l border-white/10 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-xl">📊</span>
            Widget properties
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="setup" className="flex-1 flex flex-col">
          <TabsList className="glass-card border-b border-white/10 rounded-none px-4">
            <TabsTrigger value="setup" className="text-white">📝 Setup</TabsTrigger>
            <TabsTrigger value="data" className="text-white">📊 Data</TabsTrigger>
            <TabsTrigger value="style" className="text-white">🎨 Style</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="setup" className="p-4 space-y-4 m-0">
              <div>
                <Label className="text-white text-sm">Widget Title</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., CPL"
                  className="glass-card border-white/10 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-white text-sm mb-2 block">Chart types</Label>
                <div className="flex gap-2">
                  {[
                    { value: 'line_chart', label: 'Line', icon: '📈' },
                    { value: 'bar_chart', label: 'Bar', icon: '📊' },
                    { value: 'pie_chart', label: 'Pie', icon: '🥧' }
                  ].map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFormData({ ...formData, type: type.value })}
                      className={`flex-1 p-2 rounded text-sm transition-all ${
                        formData.type === type.value
                          ? 'bg-[#00d4ff]/20 border-2 border-[#00d4ff] text-white'
                          : 'bg-white/5 border-2 border-white/10 text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-lg mb-1">{type.icon}</div>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-white text-sm">Data source</Label>
                <Select value={formData.data_source} onValueChange={handleDataSourceChange}>
                  <SelectTrigger className="glass-card border-white/10 text-white mt-1">
                    <SelectValue placeholder="Select data source" />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    {syncConfigs.map(source => (
                      <SelectItem key={source.id} value={source.local_table_name || source.name} className="text-white">
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Metrics Section */}
              <div>
                <Label className="text-white text-sm mb-2 block">Metrics</Label>
                <div className="space-y-2">
                  {(formData.query_config.metric_ids || []).map(metricId => {
                    const metric = libraryMetrics.find(m => m.id === metricId);
                    if (!metric) return null;
                    return (
                      <div key={metricId} className="flex items-center gap-2 p-2 glass-card border-white/10 rounded">
                        <span className="text-gray-400 cursor-move">⋮⋮</span>
                        <span className="text-lg">🔢</span>
                        <span className="text-white text-sm flex-1">{metric.name}</span>
                        <Badge className="bg-white/10 text-white text-xs">
                          {metric.definition?.function || 'avg'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMetric(metricId)}
                          className="text-red-400 hover:text-red-300 h-6 w-6 p-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}

                  {(formData.query_config.calculated_fields || []).map((field, index) => (
                    <div 
                      key={index} 
                      className="flex items-center gap-2 p-2 glass-card border-white/10 rounded cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => editCalculatedField(field, index)}
                    >
                      <span className="text-gray-400 cursor-move">⋮⋮</span>
                      <span className="text-lg">📝</span>
                      <span className="text-white text-sm flex-1">{field.name}</span>
                      <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                        {field.format || 'number'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCalculatedField(index);
                        }}
                        className="text-red-400 hover:text-red-300 h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addCalculatedField}
                    disabled={!formData.data_source}
                    className="w-full glass-card border-white/10 text-[#00d4ff] hover:bg-[#00d4ff]/10"
                  >
                    + Add metric
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="data" className="p-4 space-y-4 m-0">
              {libraryMetrics.length > 0 && (
                <div>
                  <Label className="text-white text-sm mb-2 block">Available Library Metrics</Label>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {libraryMetrics.map(metric => (
                      <button
                        key={metric.id}
                        onClick={() => addMetric(metric.id)}
                        disabled={(formData.query_config.metric_ids || []).includes(metric.id)}
                        className="w-full text-left p-2 rounded text-sm text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {metric.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="style" className="p-4 space-y-4 m-0">
              <div>
                <Label className="text-white text-sm">Width</Label>
                <Select
                  value={formData.display_config?.width || 'full'}
                  onValueChange={(v) => setFormData({
                    ...formData,
                    display_config: { ...formData.display_config, width: v }
                  })}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white mt-1">
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

              <div className="flex items-center justify-between">
                <Label className="text-white text-sm">Show Title</Label>
                <input
                  type="checkbox"
                  checked={formData.display_config?.show_title !== false}
                  onChange={(e) => setFormData({
                    ...formData,
                    display_config: { ...formData.display_config, show_title: e.target.checked }
                  })}
                  className="w-4 h-4"
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>

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
            disabled={saveMutation.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : 'Apply'}
          </Button>
        </div>
      </div>

      {showFieldModal && (
        <CalculatedFieldModal
          field={editingField}
          availableFields={availableFields}
          onSave={saveCalculatedField}
          onClose={() => {
            setShowFieldModal(false);
            setEditingField(null);
          }}
        />
      )}
    </>
  );
}