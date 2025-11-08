
import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

export default function DisplayConfig({ displayConfig, widgetType, onChange }) {
  // Provide default config if undefined
  const config = displayConfig || {
    width: 'full',
    height: '400px',
    color_scheme: 'default',
    show_legend: true,
    show_title: true,
    refresh_interval: 0,
    page_size: 10,
    show_totals: true,
    // Comparison options (added for completeness, though not part of current UI changes)
    show_comparison: false,
    comparison_period: 'previous_period',
    // NEW: kpi_display_mode for kpi_with_trend widget
    kpi_display_mode: 'latest', // NEW: default to latest value
    // field formatting configuration
    field_formats: {}
  };

  // Helper functions for field formatting
  const addFieldFormat = () => {
    // Add a new empty field with a default 'number' format
    const newFormats = { ...(config.field_formats || {}), '': 'number' };
    onChange({ ...config, field_formats: newFormats });
  };

  const updateFieldFormat = (oldField, newField, format) => {
    const newFormats = { ...(config.field_formats || {}) };
    if (oldField !== newField) { // If field name is being changed
      delete newFormats[oldField]; // Remove the old entry
    }
    if (newField) { // Ensure newField is not empty before adding
      newFormats[newField] = format;
    }
    onChange({ ...config, field_formats: newFormats });
  };

  const removeFieldFormat = (field) => {
    const newFormats = { ...(config.field_formats || {}) };
    delete newFormats[field];
    onChange({ ...config, field_formats: newFormats });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-white">Widget Width</Label>
          <Select
            value={config.width}
            onValueChange={(v) => onChange({ ...config, width: v })}
          >
            <SelectTrigger className="glass-card border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10 text-white">
              <SelectItem value="full" className="text-white">Full Width</SelectItem>
              <SelectItem value="half" className="text-white">Half Width</SelectItem>
              <SelectItem value="third" className="text-white">One Third</SelectItem>
              <SelectItem value="quarter" className="text-white">One Quarter</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-white">Height (px)</Label>
          <Input
            type="number"
            value={parseInt(config.height) || 400}
            onChange={(e) => onChange({ ...config, height: e.target.value + 'px' })}
            className="glass-card border-white/10 text-white"
          />
        </div>
      </div>

      {/* Show Widget Title Toggle */}
      <div className="flex items-center justify-between p-3 glass-card border-white/10 rounded-lg">
        <div>
          <Label className="text-white font-medium">Show Widget Title</Label>
          <p className="text-xs text-gray-400 mt-1">Display the widget name at the top</p>
        </div>
        <Switch
          checked={config.show_title !== false}
          onCheckedChange={(v) => onChange({ ...config, show_title: v })}
        />
      </div>

      {/* NEW: KPI Display Mode for KPI with Trend Chart */}
      {widgetType === 'kpi_with_trend' && (
        <div>
          <Label className="text-white">KPI Display Mode</Label>
          <Select
            value={config.kpi_display_mode || 'latest'}
            onValueChange={(v) => onChange({ ...config, kpi_display_mode: v })}
          >
            <SelectTrigger className="glass-card border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10 text-white">
              <SelectItem value="latest" className="text-white">Latest Value (last point)</SelectItem>
              <SelectItem value="total" className="text-white">Total Sum (all points)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400 mt-1">
            {config.kpi_display_mode === 'total'
              ? 'Shows the sum of all values in the date range'
              : 'Shows the value from the most recent date'}
          </p>
        </div>
      )}

      {widgetType === 'table' && (
        <>
          <div>
            <Label className="text-white">Default Page Size</Label>
            <Select
              value={String(config.page_size || 10)}
              onValueChange={(v) => onChange({ ...config, page_size: Number(v) })}
            >
              <SelectTrigger className="glass-card border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-card border-white/10 text-white">
                <SelectItem value="10" className="text-white">10 rows</SelectItem>
                <SelectItem value="25" className="text-white">25 rows</SelectItem>
                <SelectItem value="50" className="text-white">50 rows</SelectItem>
                <SelectItem value="100" className="text-white">100 rows</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-3 glass-card border-white/10 rounded-lg">
            <div>
              <Label className="text-white">Show Totals Row</Label>
              <p className="text-xs text-gray-400">Display grand totals at bottom of table</p>
            </div>
            <Switch
              checked={config.show_totals !== false}
              onCheckedChange={(v) => onChange({ ...config, show_totals: v })}
            />
          </div>
        </>
      )}

      {['line_chart', 'bar_chart', 'pie_chart', 'area_chart'].includes(widgetType) && (
        <>
          <div>
            <Label className="text-white">Color Scheme</Label>
            <Select
              value={config.color_scheme}
              onValueChange={(v) => onChange({ ...config, color_scheme: v })}
            >
              <SelectTrigger className="glass-card border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-card border-white/10 text-white">
                <SelectItem value="default" className="text-white">Default</SelectItem>
                <SelectItem value="blue" className="text-white">Blue</SelectItem>
                <SelectItem value="green" className="text-white">Green</SelectItem>
                <SelectItem value="purple" className="text-white">Purple</SelectItem>
                <SelectItem value="rainbow" className="text-white">Rainbow</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-3 glass-card border-white/10 rounded-lg">
            <Label className="text-white">Show Legend</Label>
            <Switch
              checked={config.show_legend !== false}
              onCheckedChange={(v) => onChange({ ...config, show_legend: v })}
            />
          </div>
        </>
      )}

      {/* Field Formatting Section - Only for tables */}
      {widgetType === 'table' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white font-medium">Field Formatting</Label>
              <p className="text-xs text-gray-400 mt-1">
                Customize how each field displays (currency, percentage, etc.)
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addFieldFormat}
              className="glass-card border-white/10 text-white"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Format Rule
            </Button>
          </div>

          {Object.keys(config.field_formats || {}).length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-white/10 rounded-lg">
              <p className="font-medium mb-1">No formatting rules defined</p>
              <p className="text-xs">Add rules to format fields as currency, percentage, dates, etc.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(config.field_formats || {}).map(([field, format], index) => (
                <div key={field || `new-field-${index}`} className="flex gap-2 items-start p-3 glass-card border-white/10 rounded-lg">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-white text-xs">Field Name</Label>
                      <Input
                        placeholder="e.g., revenue, conversion_rate"
                        value={field}
                        onChange={(e) => updateFieldFormat(field, e.target.value, format)}
                        className="glass-card border-white/10 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-white text-xs">Display Format</Label>
                      <Select
                        value={format}
                        onValueChange={(v) => updateFieldFormat(field, field, v)}
                      >
                        <SelectTrigger className="glass-card border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="glass-card border-white/10 text-white">
                          <SelectItem value="number" className="text-white">Number (1,234)</SelectItem>
                          <SelectItem value="currency" className="text-white">Currency ($1,234.56)</SelectItem>
                          <SelectItem value="percentage" className="text-white">Percentage (12.34%)</SelectItem>
                          <SelectItem value="date" className="text-white">Date (Jan 1, 2025)</SelectItem>
                          <SelectItem value="text" className="text-white">Plain Text</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFieldFormat(field)}
                    className="text-red-400 hover:bg-red-500/20 mt-5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="p-3 glass-card border-[#00d4ff]/30 rounded-lg">
            <p className="text-xs text-[#00d4ff]">
              💡 <strong>Tip:</strong> Format rules apply to exact field name matches. Use the same names as your columns/aggregations.
            </p>
          </div>
        </div>
      )}

      <div>
        <Label className="text-white">Auto Refresh Interval (seconds)</Label>
        <Input
          type="number"
          value={config.refresh_interval || 0}
          onChange={(e) => onChange({ ...config, refresh_interval: parseInt(e.target.value) || 0 })}
          placeholder="0 for no auto-refresh"
          className="glass-card border-white/10 text-white"
        />
        <p className="text-xs text-gray-400 mt-1">Set to 0 to disable auto-refresh</p>
      </div>
    </div>
  );
}
