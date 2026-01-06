import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Home, Building2, Users, Receipt, Activity, BarChart3, Database, Settings, FileText, Package, ShoppingCart, ChevronLeft, ChevronRight, X, Plus, GripVertical, ChevronDown } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const cn = (...classes) => classes.filter(Boolean).join(' ');

const iconMap = {
  'Home': Home,
  'Building2': Building2,
  'Users': Users,
  'Receipt': Receipt,
  'Activity': Activity,
  'BarChart3': BarChart3,
  'Database': Database,
  'Settings': Settings,
  'FileText': FileText,
  'Package': Package,
  'ShoppingCart': ShoppingCart
};

const iconOptions = Object.keys(iconMap);

export default function Layout({ children, currentPageName }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState({ label: '', icon: 'Home', parent_id: null, type: 'page' });
  const [expandedItems, setExpandedItems] = useState({});
  const location = useLocation();
  const queryClient = useQueryClient();

  const { data: navItems = [] } = useQuery({
    queryKey: ['navigationItems'],
    queryFn: async () => {
      const items = await base44.entities.NavigationItem.list('order');
      if (items.length === 0) {
        const dashboardConfig = await base44.entities.DashboardConfig.create({
          name: 'Overview',
          layout: []
        });
        await base44.entities.NavigationItem.create({
          label: 'Overview',
          icon: 'Home',
          dashboard_config_id: dashboardConfig.id,
          order: 1
        });
        return await base44.entities.NavigationItem.list('order');
      }
      return items;
    }
  });

  const addItemMutation = useMutation({
    mutationFn: async (item) => {
      let dashboardConfigId = null;
      
      if (item.type !== 'separator') {
        const dashboardConfig = await base44.entities.DashboardConfig.create({
          name: item.label,
          layout: []
        });
        dashboardConfigId = dashboardConfig.id;
      }
      
      const navItem = await base44.entities.NavigationItem.create({
        label: item.label,
        type: item.type || 'page',
        icon: item.icon,
        dashboard_config_id: dashboardConfigId,
        parent_id: item.parent_id || null,
        order: navItems.length + 1
      });
      
      return navItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['navigationItems'] });
      setShowAddDialog(false);
      setNewItem({ label: '', icon: 'Home', parent_id: null, type: 'page' });
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.NavigationItem.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['navigationItems'] });
      setEditingItem(null);
      setShowAddDialog(false);
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id) => base44.entities.NavigationItem.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['navigationItems'] });
    }
  });

  const reorderItemsMutation = useMutation({
    mutationFn: async (reorderedItems) => {
      await Promise.all(
        reorderedItems.map((item, index) => 
          base44.entities.NavigationItem.update(item.id, { order: index + 1 })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['navigationItems'] });
    }
  });

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(navItems);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    queryClient.setQueryData(['navigationItems'], items);
    reorderItemsMutation.mutate(items);
  };

  const isActive = (configId) => {
    if (!configId) return false;
    const params = new URLSearchParams(location.search);
    return params.get('id') === configId;
  };

  const getIcon = (iconName) => {
    return iconMap[iconName] || Home;
  };

  const toggleExpanded = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Group items into parent and children
  const topLevelItems = navItems.filter(item => !item.parent_id);
  const getChildren = (parentId) => navItems.filter(item => item.parent_id === parentId);
  const hasChildren = (itemId) => navItems.some(item => item.parent_id === itemId);

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <div 
        className={cn(
          "bg-gradient-to-b from-red-500 to-red-600 text-white transition-all duration-300 flex flex-col",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex-1 overflow-y-auto py-6">
          <nav className="space-y-1 px-3">
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="navigation" isDropDisabled={!isEditMode || isCollapsed}>
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={cn(
                      "space-y-1",
                      snapshot.isDraggingOver && "bg-red-700/20 rounded-lg p-1"
                    )}
                  >
                    {topLevelItems.map((item, index) => {
                      const Icon = getIcon(item.icon);
                      const itemActive = item.type !== 'separator' && isActive(item.dashboard_config_id);
                      const children = getChildren(item.id);
                      const isExpanded = expandedItems[item.id];
                      const itemHasChildren = hasChildren(item.id);
                      const isSeparator = item.type === 'separator';

                      return (
                        <div key={item.id}>
                          <Draggable 
                            draggableId={item.id} 
                            index={index}
                            isDragDisabled={!isEditMode || isCollapsed}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "relative group",
                                  snapshot.isDragging && "opacity-50"
                                )}
                              >
                                <div className="flex items-center gap-1">
                                  {isEditMode && !isCollapsed && (
                                    <div
                                      {...provided.dragHandleProps}
                                      className="cursor-grab active:cursor-grabbing p-1 hover:bg-red-700/30 rounded transition-colors"
                                    >
                                      <GripVertical className="w-4 h-4 text-white/60" />
                                    </div>
                                  )}
                                  <div className="flex-1 flex items-center gap-1">
                                    {itemHasChildren && !isCollapsed && (
                                      <button
                                        onClick={() => toggleExpanded(item.id)}
                                        className="p-1 hover:bg-red-700/30 rounded transition-colors"
                                      >
                                        <ChevronDown className={cn(
                                          "w-4 h-4 text-white/60 transition-transform",
                                          !isExpanded && "-rotate-90"
                                        )} />
                                      </button>
                                    )}
                                    {isSeparator ? (
                                      <button
                                        onClick={() => itemHasChildren && toggleExpanded(item.id)}
                                        className={cn(
                                          "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left",
                                          isEditMode && !isCollapsed && "border-2 border-dashed border-white/20",
                                          "hover:bg-red-600/50 text-white/90"
                                        )}
                                      >
                                        <Icon className="w-5 h-5 shrink-0" />
                                        {!isCollapsed && <span className="font-medium">{item.label}</span>}
                                      </button>
                                    ) : (
                                      <Link to={`${createPageUrl('Dashboard')}?id=${item.dashboard_config_id}`} className="flex-1">
                                        <button
                                          className={cn(
                                            "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left",
                                            isEditMode && !isCollapsed && "border-2 border-dashed border-white/20",
                                            itemActive 
                                              ? "bg-red-700/50 text-white" 
                                              : "hover:bg-red-600/50 text-white/90"
                                          )}
                                        >
                                          <Icon className="w-5 h-5 shrink-0" />
                                          {!isCollapsed && <span className="font-medium">{item.label}</span>}
                                        </button>
                                      </Link>
                                    )}
                                  </div>
                                </div>
                                {isEditMode && !isCollapsed && (
                                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 bg-red-800 hover:bg-red-900 text-white"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setEditingItem(item);
                                        setNewItem({ label: item.label, icon: item.icon, parent_id: item.parent_id || null, type: item.type || 'page' });
                                        setShowAddDialog(true);
                                      }}
                                    >
                                      <Settings className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 bg-red-800 hover:bg-red-900 text-white"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        deleteItemMutation.mutate(item.id);
                                      }}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>

                          {/* Child items */}
                          {isExpanded && !isCollapsed && children.map((child) => {
                            const ChildIcon = getIcon(child.icon);
                            const childActive = isActive(child.dashboard_config_id);

                            return (
                              <div key={child.id} className="ml-8 mt-1 relative group">
                                <Link to={`${createPageUrl('Dashboard')}?id=${child.dashboard_config_id}`}>
                                  <button
                                    className={cn(
                                      "w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all text-left text-sm",
                                      isEditMode && "border-2 border-dashed border-white/20",
                                      childActive 
                                        ? "bg-red-700/50 text-white" 
                                        : "hover:bg-red-600/50 text-white/90"
                                    )}
                                  >
                                    <ChildIcon className="w-4 h-4 shrink-0" />
                                    <span className="font-medium">{child.label}</span>
                                  </button>
                                </Link>
                                {isEditMode && (
                                  <div className="absolute right-2 top-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 bg-red-800 hover:bg-red-900 text-white"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setEditingItem(child);
                                        setNewItem({ label: child.label, icon: child.icon, parent_id: child.parent_id || null, type: child.type || 'page' });
                                        setShowAddDialog(true);
                                      }}
                                    >
                                      <Settings className="w-2.5 h-2.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 bg-red-800 hover:bg-red-900 text-white"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        deleteItemMutation.mutate(child.id);
                                      }}
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            {isEditMode && !isCollapsed && (
              <button
                onClick={() => setShowAddDialog(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-white/30 hover:border-white/60 hover:bg-red-700/20 text-white/70 hover:text-white transition-all mt-2"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Add Page</span>
              </button>
            )}
          </nav>
        </div>

        {/* Collapse Toggle */}
        <div className="p-3 border-t border-red-700/30 space-y-2">
          {!isCollapsed && (
            <Button
              variant="ghost"
              onClick={() => setIsEditMode(!isEditMode)}
              className="w-full hover:bg-red-600/50 text-white justify-start gap-2"
            >
              <Settings className="w-4 h-4" />
              {isEditMode ? 'Done' : 'Edit Menu'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full hover:bg-red-600/50 text-white"
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>

      {/* Add/Edit Navigation Item Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open);
        if (!open) {
          setEditingItem(null);
          setNewItem({ label: '', icon: 'Home', page: '' });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Navigation Item' : 'Add Navigation Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={newItem.type || 'page'}
                onValueChange={(value) => setNewItem({ ...newItem, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">Page</SelectItem>
                  <SelectItem value="separator">Separator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                placeholder={newItem.type === 'separator' ? 'e.g. Analytics' : 'e.g. Buyers'}
                value={newItem.label}
                onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
              />
            </div>
            {newItem.type !== 'separator' && (
              <div className="space-y-2">
                <Label>Icon</Label>
              <Select
                value={newItem.icon}
                onValueChange={(value) => setNewItem({ ...newItem, icon: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {iconOptions.map((iconName) => {
                    const Icon = iconMap[iconName];
                    return (
                      <SelectItem key={iconName} value={iconName}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          {iconName}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
                </Select>
                </div>
                )}
                <div className="space-y-2">
                <Label>Parent Menu (Optional)</Label>
              <Select
                value={newItem.parent_id || 'none'}
                onValueChange={(value) => setNewItem({ ...newItem, parent_id: value === 'none' ? null : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Top level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Top level</SelectItem>
                  {topLevelItems.filter(item => !editingItem || item.id !== editingItem.id).map((item) => {
                    const Icon = getIcon(item.icon);
                    return (
                      <SelectItem key={item.id} value={item.id}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          {item.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddDialog(false);
              setEditingItem(null);
              setNewItem({ label: '', icon: 'Home', parent_id: null, type: 'page' });
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingItem) {
                  updateItemMutation.mutate({ id: editingItem.id, data: newItem });
                } else {
                  addItemMutation.mutate(newItem);
                }
              }}
              disabled={!newItem.label}
            >
              {editingItem ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}