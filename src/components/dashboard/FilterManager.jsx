
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea"; // Although Textarea is imported, it's not used in the provided code snippet for FilterManager. Keeping it for consistency with original file.
import { Settings, Plus, Trash2, Save, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function FilterManager({ dashboardPage, availableFields }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(false); // New state for loading options
  const [fieldSearch, setFieldSearch] = useState(''); // New state for field search input
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    data_source: '', // NEW: Add data source
    field: '',
    filter_type: 'text',
    operator: 'equals',
    options: [],
    default_value: '',
    enabled: true,
    position: 0
  });

  const { data: savedFilters } = useQuery({
    queryKey: ['saved-filters', dashboardPage],
    queryFn: () => base44.entities.SavedFilter.filter({ dashboard_page: dashboardPage, enabled: true }, 'position'),
    initialData: [],
  });

  // NEW: Fetch sync configurations to show available data sources
  const { data: syncConfigs } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  // NEW: Fetch widgets to get their data sources (still useful for context, but not for direct dropdown population)
  const { data: widgets } = useQuery({
    queryKey: ['dashboard-widgets', dashboardPage],
    queryFn: () => base44.entities.Widget.filter({
      dashboard_page: dashboardPage,
      enabled: true
    }, 'position'),
    initialData: [],
  });

  // NEW: Get available fields for the selected data source
  const getFieldsForDataSource = (dataSource) => {
    if (!dataSource) return availableFields; // Fallback to all available fields if no specific data source is selected

    const syncConfig = syncConfigs.find(s =>
      s.id === dataSource ||
      s.name === dataSource ||
      s.local_table_name === dataSource
    );

    if (syncConfig?.detected_schema?.fields) {
      return syncConfig.detected_schema.fields.map(f => f.name).sort();
    }

    return [];
  };

  // NEW: Get all available data sources from sync configurations
  const availableDataSources = syncConfigs.map(config => ({
    id: config.id,
    name: config.name,
    value: config.local_table_name || config.name,
    type: config.sync_type
  }));

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SavedFilter.create({ ...data, dashboard_page: dashboardPage }),
    onSuccess: () => {
      queryClient.invalidateQueries(['saved-filters']);
      resetForm();
      setIsOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SavedFilter.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['saved-filters']);
      resetForm();
      setIsOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SavedFilter.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['saved-filters']);
    },
  });

  const fetchFieldOptions = async () => {
    if (!formData.field || !formData.data_source) {
      alert('Please select both a data source and field first.');
      return;
    }

    setLoadingOptions(true);

    try {
      const response = await base44.functions.invoke('fetchFieldOptions', {
        data_source: formData.data_source,
        field: formData.field
      });

      if (response.data.success) {
        setFormData({
          ...formData,
          options: response.data.options
        });
        alert(`Loaded ${response.data.options.length} unique values.`);
      } else {
        alert('Failed to fetch options: ' + response.data.error);
      }
    } catch (error) {
      alert('Error fetching options: ' + error.message);
    } finally {
      setLoadingOptions(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      data_source: '',
      field: '',
      filter_type: 'text',
      operator: 'equals',
      options: [],
      default_value: '',
      enabled: true,
      position: savedFilters.length
    });
    setEditingFilter(null);
    setFieldSearch('');
  };

  const handleEdit = (filter) => {
    setEditingFilter(filter);
    setFormData({
      name: filter.name,
      description: filter.description || '',
      data_source: filter.data_source || '', // Set data_source from filter
      field: filter.field,
      filter_type: filter.filter_type,
      operator: filter.operator,
      options: filter.options || [],
      default_value: filter.default_value || '',
      enabled: filter.enabled,
      position: filter.position
    });
    setIsOpen(true);
  };

  const handleSubmit = () => {
    if (editingFilter) {
      updateMutation.mutate({ id: editingFilter.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this filter?')) {
      deleteMutation.mutate(id);
    }
  };

  const addOption = () => {
    setFormData({ ...formData, options: [...formData.options, ''] });
  };

  const updateOption = (index, value) => {
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData({ ...formData, options: newOptions });
  };

  const removeOption = (index) => {
    setFormData({ ...formData, options: formData.options.filter((_, i) => i !== index) });
  };

  // Filter available fields based on selected data source and search
  const availableFieldsForSource = getFieldsForDataSource(formData.data_source);
  const filteredFields = availableFieldsForSource.filter(field =>
    field.toLowerCase().includes(fieldSearch.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-white font-medium">Saved Filters</Label>
          <p className="text-xs text-gray-400 mt-1">
            Create reusable filter configurations
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetForm()}
              className="glass-card border-white/10 text-white"
            >
              <Settings className="w-4 h-4 mr-1" />
              Manage Filters
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingFilter ? 'Edit Filter' : 'Create New Filter'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-white">Filter Name</Label>
                <Input
                  placeholder="e.g., Status Filter, Source Filter"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="glass-card border-white/10 text-white"
                />
              </div>

              <div>
                <Label className="text-white">Description (Optional)</Label>
                <Input
                  placeholder="What does this filter do?"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="glass-card border-white/10 text-white"
                />
              </div>

              {/* Data Source Selection */}
              <div>
                <Label className="text-white">Data Source (Optional)</Label>
                <Select 
                  value={formData.data_source || "all"} 
                  onValueChange={(v) => setFormData({ ...formData, data_source: v === "all" ? "" : v, field: '' })}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue placeholder="All data sources (global filter)" />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10 text-white custom-scroll">
                    <SelectItem value="all" className="text-white focus:bg-white/10 focus:text-white">
                      All data sources (global filter)
                    </SelectItem>
                    {availableDataSources.map(source => (
                      <SelectItem key={source.id} value={source.value} className="text-white focus:bg-white/10 focus:text-white">
                        {source.name} ({source.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">
                  {availableDataSources.length === 0 
                    ? 'No data sources configured. Add them in Data Sync Sources first.'
                    : 'Leave empty to apply filter across all data sources, or select a specific source'
                  }
                </p>
              </div>

              <div>
                <Label className="text-white">Field</Label>
                <div className="space-y-2">
                  <Input
                    placeholder="Search fields..."
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    className="glass-card border-white/10 text-white"
                  />
                  <Select value={formData.field} onValueChange={(v) => setFormData({ ...formData, field: v })}>
                    <SelectTrigger className="glass-card border-white/10 text-white">
                      <SelectValue placeholder="Select field to filter" />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-white/10 text-white max-h-64 custom-scroll">
                      {filteredFields.length === 0 ? (
                        <div className="p-2 text-center text-gray-400 text-sm">
                          {formData.data_source
                            ? (fieldSearch ? 'No fields match your search' : 'No fields available for this data source')
                            : 'Select a data source first to see available fields'
                          }
                        </div>
                      ) : (
                        filteredFields.map(field => (
                          <SelectItem key={field} value={field} className="text-white focus:bg-white/10 focus:text-white">
                            {field}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {fieldSearch && filteredFields.length > 0 && (
                    <p className="text-xs text-gray-400">
                      Showing {filteredFields.length} of {availableFieldsForSource.length} fields
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-white">Filter Type</Label>
                <Select value={formData.filter_type} onValueChange={(v) => setFormData({ ...formData, filter_type: v })}>
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10 text-white">
                    <SelectItem value="text" className="text-white">Text Input</SelectItem>
                    <SelectItem value="dropdown" className="text-white">Dropdown (Single Select)</SelectItem>
                    <SelectItem value="multi_select" className="text-white">Multi-Select</SelectItem>
                    <SelectItem value="date_range" className="text-white">Date Range</SelectItem>
                    <SelectItem value="number_range" className="text-white">Number Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(formData.filter_type === 'dropdown' || formData.filter_type === 'multi_select') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-white">Options</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={fetchFieldOptions}
                        disabled={!formData.field || !formData.data_source || loadingOptions}
                        className="glass-card border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/20"
                      >
                        {loadingOptions ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Auto-populate from Data
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addOption}
                        className="glass-card border-white/10 text-white"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Manual
                      </Button>
                    </div>
                  </div>

                  {formData.options.length === 0 ? (
                    <div className="text-center py-4 border-2 border-dashed border-white/10 rounded-lg">
                      <p className="text-gray-400 text-sm mb-2">No options added yet</p>
                      <p className="text-xs text-gray-500">
                        {!formData.data_source || !formData.field
                          ? 'Select a data source and field first'
                          : 'Click "Auto-populate from Data" to load values from your data source, or click "Add Manual" to enter options manually'
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-2 custom-scroll">
                      {formData.options.map((option, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            placeholder={`Option ${index + 1}`}
                            value={option}
                            onChange={(e) => updateOption(index, e.target.value)}
                            className="glass-card border-white/10 text-white"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeOption(index)}
                            className="text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {formData.options.length} option{formData.options.length !== 1 ? 's' : ''} added
                  </p>
                </div>
              )}

              <div>
                <Label className="text-white">Default Value (Optional)</Label>
                <Input
                  placeholder="Default filter value"
                  value={formData.default_value}
                  onChange={(e) => setFormData({ ...formData, default_value: e.target.value })}
                  className="glass-card border-white/10 text-white"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  className="glass-card border-white/10 text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]"
                  disabled={!formData.name || !formData.field}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingFilter ? 'Update' : 'Create'} Filter
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {savedFilters.length > 0 && (
        <div className="space-y-2">
          {savedFilters.map(filter => (
            <div key={filter.id} className="flex items-center justify-between p-3 glass-card border-white/10 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{filter.name}</span>
                  <Badge className="bg-[#a855f7]/20 text-[#a855f7] border-[#a855f7]/30">
                    {filter.filter_type}
                  </Badge>
                  {filter.data_source && (
                    <Badge className="bg-[#00d4ff]/20 text-[#00d4ff] border-[#00d4ff]/30">
                      {filter.data_source}
                    </Badge>
                  )}
                </div>
                {filter.description && (
                  <p className="text-xs text-gray-400 mt-1">{filter.description}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Field: {filter.field}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(filter)}
                  className="text-[#00d4ff] hover:bg-[#00d4ff]/20"
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(filter.id)}
                  className="text-red-400 hover:bg-red-500/20"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
