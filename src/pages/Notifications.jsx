import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Bell, Send, History, Trash2, Edit, Power } from "lucide-react";

import AlertRuleEditor from "../components/notifications/AlertRuleEditor";
import ChannelEditor from "../components/notifications/ChannelEditor";
import NotificationHistory from "../components/notifications/NotificationHistory";

export default function Notifications() {
  const queryClient = useQueryClient();
  const [editingRule, setEditingRule] = useState(null);
  const [editingChannel, setEditingChannel] = useState(null);
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  const [showChannelEditor, setShowChannelEditor] = useState(false);

  const { data: alertRules } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => base44.entities.AlertRule.list('-created_date'),
    initialData: [],
  });

  const { data: channels } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => base44.entities.NotificationChannel.list(),
    initialData: [],
  });

  const { data: notificationHistory } = useQuery({
    queryKey: ['notification-history'],
    queryFn: () => base44.entities.Notification.list('-created_date', 50),
    initialData: [],
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => base44.entities.AlertRule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['alert-rules']);
    }
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.AlertRule.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries(['alert-rules']);
    }
  });

  const deleteChannelMutation = useMutation({
    mutationFn: (id) => base44.entities.NotificationChannel.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['notification-channels']);
    }
  });

  const toggleChannelMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.NotificationChannel.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries(['notification-channels']);
    }
  });

  const handleEditRule = (rule) => {
    setEditingRule(rule);
    setShowRuleEditor(true);
  };

  const handleEditChannel = (channel) => {
    setEditingChannel(channel);
    setShowChannelEditor(true);
  };

  const handleCloseRuleEditor = () => {
    setEditingRule(null);
    setShowRuleEditor(false);
  };

  const handleCloseChannelEditor = () => {
    setEditingChannel(null);
    setShowChannelEditor(false);
  };

  if (showRuleEditor) {
    return (
      <AlertRuleEditor
        rule={editingRule}
        channels={channels}
        onClose={handleCloseRuleEditor}
      />
    );
  }

  if (showChannelEditor) {
    return (
      <ChannelEditor
        channel={editingChannel}
        onClose={handleCloseChannelEditor}
      />
    );
  }

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      critical: 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return colors[priority] || colors.medium;
  };

  const getRuleTypeLabel = (type) => {
    const labels = {
      metric_threshold: 'Metric Threshold',
      time_based: 'Time-Based',
      event_based: 'Event-Based'
    };
    return labels[type] || type;
  };

  const getChannelTypeIcon = (type) => {
    const icons = {
      email: '📧',
      sms: '📱',
      slack: '💬',
      webhook: '🔗'
    };
    return icons[type] || '📢';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Notifications</h1>
          <p className="text-gray-400">Configure alert rules and notification channels</p>
        </div>
      </div>

      <Tabs defaultValue="rules" className="w-full">
        <TabsList className="glass-card border-white/10">
          <TabsTrigger value="rules">
            <Bell className="w-4 h-4 mr-2" />
            Alert Rules ({alertRules.length})
          </TabsTrigger>
          <TabsTrigger value="channels">
            <Send className="w-4 h-4 mr-2" />
            Channels ({channels.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Alert Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => setShowRuleEditor(true)}
              className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Alert Rule
            </Button>
          </div>

          {alertRules.length === 0 ? (
            <Card className="glass-card border-white/10">
              <CardContent className="p-12 text-center">
                <Bell className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">No alert rules yet</h3>
                <p className="text-gray-400 mb-4">Create your first alert rule to get notified</p>
                <Button
                  onClick={() => setShowRuleEditor(true)}
                  className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Alert Rule
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {alertRules.map((rule) => (
                <Card key={rule.id} className="glass-card border-white/10 hover:border-[#00d4ff]/30 transition-all">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold text-white">{rule.name}</h3>
                          <Badge className={getPriorityColor(rule.priority)}>
                            {rule.priority}
                          </Badge>
                          <Badge className={rule.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                            {rule.enabled ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        {rule.description && (
                          <p className="text-gray-400 text-sm mb-3">{rule.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 text-sm">
                          <Badge variant="outline" className="border-white/10 text-white">
                            {getRuleTypeLabel(rule.rule_type)}
                          </Badge>
                          {rule.notification_channels && (
                            <Badge variant="outline" className="border-white/10 text-white">
                              {rule.notification_channels.length} channel(s)
                            </Badge>
                          )}
                          {rule.trigger_count > 0 && (
                            <Badge variant="outline" className="border-white/10 text-white">
                              Triggered {rule.trigger_count} times
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleRuleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                          className="text-gray-400 hover:text-white hover:bg-white/10"
                        >
                          <Power className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditRule(rule)}
                          className="text-gray-400 hover:text-white hover:bg-white/10"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Delete rule "${rule.name}"?`)) {
                              deleteRuleMutation.mutate(rule.id);
                            }
                          }}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Notification Channels Tab */}
        <TabsContent value="channels" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => setShowChannelEditor(true)}
              className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Channel
            </Button>
          </div>

          {channels.length === 0 ? (
            <Card className="glass-card border-white/10">
              <CardContent className="p-12 text-center">
                <Send className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">No notification channels</h3>
                <p className="text-gray-400 mb-4">Add your first notification channel</p>
                <Button
                  onClick={() => setShowChannelEditor(true)}
                  className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Channel
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {channels.map((channel) => (
                <Card key={channel.id} className="glass-card border-white/10 hover:border-[#00d4ff]/30 transition-all">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl">{getChannelTypeIcon(channel.channel_type)}</div>
                        <div>
                          <h3 className="text-lg font-bold text-white">{channel.name}</h3>
                          <p className="text-gray-400 text-sm capitalize">{channel.channel_type}</p>
                        </div>
                      </div>
                      <Badge className={channel.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                        {channel.enabled ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div className="space-y-2 mb-4">
                      {channel.success_count > 0 && (
                        <div className="text-sm text-gray-400">
                          <span className="text-green-400">{channel.success_count}</span> successful deliveries
                        </div>
                      )}
                      {channel.failure_count > 0 && (
                        <div className="text-sm text-gray-400">
                          <span className="text-red-400">{channel.failure_count}</span> failures
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleChannelMutation.mutate({ id: channel.id, enabled: !channel.enabled })}
                        className="flex-1 glass-card border-white/10 text-white"
                      >
                        <Power className="w-4 h-4 mr-2" />
                        {channel.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditChannel(channel)}
                        className="glass-card border-white/10 text-white"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Delete channel "${channel.name}"?`)) {
                            deleteChannelMutation.mutate(channel.id);
                          }
                        }}
                        className="glass-card border-white/10 text-red-400 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <NotificationHistory notifications={notificationHistory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}