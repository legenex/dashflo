
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";

import AggregationBuilder from "./AggregationBuilder";
import CalculatedFieldBuilderStandalone from "./CalculatedFieldBuilderStandalone";

export default function MetricEditor({ metric, onClose }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'aggregation',
    data_source: '',
    category: '',
    definition: {
      field: '',
      function: 'sum',
      alias: '',
      format: 'number',
      visible: true,
      filters: [],
      filter_logic: 'all',
      position: 0
    },
    enabled: true
  });

  const { data: syncConfigs } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  const { data: allMetrics } = useQuery({
    queryKey: ['all-metrics'],
    queryFn: () => base44.entities.MetricDefinition.list(),
    initialData: [],
  });

  useEffect(() => {
    if (metric) {
      console.log('[MetricEditor] Loading metric:', metric);
      setFormData({
        name: metric.name,
        description: metric.description || '',
        type: metric.type,
        data_source: metric.data_source || '',
        category: metric.category || '',
        definition: metric.definition,
        enabled: metric.enabled !== undefined ? metric.enabled : true
      });
    }
  }, [metric]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      console.log('[MetricEditor] Saving metric:', JSON.stringify(data, null, 2));
      if (metric) {
        return base44.entities.MetricDefinition.update(metric.id, data);
      }
      return base44.entities.MetricDefinition.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['metrics']);
      queryClient.invalidateQueries(['all-metrics']);
      alert(metric ? "Metric updated successfully" : "Metric created successfully");
      onClose();
    },
    onError: (error) => {
      console.error('[MetricEditor] Error saving metric:', error);
      alert("Error saving metric: " + error.message);
    }
  });

  const handleSave = () => {
    if (!formData.name) {
      alert("Please provide a metric name");
      return;
    }

    // Validate based on type
    if (formData.type === 'aggregation') {
      if (!formData.definition.field) {
        alert("Please select a field for aggregation");
        return;
      }
      if (!formData.definition.alias) {
        formData.definition.alias = formData.name;
      }
    } else if (formData.type === 'calculated_field') {
      const formulaType = formData.definition.formula_type || 'simple';
      
      if (formulaType === 'simple') {
        if (!formData.definition.formula || !formData.definition.formula_parts || formData.definition.formula_parts.length === 0) {
          alert("Please build a formula for the calculated field");
          return;
        }
      } else if (formulaType === 'case_when') {
        if (!formData.definition.case_statements || formData.definition.case_statements.length === 0) {
          alert("Please add at least one WHEN condition for the CASE WHEN formula");
          return;
        }
        // Validate that each case statement has a condition and expression
        for (const stmt of formData.definition.case_statements) {
          if (!stmt.when_condition || !stmt.when_condition.field || !stmt.then_expression) {
            alert("Each WHEN condition must have a field, operator, value, and THEN expression");
            return;
          }
        }
      }
      
      formData.definition.name = formData.name;
    }

    console.log('[MetricEditor] Final data to save:', JSON.stringify(formData, null, 2));
    saveMutation.mutate(formData);
  };

  const availableFields = React.useMemo(() => {
    if (!formData.data_source) return [];
    
    const syncConfig = syncConfigs.find(s =>
      s.id === formData.data_source ||
      s.name === formData.data_source ||
      s.local_table_name === formData.data_source
    );

    return syncConfig?.detected_schema?.fields?.map(f => f.name) || [];
  }, [formData.data_source, syncConfigs]);

  const availableAggregations = React.useMemo(() => {
    return allMetrics
      .filter(m => m.type === 'aggregation' && m.enabled && m.id !== metric?.id)
      .map(m => ({
        field: m.definition?.field || '',
        function: m.definition?.function || 'sum',
        alias: m.definition?.alias || m.name,
        format: m.definition?.format || 'number'
      }));
  }, [allMetrics, metric]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={onClose}
          className="text-white hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Metrics
        </Button>
        <Button
          onClick={handleSave}
          className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
          disabled={saveMutation.isPending}
        >
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? 'Saving...' : 'Save Metric'}
        </Button>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">
            {metric ? 'Edit Metric' : 'Create New Metric'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-white">Metric Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Total Revenue, Net Profit"
                className="glass-card border-white/10 text-white"
              />
            </div>

            <div>
              <Label className="text-white">Category</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Leads, Revenue, Performance"
                className="glass-card border-white/10 text-white"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="text-white">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Explain what this metric measures..."
                className="glass-card border-white/10 text-white"
                rows={2}
              />
            </div>

            <div>
              <Label className="text-white">Type *</Label>
              <Select 
                value={formData.type} 
                onValueChange={(v) => {
                  const newDef = v === 'aggregation' ? {
                    field: '',
                    function: 'sum',
                    alias: formData.name || '',
                    format: 'number',
                    visible: true,
                    filters: [],
                    filter_logic: 'all',
                    position: 0
                  } : {
                    name: formData.name || '',
                    formula_type: 'simple', // Default to simple
                    formula: '',
                    formula_parts: [],
                    case_statements: [], // Initialize for case_when
                    else_expression: '', // Initialize for case_when
                    format: 'number',
                    visible: true,
                    position: 0
                  };
                  setFormData({ ...formData, type: v, definition: newDef });
                }}
              >
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10 text-white">
                  <SelectItem value="aggregation" className="text-white">
                    Aggregation (Sum, Count, Avg, etc.)
                  </SelectItem>
                  <SelectItem value="calculated_field" className="text-white">
                    Calculated Field (Formula)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white">Data Source (Optional)</Label>
              <Select 
                value={formData.data_source} 
                onValueChange={(v) => setFormData({ ...formData, data_source: v })}
              >
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue placeholder="Leave empty if this metric can work with any data source" />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10 text-white">
                  <SelectItem value={null} className="text-white">Any data source</SelectItem>
                  {syncConfigs.map(source => (
                    <SelectItem 
                      key={source.id} 
                      value={source.local_table_name || source.name} 
                      className="text-white"
                    >
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                Leave empty if this metric can work with any data source
              </p>
            </div>
          </div>

          {/* Metric Configuration */}
          <div className="border-t border-white/10 pt-6">
            <Label className="text-white text-lg mb-4 block">Metric Configuration</Label>
            
            {formData.type === 'aggregation' ? (
              <>
                <p className="text-sm text-gray-400 mb-4">
                  {availableAggregations.length} aggregation metrics available: {availableAggregations.map(a => a.alias).join(', ')}
                </p>
                <AggregationBuilder
                  definition={formData.definition}
                  availableFields={availableFields}
                  onChange={(def) => {
                    console.log('[MetricEditor] Aggregation changed:', def);
                    setFormData({ ...formData, definition: def });
                  }}
                />
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400 mb-4">
                  {availableAggregations.length} aggregation metrics available: {availableAggregations.map(a => a.alias).join(', ')}
                </p>
                <CalculatedFieldBuilderStandalone
                  field={formData.definition}
                  aggregations={availableAggregations}
                  onChange={(def) => {
                    console.log('[MetricEditor] Calculated field changed:', def);
                    setFormData({ ...formData, definition: { ...def, name: formData.name } });
                  }}
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
