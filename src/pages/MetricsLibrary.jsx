import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Calculator, Sigma, Search, LayoutGrid, List } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import MetricEditor from "../components/metrics/MetricEditor";

export default function MetricsLibrary() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const queryClient = useQueryClient();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => base44.entities.MetricDefinition.list('-created_date'),
    initialData: [],
  });

  // Check URL for edit parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    
    if (editId && metrics.length > 0) {
      const metricToEdit = metrics.find(m => m.id === editId);
      if (metricToEdit) {
        setSelectedMetric(metricToEdit);
        setIsEditing(true);
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [metrics]);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MetricDefinition.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['metrics']);
      alert("Metric deleted successfully");
    },
  });

  const handleCreate = () => {
    setSelectedMetric(null);
    setIsEditing(true);
  };

  const handleEdit = (metric) => {
    setSelectedMetric(metric);
    setIsEditing(true);
  };

  const handleClose = () => {
    setSelectedMetric(null);
    setIsEditing(false);
  };

  const handleDelete = (metric) => {
    if (confirm(`Are you sure you want to delete "${metric.name}"?`)) {
      deleteMutation.mutate(metric.id);
    }
  };

  const filteredMetrics = metrics.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (m.category && m.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const aggregationMetrics = filteredMetrics.filter(m => m.type === 'aggregation');
  const calculatedMetrics = filteredMetrics.filter(m => m.type === 'calculated_field');

  if (isEditing) {
    return (
      <MetricEditor
        metric={selectedMetric}
        onClose={handleClose}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Metrics Library</h1>
          <p className="text-gray-400">Create and manage reusable metrics for your dashboard widgets</p>
          <p className="text-xs text-gray-500 mt-1">💡 Tip: Metrics defined here can be reused across multiple widgets</p>
          {aggregationMetrics.length > 0 && (
            <p className="text-sm text-[#00d4ff] mt-2">
              📊 Available aggregations: {aggregationMetrics.map(m => m.definition?.alias || m.name).join(', ')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMode('grid')}
            className={`glass-card border-white/10 ${viewMode === 'grid' ? 'bg-white/10 text-[#00d4ff]' : 'text-white'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMode('list')}
            className={`glass-card border-white/10 ${viewMode === 'list' ? 'bg-white/10 text-[#00d4ff]' : 'text-white'}`}
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleCreate}
            className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
            title="Create a new metric definition"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Metric
          </Button>
        </div>
      </div>

      <Card className="glass-card border-white/10">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search metrics by name, description, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-card border-white/10 text-white pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="glass-card border-white/10">
          <TabsTrigger value="all">All Metrics ({metrics.length})</TabsTrigger>
          <TabsTrigger value="aggregations">
            <Sigma className="w-4 h-4 mr-2" />
            Aggregations ({aggregationMetrics.length})
          </TabsTrigger>
          <TabsTrigger value="calculated">
            <Calculator className="w-4 h-4 mr-2" />
            Calculated ({calculatedMetrics.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {viewMode === 'grid' ? (
            <MetricsList
              metrics={filteredMetrics}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          ) : (
            <MetricsTable
              metrics={filteredMetrics}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          )}
        </TabsContent>

        <TabsContent value="aggregations">
          {viewMode === 'grid' ? (
            <MetricsList
              metrics={aggregationMetrics}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          ) : (
            <MetricsTable
              metrics={aggregationMetrics}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          )}
        </TabsContent>

        <TabsContent value="calculated">
          {viewMode === 'grid' ? (
            <MetricsList
              metrics={calculatedMetrics}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          ) : (
            <MetricsTable
              metrics={calculatedMetrics}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricsList({ metrics, onEdit, onDelete, isLoading }) {
  if (isLoading) {
    return <div className="text-white">Loading...</div>;
  }

  if (metrics.length === 0) {
    return (
      <Card className="glass-card border-white/10">
        <CardContent className="p-12 text-center">
          <Calculator className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No metrics yet</h3>
          <p className="text-gray-400">Create your first metric to reuse across widgets</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {metrics.map((metric) => (
        <Card key={metric.id} className="glass-card border-white/10 hover:scale-105 transition-transform">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${metric.type === 'aggregation' ? 'bg-blue-500/20' : 'bg-purple-500/20'}`}>
                  {metric.type === 'aggregation' ? (
                    <Sigma className="w-6 h-6 text-white" />
                  ) : (
                    <Calculator className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-white text-lg">{metric.name}</CardTitle>
                  {metric.category && (
                    <Badge className="bg-white/10 text-white border-white/20 mt-1">
                      {metric.category}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metric.description && (
                <p className="text-sm text-gray-400">{metric.description}</p>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Type:</span>
                <Badge className="bg-white/10 text-white border-white/20">
                  {metric.type === 'aggregation' ? 'Aggregation' : 'Calculated Field'}
                </Badge>
              </div>

              {metric.type === 'aggregation' && metric.definition && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Function:</span>
                    <span className="text-white">{metric.definition.function}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Alias:</span>
                    <span className="text-[#00d4ff]">{metric.definition.alias || metric.name}</span>
                  </div>
                </>
              )}

              {metric.type === 'calculated_field' && metric.definition?.formula && (
                <div className="p-2 bg-white/5 rounded text-xs">
                  <span className="text-gray-400">Formula: </span>
                  <code className="text-[#00d4ff]">{metric.definition.formula}</code>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(metric)}
                  className="flex-1 glass-card border-white/10 text-white hover:bg-white/10"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(metric)}
                  className="glass-card border-white/10 text-red-400 hover:bg-red-500/20"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MetricsTable({ metrics, onEdit, onDelete, isLoading }) {
  if (isLoading) {
    return <div className="text-white">Loading...</div>;
  }

  if (metrics.length === 0) {
    return (
      <Card className="glass-card border-white/10">
        <CardContent className="p-12 text-center">
          <Calculator className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No metrics yet</h3>
          <p className="text-gray-400">Create your first metric to reuse across widgets</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-white/10">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-white/5">
                <TableHead className="text-gray-400">Type</TableHead>
                <TableHead className="text-gray-400">Name</TableHead>
                <TableHead className="text-gray-400">Category</TableHead>
                <TableHead className="text-gray-400">Description</TableHead>
                <TableHead className="text-gray-400">Details</TableHead>
                <TableHead className="text-gray-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((metric) => (
                <TableRow key={metric.id} className="border-white/10 hover:bg-white/5">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {metric.type === 'aggregation' ? (
                        <Sigma className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Calculator className="w-4 h-4 text-purple-400" />
                      )}
                      <Badge className="bg-white/10 text-white border-white/20">
                        {metric.type === 'aggregation' ? 'Agg' : 'Calc'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-white font-medium">{metric.name}</TableCell>
                  <TableCell>
                    {metric.category && (
                      <Badge className="bg-white/10 text-white border-white/20">
                        {metric.category}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-400 max-w-xs truncate">
                    {metric.description || '-'}
                  </TableCell>
                  <TableCell className="text-white text-sm">
                    {metric.type === 'aggregation' && metric.definition && (
                      <div className="space-y-1">
                        <div><span className="text-gray-400">Function:</span> {metric.definition.function}</div>
                        <div><span className="text-gray-400">Alias:</span> <span className="text-[#00d4ff]">{metric.definition.alias || metric.name}</span></div>
                      </div>
                    )}
                    {metric.type === 'calculated_field' && metric.definition?.formula && (
                      <code className="text-xs text-[#00d4ff] bg-white/5 px-2 py-1 rounded">
                        {metric.definition.formula}
                      </code>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(metric)}
                        className="glass-card border-white/10 text-white hover:bg-white/10"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDelete(metric)}
                        className="glass-card border-white/10 text-red-400 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}