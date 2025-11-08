import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import QueryBuilder from "./QueryBuilder";
import DisplayConfig from "./DisplayConfig";
import WidgetPreview from "./WidgetPreview";

const AVAILABLE_PAGES = [
  { value: 'Dashboard', label: 'Dashboard Overview' },
  { value: 'AllLeads', label: 'All Leads' },
  { value: 'BuyerPerformance', label: 'Buyer Performance' },
  { value: 'SupplierPerformance', label: 'Supplier Performance' },
  { value: 'AdMetrics', label: 'Ad Metrics' },
  { value: 'ActiveStates', label: 'Active States' },
  { value: 'Rejections', label: 'Rejections' },
  { value: 'Returns', label: 'Returns' },
  { value: 'Verticals', label: 'Verticals' },
  { value: 'Buyers', label: 'Buyers' },
  { value: 'Suppliers', label: 'Suppliers' },
  { value: 'Sources', label: 'Sources' },
  { value: 'Brands', label: 'Brands' },
  { value: 'Analytics', label: 'Analytics' }
];

export default function WidgetEditor({ widget, onClose, syncConfigs }) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(!!widget);
  const [formData, setFormData] = useState({
    name: '',
    type: 'table',
    data_source: '',
    query_config: {
      columns: [],
      filters: [],
      sort_by: '',
      limit: 100,
      group_by: '',
      aggregations: [],
      calculated_fields: [],
      metric_ids: []
    },
    display_config: {
      width: 'full',
      height: '400px',
      color_scheme: 'default',
      show_legend: true,
      show_title: true,
      refresh_interval: 0,
      page_size: 10,
      show_totals: true,
      show_comparison: false,
      comparison_period: 'previous_period',
      kpi_display_mode: 'latest',
      field_formats: {}
    },
    dashboard_pages: ['Dashboard'],
    position: 0,
    enabled: true
  });

  const [previewMode, setPreviewMode] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);

  useEffect(() => {
    if (widget) {
      console.log('Loading widget:', widget);
      console.log('Widget display_config:', JSON.stringify(widget.display_config, null, 2));
      console.log('Widget kpi_display_mode:', widget.display_config?.kpi_display_mode);
      console.log('Widget metric_ids:', widget.query_config?.metric_ids);
      console.log('Widget aggregations:', widget.query_config?.aggregations);
      console.log('Widget calculated_fields:', widget.query_config?.calculated_fields);

      // Migrate existing aggregations to include format and visible fields
      const migratedAggregations = (widget.query_config?.aggregations || []).map(agg => ({
        ...agg,
        format: agg.format || 'number',
        visible: agg.visible !== undefined ? agg.visible : true,
        filters: agg.filters || [],
        position: agg.position !== undefined ? agg.position : 0
      }));

      // Migrate existing calculated fields to include format and visible fields
      const migratedCalculatedFields = (widget.query_config?.calculated_fields || []).map(cf => ({
        ...cf,
        format: cf.format || 'number',
        visible: cf.visible !== undefined ? cf.visible : true,
        position: cf.position !== undefined ? cf.position : 0
      }));

      // Migrate old dashboard_page (string) to dashboard_pages (array)
      let dashboardPages = ['Dashboard'];
      if (widget.dashboard_pages && Array.isArray(widget.dashboard_pages)) {
        dashboardPages = widget.dashboard_pages;
      } else if (widget.dashboard_page) {
        dashboardPages = [widget.dashboard_page];
      }

      setFormData({
        name: widget.name || '',
        type: widget.type || 'table',
        data_source: widget.data_source || '',
        query_config: {
          columns: widget.query_config?.columns || [],
          filters: widget.query_config?.filters || [],
          sort_by: widget.query_config?.sort_by || '',
          limit: widget.query_config?.limit || 100,
          group_by: widget.query_config?.group_by || '',
          aggregations: migratedAggregations,
          calculated_fields: migratedCalculatedFields,
          metric_ids: widget.query_config?.metric_ids || []
        },
        display_config: {
          width: widget.display_config?.width || 'full',
          height: widget.display_config?.height || '400px',
          color_scheme: widget.display_config?.color_scheme || 'default',
          show_legend: widget.display_config?.show_legend !== false,
          show_title: widget.display_config?.show_title !== false,
          refresh_interval: widget.display_config?.refresh_interval || 0,
          page_size: widget.display_config?.page_size || 10,
          show_totals: widget.display_config?.show_totals !== false,
          show_comparison: widget.display_config?.show_comparison || false,
          comparison_period: widget.display_config?.comparison_period || 'previous_period',
          kpi_display_mode: widget.display_config?.kpi_display_mode || 'latest',
          field_formats: widget.display_config?.field_formats || {}
        },
        dashboard_pages: dashboardPages,
        position: widget.position || 0,
        enabled: widget.enabled !== false
      });

      // Find the selected source config
      const source = syncConfigs.find(s =>
        s.local_table_name === widget.data_source || s.name === widget.data_source
      );
      setSelectedSource(source);
      setIsLoading(false);
    } else {
      setIsLoading(false);
    }
  }, [widget, syncConfigs]);

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
      queryClient.invalidateQueries({ queryKey: ['all-leads-widgets'] });
      alert(widget ? "Widget updated successfully" : "Widget created successfully");
      onClose();
    }
  });

  const handleDataSourceChange = (value) => {
    setFormData({ ...formData, data_source: value });
    const source = syncConfigs.find(s =>
      s.local_table_name === value || s.name === value
    );
    setSelectedSource(source);
  };

  const togglePage = (pageValue) => {
    const currentPages = formData.dashboard_pages || [];
    if (currentPages.includes(pageValue)) {
      setFormData({ ...formData, dashboard_pages: currentPages.filter(p => p !== pageValue) });
    } else {
      setFormData({ ...formData, dashboard_pages: [...currentPages, pageValue] });
    }
  };

  const handleSave = () => {
    if (!formData.name || !formData.data_source) {
      alert("Please fill in widget name and data source");
      return;
    }

    if (!formData.dashboard_pages || formData.dashboard_pages.length === 0) {
      alert("Please select at least one dashboard page");
      return;
    }

    // Transform columns to consistent format - always use objects for consistency
    const transformedColumns = (formData.query_config.columns || []).map(col => {
      if (typeof col === 'string') {
        return {
          field: col,
          alias: '',
          visible: true
        };
      }
      
      if (col && typeof col === 'object') {
        return {
          field: col.field,
          alias: col.alias || '',
          visible: col.visible !== false
        };
      }
      
      return col;
    });

    const dataToSave = {
      ...formData,
      query_config: {
        ...formData.query_config,
        columns: transformedColumns
      }
    };

    console.log("Saving widget with data:", dataToSave);
    
    saveMutation.mutate(dataToSave);
  };

  const availableFields = selectedSource?.detected_schema?.fields?.map(f => f.name) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-white">Loading widget data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={onClose}
          className="text-white hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Widgets
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setPreviewMode(!previewMode)}
            className="glass-card border-white/10 text-white"
          >
            <Eye className="w-4 h-4 mr-2" />
            {previewMode ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button
            onClick={handleSave}
            className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
            disabled={saveMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : 'Save Widget'}
          </Button>
        </div>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">
            {widget ? 'Edit Widget' : 'Create New Widget'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-white">Widget Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Monthly Revenue Chart"
                className="glass-card border-white/10 text-white"
              />
            </div>

            <div>
              <Label className="text-white">Widget Type *</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10">
                  <SelectItem value="table" className="text-white">Table</SelectItem>
                  <SelectItem value="kpi_card" className="text-white">KPI Card</SelectItem>
                  <SelectItem value="kpi_with_trend" className="text-white">KPI with Trend Chart</SelectItem>
                  <SelectItem value="stats_bar" className="text-white">Stats Bar (Horizontal KPIs)</SelectItem>
                  <SelectItem value="line_chart" className="text-white">Line Chart</SelectItem>
                  <SelectItem value="bar_chart" className="text-white">Bar Chart</SelectItem>
                  <SelectItem value="pie_chart" className="text-white">Pie Chart</SelectItem>
                  <SelectItem value="area_chart" className="text-white">Area Chart</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label className="text-white">Data Source *</Label>
              <Select value={formData.data_source} onValueChange={handleDataSourceChange}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue placeholder="Select a data source" />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10">
                  {syncConfigs.length === 0 ? (
                    <SelectItem value="none" disabled className="text-white">No data sources available</SelectItem>
                  ) : (
                    syncConfigs.map(source => (
                      <SelectItem key={source.id} value={source.local_table_name || source.name} className="text-white">
                        {source.name} ({source.sync_type})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {syncConfigs.length === 0 && (
                <p className="text-xs text-orange-400 mt-1">
                  No data sources found. Create one in Data Sync Sources first.
                </p>
              )}
              {selectedSource && (
                <p className="text-xs text-gray-400 mt-1">
                  {selectedSource.sync_type === 'bigquery'
                    ? `BigQuery: ${selectedSource.project_id}/${selectedSource.dataset}/${selectedSource.table_name}`
                    : `Cloud Run: ${selectedSource.api_url}`
                  }
                  {selectedSource.detected_schema?.fields && (
                    <span className="ml-2">
                      • {selectedSource.detected_schema.fields.length} fields detected
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <Label className="text-white mb-2 block">Display on Pages * (Select one or more)</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 glass-card border-white/10 rounded-lg">
                {AVAILABLE_PAGES.map(page => {
                  const isSelected = (formData.dashboard_pages || []).includes(page.value);
                  return (
                    <div
                      key={page.value}
                      onClick={() => togglePage(page.value)}
                      className={`p-3 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#00d4ff]/20 border-2 border-[#00d4ff]'
                          : 'bg-white/5 border-2 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="w-4 h-4 cursor-pointer"
                        />
                        <span className="text-white text-sm">{page.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {formData.dashboard_pages?.length || 0} page(s) selected
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-white">Enable Widget</Label>
              <Switch
                checked={formData.enabled}
                onCheckedChange={(v) => setFormData({ ...formData, enabled: v })}
              />
            </div>
          </div>

          {/* Advanced Configuration */}
          <Tabs defaultValue="query" className="w-full">
            <TabsList className="glass-card border-white/10">
              <TabsTrigger value="query">Query</TabsTrigger>
              <TabsTrigger value="display">Display</TabsTrigger>
            </TabsList>

            <TabsContent value="query">
              <QueryBuilder
                queryConfig={formData.query_config}
                availableFields={availableFields}
                widgetType={formData.type}
                sourceConfig={selectedSource}
                onChange={(config) => {
                  console.log("QueryBuilder onChange:", config);
                  setFormData({ ...formData, query_config: config });
                }}
              />
            </TabsContent>

            <TabsContent value="display">
              <DisplayConfig
                displayConfig={formData.display_config}
                widgetType={formData.type}
                onChange={(config) => {
                  console.log("DisplayConfig onChange:", config);
                  setFormData({ ...formData, display_config: config });
                }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {previewMode && (
        <WidgetPreview widgetConfig={formData} />
      )}
    </div>
  );
}