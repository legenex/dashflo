import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, LayoutGrid, List } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import WidgetList from "../components/widgets/WidgetList";
import WidgetTable from "../components/widgets/WidgetTable";
import WidgetEditor from "../components/widgets/WidgetEditor";

export default function WidgetBuilder() {
  const [selectedWidget, setSelectedWidget] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

  const { data: widgets } = useQuery({
    queryKey: ['dashboard-widgets'],
    queryFn: () => base44.entities.Widget.list('-created_date'),
    initialData: [],
  });

  const { data: syncConfigs } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');

    if (editId) {
      loadWidgetForEdit(editId);
    }
  }, []);

  const loadWidgetForEdit = async (widgetId) => {
    try {
      const allWidgets = await base44.entities.Widget.list();
      const widget = allWidgets.find(w => w.id === widgetId);

      if (widget) {
        setSelectedWidget(widget);
        setIsEditing(true);
      } else {
        console.warn(`Widget with ID "${widgetId}" not found for editing.`);
        setIsEditing(false);
        setSelectedWidget(null);
      }
    } catch (error) {
      console.error('Error loading widget for edit:', error);
      setIsEditing(false);
      setSelectedWidget(null);
    }
  };

  const handleWidgetSelect = (widget) => {
    setSelectedWidget(widget);
    setIsEditing(true);
  };

  const handleBackToList = () => {
    setSelectedWidget(null);
    setIsEditing(false);
    window.history.replaceState({}, '', window.location.pathname);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Widget Builder</h1>
          <p className="text-gray-400">Create and manage custom dashboard widgets</p>
        </div>
        {isEditing ? (
          <Button
            variant="outline"
            onClick={handleBackToList}
            className="glass-card border-white/10 text-white"
          >
            ← Back to List
          </Button>
        ) : (
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
              onClick={() => handleWidgetSelect(null)}
              className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Widget
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <WidgetEditor
          widget={selectedWidget}
          onClose={handleBackToList}
          syncConfigs={syncConfigs}
        />
      ) : (
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="glass-card border-white/10">
            <TabsTrigger value="all">All Widgets ({widgets.length})</TabsTrigger>
            <TabsTrigger value="tables">Tables</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="kpi">KPI Cards</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            {viewMode === 'grid' ? (
              <WidgetList
                widgets={widgets}
                onEdit={handleWidgetSelect}
                isLoading={false}
              />
            ) : (
              <WidgetTable
                widgets={widgets}
                onEdit={handleWidgetSelect}
                isLoading={false}
              />
            )}
          </TabsContent>

          <TabsContent value="tables">
            {viewMode === 'grid' ? (
              <WidgetList
                widgets={widgets.filter(w => w.type === 'table')}
                onEdit={handleWidgetSelect}
                isLoading={false}
              />
            ) : (
              <WidgetTable
                widgets={widgets.filter(w => w.type === 'table')}
                onEdit={handleWidgetSelect}
                isLoading={false}
              />
            )}
          </TabsContent>

          <TabsContent value="charts">
            {viewMode === 'grid' ? (
              <WidgetList
                widgets={widgets.filter(w => ['line_chart', 'bar_chart', 'pie_chart', 'area_chart'].includes(w.type))}
                onEdit={handleWidgetSelect}
                isLoading={false}
              />
            ) : (
              <WidgetTable
                widgets={widgets.filter(w => ['line_chart', 'bar_chart', 'pie_chart', 'area_chart'].includes(w.type))}
                onEdit={handleWidgetSelect}
                isLoading={false}
              />
            )}
          </TabsContent>

          <TabsContent value="kpi">
            {viewMode === 'grid' ? (
              <WidgetList
                widgets={widgets.filter(w => w.type === 'kpi_card' || w.type === 'kpi_with_trend' || w.type === 'stats_bar')}
                onEdit={handleWidgetSelect}
                isLoading={false}
              />
            ) : (
              <WidgetTable
                widgets={widgets.filter(w => w.type === 'kpi_card' || w.type === 'kpi_with_trend' || w.type === 'stats_bar')}
                onEdit={handleWidgetSelect}
                isLoading={false}
              />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}