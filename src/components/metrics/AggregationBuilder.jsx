
import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export default function AggregationBuilder({ definition, availableFields, onChange }) {
  const [fieldSearch, setFieldSearch] = useState('');

  const updateDef = (key, value) => {
    onChange({ ...definition, [key]: value });
  };

  const addFilter = () => {
    const newFilters = [...(definition.filters || []), { field: '', operator: 'equals', value: '' }];
    updateDef('filters', newFilters);
  };

  const updateFilter = (index, key, value) => {
    const newFilters = [...(definition.filters || [])];
    newFilters[index][key] = value;
    updateDef('filters', newFilters);
  };

  const removeFilter = (index) => {
    const newFilters = (definition.filters || []).filter((_, i) => i !== index);
    updateDef('filters', newFilters);
  };

  const filteredFields = availableFields.filter(field =>
    field.toLowerCase().includes(fieldSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-white">Function *</Label>
          <Select value={definition.function} onValueChange={(v) => updateDef('function', v)}>
            <SelectTrigger className="glass-card border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10">
              <SelectItem value="count" className="text-white">Count</SelectItem>
              <SelectItem value="sum" className="text-white">Sum</SelectItem>
              <SelectItem value="avg" className="text-white">Average</SelectItem>
              <SelectItem value="min" className="text-white">Minimum</SelectItem>
              <SelectItem value="max" className="text-white">Maximum</SelectItem>
              <SelectItem value="first" className="text-white">First Value</SelectItem>
              <SelectItem value="last" className="text-white">Last Value</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-white">Field *</Label>
          {availableFields.length > 0 ? (
            <>
              <Input
                placeholder="Search fields..."
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                className="glass-card border-white/10 text-white mb-2"
              />
              <Select value={definition.field} onValueChange={(v) => updateDef('field', v)}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10 max-h-64">
                  <SelectItem value="*" className="text-white">* (All records)</SelectItem>
                  {filteredFields.map(field => (
                    <SelectItem key={field} value={field} className="text-white">{field}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <Input
              value={definition.field}
              onChange={(e) => updateDef('field', e.target.value)}
              placeholder="Field name or * for all"
              className="glass-card border-white/10 text-white"
            />
          )}
        </div>

        <div>
          <Label className="text-white">Display Format</Label>
          <Select value={definition.format || 'number'} onValueChange={(v) => updateDef('format', v)}>
            <SelectTrigger className="glass-card border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10">
              <SelectItem value="number" className="text-white">Number (1,234)</SelectItem>
              <SelectItem value="currency" className="text-white">Currency ($1,234.56)</SelectItem>
              <SelectItem value="percentage" className="text-white">Percentage (12.34%)</SelectItem>
              <SelectItem value="text" className="text-white">Text</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-white">Display As (Alias)</Label>
          <Input
            value={definition.alias}
            onChange={(e) => updateDef('alias', e.target.value)}
            placeholder="How to display this metric"
            className="glass-card border-white/10 text-white"
          />
        </div>
      </div>

      {/* Conditional Filters */}
      <div className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-white">Conditional Filters (Optional)</Label>
          <div className="flex items-center gap-2">
            {(definition.filters || []).length > 0 && (
              <>
                <span className="text-xs text-gray-400">Match:</span>
                <Select
                  value={definition.filter_logic || 'all'}
                  onValueChange={(v) => updateDef('filter_logic', v)}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white w-24 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="all" className="text-white">All (AND)</SelectItem>
                    <SelectItem value="any" className="text-white">Any (OR)</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addFilter}
              className="glass-card border-[#00d4ff]/30 text-[#00d4ff]"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Condition
            </Button>
          </div>
        </div>

        {(definition.filters || []).length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4 border-2 border-dashed border-white/10 rounded-lg">
            No conditions added. This metric will count/sum all records.
          </p>
        )}

        <div className="space-y-2">
          {(definition.filters || []).map((filter, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 p-3 glass-card border-white/10 rounded-lg">
              <div className="col-span-4">
                <Input
                  placeholder="Field"
                  value={filter.field}
                  onChange={(e) => updateFilter(index, 'field', e.target.value)}
                  className="glass-card border-white/10 text-white"
                  list={`filter-fields-${index}`}
                />
                {availableFields.length > 0 && (
                  <datalist id={`filter-fields-${index}`}>
                    {availableFields.map(f => <option key={f} value={f} />)}
                  </datalist>
                )}
              </div>

              <div className="col-span-3">
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
                    <SelectItem value="in" className="text-white">In (comma-separated)</SelectItem>
                    <SelectItem value="not_in" className="text-white">Not In (comma-separated)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-4">
                <Input
                  placeholder="Value"
                  value={filter.value}
                  onChange={(e) => updateFilter(index, 'value', e.target.value)}
                  className="glass-card border-white/10 text-white"
                />
              </div>

              <div className="col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFilter(index)}
                  className="text-red-400 hover:bg-red-500/20 w-full h-full"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
