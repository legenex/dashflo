
import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, X, Search, GripVertical, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import CaseWhenFormulaBuilder from "./CaseWhenFormulaBuilder";

export default function QueryBuilder({ queryConfig, availableFields, widgetType, sourceConfig, onChange }) {
  const navigate = useNavigate();
  const [showMetricSelector, setShowMetricSelector] = useState(false);
  const [showCalculatedFields, setShowCalculatedFields] = useState(false);
  const [columnSearchTerm, setColumnSearchTerm] = useState('');
  const [customFieldName, setCustomFieldName] = useState('');

  const { data: libraryMetrics } = useQuery({
    queryKey: ['library-metrics-for-widget'],
    queryFn: () => base44.entities.MetricDefinition.filter({ enabled: true }),
    initialData: [],
  });

  const addFilter = () => {
    const newFilters = [...(queryConfig.filters || []), { field: '', operator: 'equals', value: '' }];
    onChange({ ...queryConfig, filters: newFilters });
  };

  const updateFilter = (index, key, value) => {
    const newFilters = [...(queryConfig.filters || [])];
    newFilters[index][key] = value;
    onChange({ ...queryConfig, filters: newFilters });
  };

  const removeFilter = (index) => {
    const newFilters = (queryConfig.filters || []).filter((_, i) => i !== index);
    onChange({ ...queryConfig, filters: newFilters });
  };

  const addAggregation = () => {
    const newAgg = {
      field: availableFields[0] || '',
      function: 'count',
      alias: '',
      format: 'number',
      visible: true,
      filters: [],
      filter_logic: 'all',
      position: queryConfig.aggregations?.length || 0
    };
    const newAggregations = [...(queryConfig.aggregations || []), newAgg];
    onChange({ ...queryConfig, aggregations: newAggregations });
  };

  const updateAggregation = (index, field, value) => {
    const newAggregations = [...(queryConfig.aggregations || [])];
    newAggregations[index] = { ...newAggregations[index], [field]: value };
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
      formula_type: 'simple', // Default to simple
      case_statements: [], // Initialize empty
      else_expression: { type: 'text', value: '' }, // Initialize default else
      format: 'number',
      visible: true
    };
    const newFields = [...(queryConfig.calculated_fields || []), newField];
    onChange({ ...queryConfig, calculated_fields: newFields });
  };

  const updateCalculatedField = (index, field) => {
    const newFields = [...(queryConfig.calculated_fields || [])];
    newFields[index] = field;
    onChange({ ...queryConfig, calculated_fields: newFields });
  };

  const removeCalculatedField = (index) => {
    const newFields = (queryConfig.calculated_fields || []).filter((_, i) => i !== index);
    onChange({ ...queryConfig, calculated_fields: newFields });
  };

  const handleMetricToggle = (metricId) => {
    const currentMetricIds = queryConfig.metric_ids || [];
    const isSelected = currentMetricIds.includes(metricId);

    if (isSelected) {
      const newMetricIds = currentMetricIds.filter(id => id !== metricId);
      onChange({ ...queryConfig, metric_ids: newMetricIds });
    } else {
      const newMetricIds = [...currentMetricIds, metricId];
      onChange({ ...queryConfig, metric_ids: newMetricIds });
    }
  };

  const handleMetricReorder = (result) => {
    if (!result.destination) return;
    
    const currentMetricIds = queryConfig.metric_ids || [];
    const items = Array.from(currentMetricIds);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    onChange({ ...queryConfig, metric_ids: items });
  };

  const removeMetric = (metricId) => {
    const currentMetricIds = queryConfig.metric_ids || [];
    const newMetricIds = currentMetricIds.filter(id => id !== metricId);
    onChange({ ...queryConfig, metric_ids: newMetricIds });
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

  // Get selected metrics in order
  const selectedMetrics = (queryConfig.metric_ids || [])
    .map(id => libraryMetrics.find(m => m.id === id))
    .filter(Boolean); // Filter out any metrics not found in libraryMetrics (e.g., if deleted)


  return (
    <div className="space-y-6">
      {/* Columns Selection */}
      {!queryConfig.group_by && widgetType === 'table' && availableFields.length > 0 && (
        <div className="space-y-3">
          <Label className="text-white">Select Columns to Display</Label>
          <p className="text-xs text-gray-400 mb-3">
            Choose which columns to display and optionally rename them. Drag to reorder.
          </p>
          
          {/* Add Custom Field */}
          <div className="flex gap-2">
            <Input
              placeholder="Type custom field name and press Add..."
              value={customFieldName}
              onChange={(e) => setCustomFieldName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomColumn();
                }
              }}
              className="glass-card border-white/10 text-white flex-1"
            />
            <Button
              type="button"
              onClick={addCustomColumn}
              disabled={!customFieldName.trim()}
              className="bg-[#00d4ff] hover:bg-[#00d4ff]/90 text-white whitespace-nowrap"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Custom
            </Button>
          </div>

          {/* Selected Columns (Draggable) */}
          {columnConfig.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-white text-sm">Selected Columns ({columnConfig.length})</Label>
                <p className="text-xs text-gray-400">Drag to reorder</p>
              </div>
              <DragDropContext onDragEnd={handleColumnReorder}>
                <Droppable droppableId="columns">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="space-y-2"
                    >
                      {columnConfig.map((col, index) => {
                        const isCustom = !availableFields.includes(col.field);
                        return (
                          <Draggable key={col.field} draggableId={col.field} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`flex items-center gap-3 p-2 rounded glass-card ${
                                  isCustom ? 'border-[#00d4ff]/30' : 'border-white/10'
                                } ${snapshot.isDragging ? 'opacity-50 shadow-lg' : ''}`}
                              >
                                <div
                                  {...provided.dragHandleProps}
                                  className="cursor-grab active:cursor-grabbing"
                                >
                                  <GripVertical className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
                                </div>
                                {isCustom && (
                                  <Badge className="bg-[#00d4ff]/20 text-[#00d4ff]">Custom</Badge>
                                )}
                                <span className="text-white text-sm font-mono flex-shrink-0">{col.field}</span>
                                <span className="text-gray-400">→</span>
                                <Input
                                  value={col.alias}
                                  onChange={(e) => updateColumnAlias(col.field, e.target.value)}
                                  placeholder={`Display as... (e.g., "Customer Name")`}
                                  className="glass-card border-white/10 text-white text-sm h-8 flex-1"
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
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search columns..."
              value={columnSearchTerm}
              onChange={(e) => setColumnSearchTerm(e.target.value)}
              className="glass-card border-white/10 text-white pl-10"
            />
            {columnSearchTerm && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setColumnSearchTerm('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Results Counter */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">
              {filteredColumns.length === availableFields.length 
                ? `${availableFields.length} columns available`
                : `${filteredColumns.length} of ${availableFields.length} columns shown`
              }
            </span>
            <span className="text-[#00d4ff]">
              {queryConfig.columns?.length || 0} selected
            </span>
          </div>

          {/* Available Columns List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto glass-card border-white/10 p-4 rounded-lg">
            {filteredColumns.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No columns match "{columnSearchTerm}"</p>
              </div>
            ) : (
              filteredColumns.map((field) => {
                const isSelected = isColumnSelected(field);

                return (
                  <div
                    key={field}
                    onClick={() => toggleColumn(field)}
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/30'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-white text-sm font-mono flex-1">{field}</span>
                    {isSelected && (
                      <Badge className="bg-[#00d4ff]/20 text-[#00d4ff] text-xs">
                        Selected
                      </Badge>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Grouping */}
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
              <Droppable droppableId="metrics">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2"
                  >
                    {selectedMetrics.map((metric, index) => (
                      <Draggable key={metric.id} draggableId={metric.id} index={index}>
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
                              className="cursor-grab active:cursor-grabbing"
                            >
                              <GripVertical className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">{metric.name}</span>
                                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                                  {metric.type}
                                </Badge>
                              </div>
                              {metric.description && (
                                <p className="text-gray-400 text-xs mt-1">{metric.description}</p>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditMetric(metric.id)}
                              className="text-[#00d4ff] hover:bg-[#00d4ff]/20"
                              title="Edit metric"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeMetric(metric.id)}
                              className="text-red-400 hover:bg-red-500/20"
                              title="Remove metric"
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

        {showMetricSelector && (
          <div className="glass-card border-white/10 p-4 rounded-lg space-y-2 max-h-[300px] overflow-y-auto">
            {libraryMetrics.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">
                No metrics available. Create metrics in the Metrics Library first.
              </p>
            ) : (
              libraryMetrics.map(metric => {
                const isSelected = (queryConfig.metric_ids || []).includes(metric.id);

                return (
                  <div
                    key={metric.id}
                    onClick={() => handleMetricToggle(metric.id)}
                    className={`p-3 rounded cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-purple-500/20 border border-purple-500/30'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="w-4 h-4"
                          />
                          <span className="text-white font-medium">{metric.name}</span>
                          <Badge className="bg-white/10 text-white text-xs">
                            {metric.type}
                          </Badge>
                        </div>
                        {metric.description && (
                          <p className="text-gray-400 text-xs mt-1 ml-6">{metric.description}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent toggling metric selection
                          handleEditMetric(metric.id);
                        }}
                        className="text-gray-400 hover:bg-gray-500/20 ml-2"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Local Aggregations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-white">Local Aggregations</Label>
            <p className="text-xs text-gray-400 mt-1">Define widget-specific calculations</p>
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

        {queryConfig.aggregations && queryConfig.aggregations.length > 0 && (
          <div className="space-y-3">
            {queryConfig.aggregations.map((agg, index) => (
              <div key={index} className="glass-card border-white/10 p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">Aggregation {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAggregation(index)}
                    className="text-red-400 hover:bg-red-500/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-white text-xs">Field</Label>
                    <Select
                      value={agg.field}
                      onValueChange={(v) => updateAggregation(index, 'field', v)}
                    >
                      <SelectTrigger className="glass-card border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-card border-white/10">
                        {availableFields.map(field => (
                          <SelectItem key={field} value={field} className="text-white">
                            {field}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-white text-xs">Function</Label>
                    <Select
                      value={agg.function}
                      onValueChange={(v) => updateAggregation(index, 'function', v)}
                    >
                      <SelectTrigger className="glass-card border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-card border-white/10">
                        <SelectItem value="count" className="text-white">Count</SelectItem>
                        <SelectItem value="sum" className="text-white">Sum</SelectItem>
                        <SelectItem value="avg" className="text-white">Average</SelectItem>
                        <SelectItem value="min" className="text-white">Min</SelectItem>
                        <SelectItem value="max" className="text-white">Max</SelectItem>
                        <SelectItem value="first" className="text-white">First</SelectItem>
                        <SelectItem value="last" className="text-white">Last</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-white text-xs">Display Name (Alias)</Label>
                    <Input
                      value={agg.alias || ''}
                      onChange={(e) => updateAggregation(index, 'alias', e.target.value)}
                      placeholder={`${agg.function}_${agg.field}`}
                      className="glass-card border-white/10 text-white"
                    />
                  </div>

                  <div>
                    <Label className="text-white text-xs">Format</Label>
                    <Select
                      value={agg.format || 'number'}
                      onValueChange={(v) => updateAggregation(index, 'format', v)}
                    >
                      <SelectTrigger className="glass-card border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-card border-white/10">
                        <SelectItem value="number" className="text-white">Number</SelectItem>
                        <SelectItem value="currency" className="text-white">Currency ($)</SelectItem>
                        <SelectItem value="percentage" className="text-white">Percentage (%)</SelectItem>
                        <SelectItem value="text" className="text-white">Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-white text-xs">Show on Dashboard</Label>
                  <input
                    type="checkbox"
                    checked={agg.visible !== false}
                    onChange={(e) => updateAggregation(index, 'visible', e.target.checked)}
                    className="w-4 h-4"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Calculated Fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-white">Calculated Fields</Label>
            <p className="text-xs text-gray-400 mt-1">Create custom formulas using aggregations</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCalculatedField}
            disabled={!queryConfig.aggregations || queryConfig.aggregations.length === 0}
            className="glass-card border-white/10 text-white disabled:opacity-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Calculated Field
          </Button>
        </div>

        {queryConfig.calculated_fields && queryConfig.calculated_fields.length > 0 && (
          <div className="space-y-3">
            {queryConfig.calculated_fields.map((field, index) => (
              <CalculatedFieldCard
                key={index}
                field={field}
                aggregations={queryConfig.aggregations || []}
                onChange={(updatedField) => updateCalculatedField(index, updatedField)}
                onRemove={() => removeCalculatedField(index)}
              />
            ))}
          </div>
        )}

        {(!queryConfig.aggregations || queryConfig.aggregations.length === 0) && (
          <p className="text-xs text-gray-400 italic">
            Add aggregations first before creating calculated fields
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-white">Filters</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addFilter}
            className="glass-card border-white/10 text-white"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Filter
          </Button>
        </div>

        {queryConfig.filters && queryConfig.filters.length > 0 && (
          <div className="space-y-2">
            {queryConfig.filters.map((filter, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 glass-card border-white/10 p-3 rounded">
                <Select
                  value={filter.field}
                  onValueChange={(v) => updateFilter(index, 'field', v)}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    {availableFields.map(field => (
                      <SelectItem key={field} value={field} className="text-white">
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filter.operator}
                  onValueChange={(v) => updateFilter(index, 'operator', v)}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="equals" className="text-white">Equals</SelectItem>
                    <SelectItem value="not_equals" className="text-white">Not Equals</SelectItem>
                    <SelectItem value="contains" className="text-white">Contains</SelectItem>
                    <SelectItem value="greater_than" className="text-white">Greater Than</SelectItem>
                    <SelectItem value="less_than" className="text-white">Less Than</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  value={filter.value}
                  onChange={(e) => updateFilter(index, 'value', e.target.value)}
                  placeholder="Value"
                  className="glass-card border-white/10 text-white"
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFilter(index)}
                  className="text-red-400 hover:bg-red-500/20"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sorting */}
      <div className="space-y-2">
        <Label className="text-white">Sort By</Label>
        <div className="flex gap-2">
          <Select
            value={queryConfig.sort_by?.replace('-', '') || ''}
            onValueChange={(v) => {
              const isDesc = queryConfig.sort_by?.startsWith('-');
              onChange({ ...queryConfig, sort_by: v ? (isDesc ? `-${v}` : v) : '' });
            }}
          >
            <SelectTrigger className="glass-card border-white/10 text-white flex-1">
              <SelectValue placeholder="No sorting" />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10">
              <SelectItem value={null} className="text-white">No sorting</SelectItem>
              {availableFields.map(field => (
                <SelectItem key={field} value={field} className="text-white">
                  {field}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={queryConfig.sort_by?.startsWith('-') ? 'desc' : 'asc'}
            onValueChange={(v) => {
              const field = queryConfig.sort_by?.replace('-', '');
              if (field) {
                onChange({ ...queryConfig, sort_by: v === 'desc' ? `-${field}` : field });
              }
            }}
          >
            <SelectTrigger className="glass-card border-white/10 text-white w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10">
              <SelectItem value="asc" className="text-white">Ascending</SelectItem>
              <SelectItem value="desc" className="text-white">Descending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Limit */}
      <div className="space-y-2">
        <Label className="text-white">Limit Results</Label>
        <Input
          type="number"
          value={queryConfig.limit || 100}
          onChange={(e) => onChange({ ...queryConfig, limit: parseInt(e.target.value) || 100 })}
          className="glass-card border-white/10 text-white"
          min="1"
        />
      </div>
    </div>
  );
}

// Separate component for calculated field card
function CalculatedFieldCard({ field, aggregations, onChange, onRemove }) {
  const [formulaParts, setFormulaParts] = useState(field.formula_parts || []);
  const [formulaType, setFormulaType] = useState(field.formula_type || 'simple');

  const availableFields = aggregations.map(agg => agg.alias || `${agg.function}_${agg.field}`).filter(f => f);
  
  const addFormulaPart = (type, value = '') => {
    const newParts = [...formulaParts, { type, value }];
    setFormulaParts(newParts);
    updateFormula(newParts);
  };

  const updateFormulaPart = (index, value) => {
    const newParts = [...formulaParts];
    newParts[index].value = value;
    setFormulaParts(newParts);
    updateFormula(newParts);
  };

  const removeFormulaPart = (index) => {
    const newParts = formulaParts.filter((_, i) => i !== index);
    setFormulaParts(newParts);
    updateFormula(newParts);
  };

  const updateFormula = (parts) => {
    const formulaString = parts.map(part => {
      if (part.type === 'field') {
        return `{${part.value}}`;
      } else if (part.type === 'operator') {
        return ` ${part.value} `;
      } else {
        return part.value;
      }
    }).join('');

    const updatedField = {
      ...field,
      formula_parts: parts,
      formula: formulaString.trim()
    };
    
    onChange(updatedField);
  };

  const handleFormulaTypeChange = (newType) => {
    setFormulaType(newType);
    // Clear formula parts/case statements when switching type
    if (newType === 'simple') {
      onChange({ ...field, formula_type: newType, case_statements: [], else_expression: { type: 'text', value: '' } });
    } else { // case_when
      onChange({ ...field, formula_type: newType, formula_parts: [], formula: '' });
    }
  };

  const handleCaseWhenChange = ({ caseStatements, elseExpression }) => {
    onChange({
      ...field,
      case_statements: caseStatements,
      else_expression: elseExpression,
      formula_type: 'case_when' // Ensure type is correct if not already set
    });
  };

  const renderFormula = () => {
    return formulaParts.map((part, index) => {
      if (part.type === 'field') {
        return (
          <div key={index} className="flex items-center gap-1">
            <Select value={part.value} onValueChange={(v) => updateFormulaPart(index, v)}>
              <SelectTrigger className="glass-card border-white/10 text-white w-32">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent className="glass-card border-white/10 text-white">
                {availableFields.map(f => (
                  <SelectItem key={f} value={f} className="text-white">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeFormulaPart(index)}
              className="h-8 w-8 text-red-400 hover:bg-red-500/20"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );
      } else if (part.type === 'operator') {
        return (
          <div key={index} className="flex items-center gap-1">
            <Badge className="bg-[#a855f7]/20 text-[#a855f7] border-[#a855f7]/30 text-lg px-3 py-1">
              {part.value}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeFormulaPart(index)}
              className="h-8 w-8 text-red-400 hover:bg-red-500/20"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );
      } else {
        return (
          <div key={index} className="flex items-center gap-1">
            <Input
              type="number"
              value={part.value}
              onChange={(e) => updateFormulaPart(index, e.target.value)}
              className="glass-card border-white/10 text-white w-20"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeFormulaPart(index)}
              className="h-8 w-8 text-red-400 hover:bg-red-500/20"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );
      }
    });
  };

  return (
    <div className="p-4 glass-card border-white/10 rounded-lg space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-white text-xs">Field Name *</Label>
          <Input
            placeholder="e.g., Profit Margin"
            value={field.name || ''}
            onChange={(e) => onChange({ ...field, name: e.target.value })}
            className="glass-card border-white/10 text-white"
          />
        </div>

        <div>
          <Label className="text-white text-xs">Display Format</Label>
          <Select 
            value={field.format || 'number'}
            onValueChange={(v) => onChange({ ...field, format: v })}
          >
            <SelectTrigger className="glass-card border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10 text-white">
              <SelectItem value="number" className="text-white">Number (1,234)</SelectItem>
              <SelectItem value="currency" className="text-white">Currency ($1,234.56)</SelectItem>
              <SelectItem value="percentage" className="text-white">Percentage (12.34%)</SelectItem>
              <SelectItem value="text" className="text-white">Plain Text</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1 flex items-center justify-between">
            <Label className="text-white text-xs">Visible</Label>
            <input
              type="checkbox"
              checked={field.visible !== false}
              onChange={(e) => onChange({ ...field, visible: e.target.checked })}
              className="w-4 h-4"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="text-red-400 hover:bg-red-500/20"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Formula Type Selector */}
      <div>
        <Label className="text-white text-sm mb-2 block">Formula Type</Label>
        <Select value={formulaType} onValueChange={handleFormulaTypeChange}>
          <SelectTrigger className="glass-card border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-card border-white/10">
            <SelectItem value="simple" className="text-white">Simple Arithmetic</SelectItem>
            <SelectItem value="case_when" className="text-white">Conditional (CASE WHEN)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conditional Rendering Based on Formula Type */}
      {formulaType === 'simple' ? (
        <div className="space-y-3">
          <div>
            <Label className="text-white text-sm mb-2 block">Build Formula</Label>
            <div className="flex flex-wrap items-center gap-2 p-3 glass-card border-white/10 rounded-lg min-h-[60px]">
              {formulaParts.length === 0 ? (
                <p className="text-gray-400 text-sm">Click buttons below to build your formula</p>
              ) : (
                renderFormula()
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addFormulaPart('field', '')}
              className="glass-card border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10"
            >
              <Plus className="w-3 h-3 mr-1" />
              Field
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addFormulaPart('number', '0')}
              className="glass-card border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/10"
            >
              <Plus className="w-3 h-3 mr-1" />
              Number
            </Button>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addFormulaPart('operator', '+')}
                className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
              >
                +
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addFormulaPart('operator', '-')}
                className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
              >
                −
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addFormulaPart('operator', '*')}
                className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
              >
                ×
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addFormulaPart('operator', '/')}
                className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
              >
                ÷
              </Button>
            </div>
          </div>

          {formulaParts.length > 0 && (
            <div className="p-2 bg-white/5 rounded text-xs">
              <span className="text-gray-400">Formula: </span>
              <code className="text-[#00d4ff]">
                {formulaParts.map(p => p.type === 'field' ? `{${p.value}}` : p.type === 'operator' ? ` ${p.value} ` : p.value).join('')}
              </code>
            </div>
          )}
        </div>
      ) : (
        <CaseWhenFormulaBuilder
          caseStatements={field.case_statements || []}
          elseExpression={field.else_expression || { type: 'text', value: '' } }
          availableFields={availableFields}
          onChange={handleCaseWhenChange}
        />
      )}
    </div>
  );
}
