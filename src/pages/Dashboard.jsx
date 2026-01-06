import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  DollarSign,
  Users,
  BarChart3,
  Calendar,
  Download,
  RefreshCcw,
  Filter,
  Plus,
  X,
  MoreVertical,
  Pencil,
  EyeOff,
  ChevronDown
} from "lucide-react";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay, subMonths } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

import KPICard from "../components/dashboard/KPICard";
import RecentLeadsTable from "../components/dashboard/RecentLeadsTable";
import WidgetRenderer from "../components/widgets/WidgetRenderer";
import WidgetSidebar from "../components/widgets/WidgetSidebar";
import FilterManager from "../components/dashboard/FilterManager";
import SavedFilterBar from "../components/dashboard/SavedFilterBar";

const COLORS = ['#00d4ff', '#a855f7', '#10b981', '#f59e0b', '#ef4444'];

const DATE_PRESETS = [
  { 
    label: 'Today', 
    getValue: () => ({
      start: format(startOfDay(new Date()), 'yyyy-MM-dd'),
      end: format(endOfDay(new Date()), 'yyyy-MM-dd')
    })
  },
  { 
    label: 'Yesterday', 
    getValue: () => ({
      start: format(subDays(new Date(), 1), 'yyyy-MM-dd'),
      end: format(subDays(new Date(), 1), 'yyyy-MM-dd')
    })
  },
  { 
    label: 'Last 7 days', 
    getValue: () => ({
      start: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
      end: format(new Date(), 'yyyy-MM-dd')
    })
  },
  { 
    label: 'Last 30 days', 
    getValue: () => ({
      start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
      end: format(new Date(), 'yyyy-MM-dd')
    })
  },
  { 
    label: 'This month', 
    getValue: () => ({
      start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    })
  },
  { 
    label: 'Last month', 
    getValue: () => {
      const lastMonth = subMonths(new Date(), 1);
      return {
        start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
        end: format(endOfMonth(lastMonth), 'yyyy-MM-dd')
      };
    }
  },
  { 
    label: 'Custom', 
    getValue: null
  }
];

export default function Dashboard() {
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  const [selectedPreset, setSelectedPreset] = useState('This month');

  const [customFilters, setCustomFilters] = useState([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [savedFilterValues, setSavedFilterValues] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [pendingWidgetOrder, setPendingWidgetOrder] = useState([]);
  const [isExporting, setIsExporting] = useState(false);

  const queryClient = useQueryClient();

  const { data: widgets } = useQuery({
    queryKey: ['dashboard-widgets'],
    queryFn: async () => {
      const allWidgets = await base44.entities.Widget.filter({ enabled: true }, 'position');
      // Filter widgets that have 'Dashboard' in their dashboard_pages array
      return allWidgets.filter(w => 
        (Array.isArray(w.dashboard_pages) && w.dashboard_pages.includes('Dashboard')) ||
        w.dashboard_page === 'Dashboard' // Backward compatibility
      );
    },
    initialData: [],
  });

  const { data: syncConfigs } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  const { data: savedFilters } = useQuery({
    queryKey: ['saved-filters', 'Dashboard'],
    queryFn: () => base44.entities.SavedFilter.filter({ dashboard_page: 'Dashboard', enabled: true }, 'position'),
    initialData: [],
  });

  const updateFilterPositionsMutation = useMutation({
    mutationFn: async (filters) => {
      await Promise.all(
        filters.map(filter =>
          base44.entities.SavedFilter.update(filter.id, { position: filter.position })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['saved-filters']);
    },
  });

  const updateWidgetPositionsMutation = useMutation({
    mutationFn: async (widgets) => {
      await Promise.all(
        widgets.map(widget =>
          base44.entities.Widget.update(widget.id, { position: widget.position })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboard-widgets']);
      setEditMode(false);
      setPendingWidgetOrder([]);
    },
  });

  const availableFields = React.useMemo(() => {
    const fieldsSet = new Set();

    widgets.forEach(widget => {
      const syncConfig = syncConfigs.find(s =>
        s.id === widget.data_source ||
        s.name === widget.data_source ||
        s.local_table_name === widget.data_source
      );

      if (syncConfig?.detected_schema?.fields) {
        syncConfig.detected_schema.fields.forEach(field => {
          fieldsSet.add(field.name);
        });
      }
    });

    return Array.from(fieldsSet).sort();
  }, [widgets, syncConfigs]);

  const addFilter = () => {
    setCustomFilters([...customFilters, { field: '', operator: 'equals', value: '' }]);
  };

  const updateFilter = (index, key, value) => {
    const newFilters = [...customFilters];
    newFilters[index][key] = value;
    setCustomFilters(newFilters);
  };

  const removeFilter = (index) => {
    setCustomFilters(customFilters.filter((_, i) => i !== index));
  };

  const clearAllFilters = () => {
    setCustomFilters([]);
    setSavedFilterValues({});
  };

  const handleSavedFilterChange = (field, value, operator) => {
    setSavedFilterValues({ ...savedFilterValues, [field]: value });

    const existingIndex = customFilters.findIndex(f => f.field === field);
    const newFilter = { field, value, operator };

    if (value === '' || value === null || value === undefined) {
      if (existingIndex >= 0) {
        setCustomFilters(customFilters.filter((_, i) => i !== existingIndex));
      }
    } else {
      if (existingIndex >= 0) {
        const newFilters = [...customFilters];
        newFilters[existingIndex] = newFilter;
        setCustomFilters(newFilters);
      } else {
        setCustomFilters([...customFilters, newFilter]);
      }
    }
  };

  const handleFilterReorder = (reorderedFilters) => {
    updateFilterPositionsMutation.mutate(reorderedFilters);
  };

  const handleWidgetDragEnd = (result) => {
    if (!editMode || !result.destination) return;
    
    const items = Array.from(pendingWidgetOrder.length > 0 ? pendingWidgetOrder : widgets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update positions in pending state
    const updatedItems = items.map((item, index) => ({
      ...item,
      position: index
    }));
    
    setPendingWidgetOrder(updatedItems);
  };

  const handleSaveLayout = () => {
    if (pendingWidgetOrder.length > 0) {
      updateWidgetPositionsMutation.mutate(pendingWidgetOrder);
    } else {
      setEditMode(false);
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setPendingWidgetOrder([]);
  };

  const refetchAllWidgets = () => {
    queryClient.invalidateQueries(['widget-data']);
  };

  const handleExportReport = async () => {
    try {
      setIsExporting(true);
      
      // Fetch data for all widgets
      const widgetDataPromises = widgets.map(async (widget) => {
        try {
          const response = await base44.functions.invoke('fetchWidgetData', {
            data_source: widget.data_source,
            query_config: widget.query_config,
            date_range: dateRange,
            custom_filters: customFilters
          });
          return {
            widgetName: widget.name,
            widgetType: widget.type,
            data: response.data
          };
        } catch (error) {
          console.error(`Error fetching data for widget ${widget.name}:`, error);
          return {
            widgetName: widget.name,
            widgetType: widget.type,
            data: [],
            error: error.message
          };
        }
      });

      const allWidgetData = await Promise.all(widgetDataPromises);

      // Create CSV content
      let csvContent = `Dashboard Report - ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}\n`;
      csvContent += `Date Range: ${dateRange.start} to ${dateRange.end}\n\n`;

      allWidgetData.forEach(({ widgetName, widgetType, data, error }) => {
        csvContent += `\n"${widgetName}" (${widgetType})\n`;
        csvContent += '='.repeat(50) + '\n';

        if (error) {
          csvContent += `Error: "${error}"\n`;
          return;
        }

        if (!data || data.length === 0) {
          csvContent += 'No data available\n';
          return;
        }

        // Get headers from first data row
        const headers = Object.keys(data[0]).filter(key => 
          !key.startsWith('_metadata') // Exclude internal metadata
        );
        csvContent += headers.map(header => {
          const stringValue = String(header);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',') + '\n';

        // Add data rows
        data.forEach(row => {
          const values = headers.map(header => {
            const value = row[header];
            // Handle values that might contain commas or quotes
            if (value === null || value === undefined) return '';
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          });
          csvContent += values.join(',') + '\n';
        });
      });

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `dashboard-report-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert('Report exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export report: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePresetChange = (preset) => {
    setSelectedPreset(preset.label);
    if (preset.getValue) {
      const newRange = preset.getValue();
      setDateRange(newRange);
    }
  };

  const handleManualDateChange = (key, value) => {
    setSelectedPreset('Custom');
    setDateRange({ ...dateRange, [key]: value });
  };

  const displayWidgets = pendingWidgetOrder.length > 0 ? pendingWidgetOrder : widgets;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard Overview</h1>
          <p className="text-gray-400">Monitor your lead generation performance in real-time</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="glass-card border-white/10 text-white hover:bg-white/10"
            onClick={refetchAllWidgets}
            disabled={editMode || isExporting}
          >
            <RefreshCcw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button 
            className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
            onClick={handleExportReport}
            disabled={editMode || isExporting || widgets.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export Report'}
          </Button>
        </div>
      </div>

      {/* Date Range & Filters */}
      <Card className="glass-card border-white/10">
        <CardContent className="p-4 space-y-4">
          {/* Date Range with Preset Selector */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[180px] max-w-[200px]">
              <Label className="text-white">Date Range Preset</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full glass-card border-white/10 text-white justify-between"
                    disabled={editMode}
                  >
                    {selectedPreset}
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="glass-card border-white/10 w-48">
                  <div className="px-2 py-1.5 text-xs text-gray-400 font-semibold">FIXED</div>
                  {DATE_PRESETS.slice(0, 2).map((preset) => (
                    <DropdownMenuItem
                      key={preset.label}
                      onClick={() => handlePresetChange(preset)}
                      className="text-white hover:bg-white/10 cursor-pointer"
                    >
                      {preset.label}
                    </DropdownMenuItem>
                  ))}
                  
                  <DropdownMenuSeparator className="bg-white/10" />
                  
                  {DATE_PRESETS.slice(2, -1).map((preset) => (
                    <DropdownMenuItem
                      key={preset.label}
                      onClick={() => handlePresetChange(preset)}
                      className="text-white hover:bg-white/10 cursor-pointer"
                    >
                      {preset.label}
                    </DropdownMenuItem>
                  ))}
                  
                  <DropdownMenuSeparator className="bg-white/10" />
                  
                  <DropdownMenuItem
                    onClick={() => setSelectedPreset('Custom')}
                    className="text-white hover:bg-white/10 cursor-pointer"
                  >
                    Custom
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex-1 min-w-[200px]">
              <Label className="text-white">Start Date</Label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => handleManualDateChange('start', e.target.value)}
                className="glass-card border-white/10 text-white"
                disabled={editMode}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-white">End Date</Label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => handleManualDateChange('end', e.target.value)}
                className="glass-card border-white/10 text-white"
                disabled={editMode}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilterBuilder(!showFilterBuilder)}
              className="glass-card border-white/10 text-white"
              disabled={editMode}
            >
              <Filter className="w-4 h-4 mr-2" />
              {showFilterBuilder ? 'Hide' : 'Show'} Advanced
              {customFilters.length > 0 && (
                <Badge className="ml-2 bg-[#00d4ff] text-white">
                  {customFilters.length}
                </Badge>
              )}
            </Button>
            <Button
              onClick={refetchAllWidgets}
              className="bg-[#00d4ff] hover:bg-[#00d4ff]/90 text-white"
              disabled={editMode}
            >
              Apply Filter
            </Button>
          </div>

          {/* Saved Filters Bar */}
          {savedFilters.length > 0 && !editMode && (
            <div className="border-t border-white/10 pt-4">
              <div className="mb-3">
                <h3 className="text-white font-semibold text-sm">Filters</h3>
              </div>
              <SavedFilterBar
                savedFilters={savedFilters}
                filterValues={savedFilterValues}
                onChange={handleSavedFilterChange}
                onReorder={handleFilterReorder}
              />
            </div>
          )}

          {/* Filter Manager */}
          {showFilterBuilder && !editMode && (
            <div className="border-t border-white/10 pt-4 space-y-4">
              <FilterManager
                dashboardPage="Dashboard"
                availableFields={availableFields}
              />

              {/* Manual Custom Filters */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-white font-medium">Manual Filters</Label>
                    <p className="text-xs text-gray-400 mt-1">
                      {availableFields.length > 0
                        ? `${availableFields.length} fields available from your data sources`
                        : 'Add widgets first to see available fields'
                      }
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {customFilters.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearAllFilters}
                        className="glass-card border-white/10 text-red-400"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Clear All
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addFilter}
                      disabled={availableFields.length === 0}
                      className="glass-card border-white/10 text-white disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Filter
                    </Button>
                  </div>
                </div>

                {customFilters.length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-white/10 rounded-lg">
                    <p className="font-medium mb-1">No manual filters added</p>
                    <p className="text-xs">Click "Add Filter" to filter your widgets by any field</p>
                    {availableFields.length === 0 && (
                      <p className="text-xs text-orange-400 mt-2">Add some widgets first to see available fields</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {customFilters.map((filter, index) => (
                    <div key={index} className="flex gap-2 items-start p-3 glass-card border-white/10 rounded-lg">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="relative">
                          <Input
                            placeholder="Search or type field name..."
                            value={filter.field}
                            onChange={(e) => updateFilter(index, 'field', e.target.value)}
                            className="glass-card border-white/10 text-white"
                            list={`field-options-${index}`}
                          />
                          {availableFields.length > 0 && (
                            <datalist id={`field-options-${index}`}>
                              {availableFields
                                .filter(field => field.toLowerCase().includes((filter.field || '').toLowerCase()))
                                .map(field => (
                                  <option key={field} value={field} />
                                ))}
                            </datalist>
                          )}
                        </div>

                        <Select
                          value={filter.operator}
                          onValueChange={(v) => updateFilter(index, 'operator', v)}
                        >
                          <SelectTrigger className="glass-card border-white/10 text-white">
                            <SelectValue placeholder="Operator" />
                          </SelectTrigger>
                          <SelectContent className="glass-card border-white/10 text-white custom-scroll">
                            <SelectItem value="equals" className="focus:bg-white/10 focus:text-white">Equals</SelectItem>
                            <SelectItem value="not_equals" className="focus:bg-white/10 focus:text-white">Not Equals</SelectItem>
                            <SelectItem value="contains" className="focus:bg-white/10 focus:text-white">Contains</SelectItem>
                            <SelectItem value="greater_than" className="focus:bg-white/10 focus:text-white">Less Than</SelectItem>
                          </SelectContent>
                        </Select>

                        <Input
                          placeholder="Value"
                          value={filter.value}
                          onChange={(e) => updateFilter(index, 'value', e.target.value)}
                          className="glass-card border-white/10 text-white"
                        />
                      </div>

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
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Widgets with Drag & Drop */}
      {displayWidgets.length > 0 ? (
        <>
          <div className="flex items-center justify-between mb-4">
            {!editMode ? (
              <Button
                variant="outline"
                onClick={() => setEditMode(true)}
                className="glass-card border-white/10 text-white hover:bg-white/10 ml-auto"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit Layout
              </Button>
            ) : (
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  className="glass-card border-white/10 text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveLayout}
                  className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
                >
                  Save Layout
                </Button>
              </div>
            )}
          </div>
          {editMode && (
            <div className="mb-4 p-4 glass-card border-[#00d4ff]/30 rounded-lg">
              <p className="text-[#00d4ff] text-sm">
                💡 <strong>Edit Mode:</strong> Drag and drop widgets to reorder them. Click "Save Layout" when done.
              </p>
            </div>
          )}
          <DragDropContext onDragEnd={handleWidgetDragEnd}>
            <Droppable droppableId="widgets" isDropDisabled={!editMode}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="grid grid-cols-12 gap-6"
                >
                  {displayWidgets.map((widget, index) => {
                    // Auto-adjust width for KPI cards to show max 6 per row
                    let widthClass = widget.display_config?.width || 'full';
                    
                    // If it's a KPI card and width is 'full', change it to show max 6 per row
                    if ((widget.type === 'kpi_card' || widget.type === 'kpi_with_trend') && widthClass === 'full') {
                      widthClass = 'sixth'; // 6 per row
                    }
                    
                    const gridColClass = {
                      full: 'col-span-12',
                      half: 'col-span-12 lg:col-span-6',
                      third: 'col-span-12 sm:col-span-6 lg:col-span-4',
                      quarter: 'col-span-12 lg:col-span-3',
                      sixth: 'col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-2' // 6 per row on large screens
                    }[widthClass];

                    return (
                      <Draggable 
                        key={widget.id} 
                        draggableId={widget.id} 
                        index={index}
                        isDragDisabled={!editMode}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`${gridColClass} ${snapshot.isDragging ? 'opacity-50' : ''} ${editMode ? 'cursor-move' : ''}`}
                            style={provided.draggableProps.style}
                          >
                            <WidgetRenderer
                              widget={widget}
                              dateRange={dateRange}
                              customFilters={customFilters}
                            />
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
        </>
      ) : (
        <Card className="glass-card border-white/10">
          <CardContent className="p-12 text-center">
            <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No widgets yet</h3>
            <p className="text-gray-400 mb-4">Create your first widget to visualize your data</p>
            <Button
              onClick={() => window.location.href = '/widget-builder'}
              className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Widget
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}