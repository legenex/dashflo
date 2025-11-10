import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Plus, X, Search, Eye, EyeOff, GripVertical, Pencil } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";

import AggregationBuilder from "./AggregationBuilder";
import CalculatedFieldBuilder from "./CalculatedFieldBuilder";

export default function QueryBuilder({ queryConfig, availableFields, widgetType, sourceConfig, onChange }) {
  const [columnSearchTerm, setColumnSearchTerm] = useState('');
  const [customFieldName, setCustomFieldName] = useState('');
  const [showMetricSelector, setShowMetricSelector] = useState(false);
  const navigate = useNavigate();

  const { data: libraryMetrics } = useQuery({
    queryKey: ['library-metrics-available'],
    queryFn: () => base44.entities.MetricDefinition.filter({ enabled: true }),
    initialData: [],
  });

  const addMetric = (metricId) => {
    const currentIds = queryConfig.metric_ids || [];
    if (currentIds.includes(metricId)) return;
    onChange({ ...queryConfig, metric_ids: [...currentIds, metricId] });
  };

  const removeMetric = (metricId) => {
    const currentIds = queryConfig.metric_ids || [];
    onChange({ ...queryConfig, metric_ids: currentIds.filter(id => id !== metricId) });
  };

  const handleMetricReorder = (result) => {
    if (!result.destination) return;
    
    // Prevent reordering if dropped in the same position
    if (result.destination.index === result.source.index) return;
    
    const currentMetricIds = queryConfig.metric_ids || [];
    const items = Array.from(currentMetricIds);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Create a completely new queryConfig object to ensure re-render
    const newQueryConfig = {
      ...queryConfig,
      metric_ids: items
    };
    
    onChange(newQueryConfig);
  };

  const handleEditMetric = (metricId) => {
    navigate(createPageUrl(`MetricsLibrary?edit=${metricId}`));
  };

  const toggleColumn = (fieldName) => {
    const columns = queryConfig.columns || [];
    const columnConfig = Array.isArray(columns[0]) 
      ? columns 
      : columns.map(col => typeof col === 'string' ? { field: col, alias: '', visible: true } : col);

    const existingIndex = columnConfig.findIndex(c => 
      (typeof c === 'string' ? c : c.field) === fieldName
    );

    if (existingIndex >= 0) {
      const newColumns = columnConfig.filter((_, i) => i !== existingIndex);
      onChange({ ...queryConfig, columns: newColumns });
    } else {
      const newColumns = [...columnConfig, { field: fieldName, alias: '', visible: true }];
      onChange({ ...queryConfig, columns: newColumns });
    }
  };

  const addCustomColumn = () => {
    if (!customFieldName.trim()) return;
    
    const columns = queryConfig.columns || [];
    const columnConfig = columns.map(col => 
      typeof col === 'string' ? { field: col, alias: '', visible: true } : col
    );
    
    const exists = columnConfig.some(col => col.field === customFieldName.trim()) || availableFields.includes(customFieldName.trim());
    if (exists) {
      alert(`The field "${customFieldName.trim()}" is already added or exists in available fields.`);
      return;
    }
    
    const newColumns = [...columnConfig, { field: customFieldName.trim(), alias: '', visible: true }];
    onChange({ ...queryConfig, columns: newColumns });
    setCustomFieldName('');
  };

  const updateColumnAlias = (fieldName, alias) => {
    const columns = queryConfig.columns || [];
    const columnConfig = columns.map(col => 
      typeof col === 'string' ? { field: col, alias: '', visible: true } : col
    );

    const updatedColumns = columnConfig.map(col => {
      if (col.field === fieldName) {
        return { ...col, alias };
      }
      return col;
    });

    onChange({ ...queryConfig, columns: updatedColumns });
  };

  const handleColumnReorder = (result) => {
    if (!result.destination) return;

    const columns = queryConfig.columns || [];
    const columnConfig = columns.map(col => 
      typeof col === 'string' ? { field: col, alias: '', visible: true } : col
    );

    const items = Array.from(columnConfig);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    onChange({ ...queryConfig, columns: items });
  };

  const isColumnSelected = (fieldName) => {
    const columns = queryConfig.columns || [];
    if (columns.length === 0) return false;
    
    return columns.some(col => {
      if (typeof col === 'string') return col === fieldName;
      return col.field === fieldName;
    });
  };

  const getColumnAlias = (fieldName) => {
    const columns = queryConfig.columns || [];
    const column = columns.find(col => {
      if (typeof col === 'string') return col === fieldName;
      return col.field === fieldName;
    });
    
    if (typeof column === 'string') return '';
    return column?.alias || '';
  };

  const filteredColumns = availableFields.filter(field =>
    field.toLowerCase().includes(columnSearchTerm.toLowerCase())
  );

  const columns = queryConfig.columns || [];
  const columnConfig = columns.map(col => 
    typeof col === 'string' ? { field: col, alias: '', visible: true } : col
  );

  // Get selected metrics in order using useMemo
  const selectedMetrics = React.useMemo(() => {
    const metricIds = queryConfig.metric_ids || [];
    return metricIds
      .map(id => libraryMetrics.find(m => m.id === id))
      .filter(Boolean);
  }, [queryConfig.metric_ids, libraryMetrics]);

  const aggregationsWithoutLibraryMetrics = (queryConfig.aggregations || []).filter(agg => !agg._fromLibrary);
  const calculatedFieldsWithoutLibraryMetrics = (queryConfig.calculated_fields || []).filter(cf => !cf._fromLibrary);

  const addAggregation = () => {
    const newAgg = {
      field: availableFields[0] || '',
      function: 'sum',
      alias: '',
      format: 'number',
      visible: true,
      filters: [],
      filter_logic: 'all',
      position: (queryConfig.aggregations || []).length
    };
    onChange({
      ...queryConfig,
      aggregations: [...(queryConfig.aggregations || []), newAgg]
    });
  };

  const updateAggregation = (index, updatedAgg) => {
    const newAggregations = [...(queryConfig.aggregations || [])];
    newAggregations[index] = updatedAgg;
    onChange({ ...queryConfig, aggregations: newAggregations });
  };

  const removeAggregation = (index) => {
    const newAggregations = (queryConfig.aggregations || []).filter((_, i) => i !== index);
    onChange({ ...queryConfig, aggregations: newAggregations });
  };

  const addCalculatedField = () => {
    const newField = {
      name: '',
      formula: '',
      formula_parts: [],
      format: 'number',
      visible: true,
      position: (queryConfig.calculated_fields || []).length
    };
    onChange({
      ...queryConfig,
      calculated_fields: [...(queryConfig.calculated_fields || []), newField]
    });
  };

  const updateCalculatedField = (index, updatedField) => {
    const newFields = [...(queryConfig.calculated_fields || [])];
    newFields[index] = updatedField;
    onChange({ ...queryConfig, calculated_fields: newFields });
  };

  const removeCalculatedField = (index) => {
    const newFields = (queryConfig.calculated_fields || []).filter((_, i) => i !== index);
    onChange({ ...queryConfig, calculated_fields: newFields });
  };

  const supportsGrouping = ['table', 'line_chart', 'bar_chart', 'pie_chart', 'area_chart'].includes(widgetType);

  return (
    <div className="space-y-6">
      {/* Columns Selection */}
      {widgetType === 'table' && !queryConfig.group_by && (
        <div className="space-y-3">
          <Label className="text-white">Select Columns</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search columns..."
              value={columnSearchTerm}
              onChange={(e) => setColumnSearchTerm(e.target.value)}
              className="glass-card border-white/10 text-white pl-10"
            />
          </div>

          {columnConfig.length > 0 && (
            <div className="space-y-2">
              <Label className="text-white text-sm">Selected Columns ({columnConfig.length})</Label>
              <DragDropContext onDragEnd={handleColumnReorder}>
                <Droppable droppableId="columns">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="space-y-2"
                    >
                      {columnConfig.map((col, index) => (
                        <Draggable key={col.field} draggableId={col.field} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-center gap-2 p-2 rounded glass-card border-white/10 ${
                                snapshot.isDragging ? 'opacity-50' : ''
                              }`}
                            >
                              <div
                                {...provided.dragHandleProps}
                                className="cursor-grab active:cursor-grabbing"
                              >
                                <GripVertical className="w-4 h-4 text-gray-400" />
                              </div>
                              <span className="text-white flex-1">{col.field}</span>
                              <Input
                                placeholder="Alias (optional)"
                                value={col.alias || ''}
                                onChange={(e) => updateColumnAlias(col.field, e.target.value)}
                                className="glass-card border-white/10 text-white w-48"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleColumn(col.field)}
                                className="text-red-400 hover:bg-red-500/20"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {filteredColumns
              .filter(field => !isColumnSelected(field))
              .map(field => (
                <Button
                  key={field}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleColumn(field)}
                  className="glass-card border-white/10 text-white"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {field}
                </Button>
              ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Add custom field name..."
              value={customFieldName}
              onChange={(e) => setCustomFieldName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCustomColumn()}
              className="glass-card border-white/10 text-white"
            />
            <Button
              type="button"
              onClick={addCustomColumn}
              className="glass-card border-white/10 text-white"
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Grouping */}
      {supportsGrouping && (
        <div className="space-y-2">
          <Label className="text-white">Group By</Label>
          <Select
            value={queryConfig.group_by || ''}
            onValueChange={(v) => onChange({ ...queryConfig, group_by: v || undefined })}
          >
            <SelectTrigger className="glass-card border-white/10 text-white">
              <SelectValue placeholder="No grouping" />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10">
              <SelectItem value={null} className="text-white">No grouping</SelectItem>
              {availableFields.map(field => (
                <SelectItem key={field} value={field} className="text-white">
                  {field}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Metrics from Library */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-white">Metrics from Library</Label>
            <p className="text-xs text-gray-400 mt-1">Add pre-configured metrics from your metrics library</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowMetricSelector(!showMetricSelector)}
            className="glass-card border-white/10 text-white"
          >
            {showMetricSelector ? 'Hide' : 'Show'} Metrics
          </Button>
        </div>

        {selectedMetrics.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-white text-sm">Selected Metrics ({selectedMetrics.length})</Label>
              <p className="text-xs text-gray-400">Drag to reorder</p>
            </div>
            <DragDropContext onDragEnd={handleMetricReorder}>
              <Droppable droppableId="metrics" type="METRIC">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2"
                  >
                    {selectedMetrics.map((metric, index) => (
                      <Draggable 
                        key={`metric-${metric.id}`} 
                        draggableId={`metric-${metric.id}`} 
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-3 p-3 rounded glass-card border-purple-500/30 ${
                              snapshot.isDragging ? 'opacity-50 shadow-lg' : ''
                            }`}
                          >
                            <div
                              {...provided.dragHandleProps}
                              className="cursor-grab active:cursor-grabbing flex-shrink-0"
                            >
                              <GripVertical className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium truncate">{metric.name}</span>
                                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 flex-shrink-0">
                                  {metric.type}
                                </Badge>
                              </div>
                              {metric.description && (
                                <p className="text-gray-400 text-xs mt-1 truncate">{metric.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditMetric(metric.id);
                                }}
                                className="text-[#00d4ff] hover:bg-[#00d4ff]/20"
                                title="Edit metric"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeMetric(metric.id);
                                }}
                                className="text-red-400 hover:bg-red-500/20"
                                title="Remove metric"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        )}

        {showMetricSelector && (
          <div className="space-y-2 p-4 glass-card border-[#00d4ff]/30 rounded-lg">
            <p className="text-sm text-gray-400">Click to add metrics from your library:</p>
            <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
              {libraryMetrics.length === 0 ? (
                <p className="text-gray-400 text-sm">
                  No metrics available. <a href="/metrics-library" className="text-[#00d4ff] hover:underline">Create some metrics first</a>.
                </p>
              ) : (
                libraryMetrics
                  .filter(metric => !(queryConfig.metric_ids || []).includes(metric.id))
                  .map(metric => (
                    <Button
                      key={metric.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addMetric(metric.id)}
                      className="glass-card border-purple-500/30 text-white hover:bg-purple-500/20"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {metric.name}
                      <Badge className="ml-2 bg-purple-500/20 text-purple-400 border-purple-500/30">
                        {metric.type === 'aggregation' ? 'Agg' : 'Calc'}
                      </Badge>
                    </Button>
                  ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Local Aggregations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-white">Local Aggregations</Label>
            <p className="text-xs text-gray-400 mt-1">Create widget-specific aggregations (not saved to library)</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addAggregation}
            className="glass-card border-white/10 text-white"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Aggregation
          </Button>
        </div>

        {aggregationsWithoutLibraryMetrics.map((agg, index) => (
          <Card key={index} className="glass-card border-white/10">
            <CardContent className="p-4">
              <AggregationBuilder
                definition={agg}
                availableFields={availableFields}
                onChange={(updated) => updateAggregation(index, updated)}
                onRemove={() => removeAggregation(index)}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Local Calculated Fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-white">Local Calculated Fields</Label>
            <p className="text-xs text-gray-400 mt-1">Create widget-specific formulas (not saved to library)</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCalculatedField}
            className="glass-card border-white/10 text-white"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Calculated Field
          </Button>
        </div>

        {calculatedFieldsWithoutLibraryMetrics.map((field, index) => (
          <Card key={index} className="glass-card border-white/10">
            <CardContent className="p-4">
              <CalculatedFieldBuilder
                field={field}
                aggregations={[
                  ...(queryConfig.aggregations || []),
                  ...selectedMetrics.filter(m => m.type === 'aggregation').map(m => ({
                    field: m.definition?.field || '',
                    function: m.definition?.function || 'sum',
                    alias: m.definition?.alias || m.name,
                    format: m.definition?.format || 'number'
                  }))
                ]}
                onChange={(updated) => updateCalculatedField(index, updated)}
                onRemove={() => removeCalculatedField(index)}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sorting */}
      <div className="space-y-2">
        <Label className="text-white">Sort By</Label>
        <Select
          value={queryConfig.sort_by || ''}
          onValueChange={(v) => onChange({ ...queryConfig, sort_by: v || undefined })}
        >
          <SelectTrigger className="glass-card border-white/10 text-white">
            <SelectValue placeholder="No sorting" />
          </SelectTrigger>
          <SelectContent className="glass-card border-white/10">
            <SelectItem value={null} className="text-white">No sorting</SelectItem>
            {availableFields.map(field => (
              <React.Fragment key={field}>
                <SelectItem value={field} className="text-white">{field} (Ascending)</SelectItem>
                <SelectItem value={`-${field}`} className="text-white">{field} (Descending)</SelectItem>
              </React.Fragment>
            ))}
            {(queryConfig.aggregations || []).map((agg, idx) => {
              const aggName = agg.alias || `${agg.function}_${agg.field}`;
              return (
                <React.Fragment key={`agg-${idx}`}>
                  <SelectItem value={aggName} className="text-white">{aggName} (Ascending)</SelectItem>
                  <SelectItem value={`-${aggName}`} className="text-white">{aggName} (Descending)</SelectItem>
                </React.Fragment>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Limit */}
      {widgetType === 'table' && (
        <div className="space-y-2">
          <Label className="text-white">Row Limit</Label>
          <Input
            type="number"
            value={queryConfig.limit || ''}
            onChange={(e) => onChange({ ...queryConfig, limit: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="No limit"
            className="glass-card border-white/10 text-white"
          />
        </div>
      )}
    </div>
  );
}