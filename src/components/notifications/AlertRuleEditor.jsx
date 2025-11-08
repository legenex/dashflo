import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AlertRuleEditor({ rule, channels, onClose }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    rule_type: 'metric_threshold',
    trigger_condition: {
      metric_source: '',
      metric_field: '',
      operator: 'greater_than',
      threshold_value: 0,
      event_type: '',
      time_schedule: 'daily'
    },
    notification_channels: [],
    recipients: [],
    message_template: '',
    priority: 'medium',
    cooldown_minutes: 60,
    enabled: true
  });

  const [recipientInput, setRecipientInput] = useState('');

  const { data: syncConfigs } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  useEffect(() => {
    if (rule) {
      setFormData({
        name: rule.name || '',
        description: rule.description || '',
        rule_type: rule.rule_type || 'metric_threshold',
        trigger_condition: rule.trigger_condition || {
          metric_source: '',
          metric_field: '',
          operator: 'greater_than',
          threshold_value: 0,
          event_type: '',
          time_schedule: 'daily'
        },
        notification_channels: rule.notification_channels || [],
        recipients: rule.recipients || [],
        message_template: rule.message_template || '',
        priority: rule.priority || 'medium',
        cooldown_minutes: rule.cooldown_minutes || 60,
        enabled: rule.enabled !== false
      });
    }
  }, [rule]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (rule) {
        return base44.entities.AlertRule.update(rule.id, data);
      }
      return base44.entities.AlertRule.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      alert(rule ? "Alert rule updated successfully" : "Alert rule created successfully");
      onClose();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name) {
      alert("Please enter a rule name");
      return;
    }
    saveMutation.mutate(formData);
  };

  const toggleChannel = (channelId) => {
    const current = formData.notification_channels || [];
    if (current.includes(channelId)) {
      setFormData({ ...formData, notification_channels: current.filter(id => id !== channelId) });
    } else {
      setFormData({ ...formData, notification_channels: [...current, channelId] });
    }
  };

  const addRecipient = () => {
    if (recipientInput.trim()) {
      const current = formData.recipients || [];
      if (!current.includes(recipientInput.trim())) {
        setFormData({ ...formData, recipients: [...current, recipientInput.trim()] });
      }
      setRecipientInput('');
    }
  };

  const removeRecipient = (email) => {
    setFormData({ ...formData, recipients: formData.recipients.filter(e => e !== email) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={onClose}
          className="text-white hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Alert Rules
        </Button>
        <Button
          onClick={handleSubmit}
          className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
          disabled={saveMutation.isPending}
        >
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? 'Saving...' : 'Save Rule'}
        </Button>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">
            {rule ? 'Edit Alert Rule' : 'Create Alert Rule'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label className="text-white">Rule Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., High Lead Volume Alert"
                className="glass-card border-white/10 text-white"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="text-white">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe when this alert should trigger..."
                className="glass-card border-white/10 text-white"
              />
            </div>

            <div>
              <Label className="text-white">Rule Type</Label>
              <Select value={formData.rule_type} onValueChange={(v) => setFormData({ ...formData, rule_type: v })}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10">
                  <SelectItem value="metric_threshold" className="text-white">Metric Threshold</SelectItem>
                  <SelectItem value="time_based" className="text-white">Time-Based</SelectItem>
                  <SelectItem value="event_based" className="text-white">Event-Based</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white">Priority</Label>
              <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10">
                  <SelectItem value="low" className="text-white">Low</SelectItem>
                  <SelectItem value="medium" className="text-white">Medium</SelectItem>
                  <SelectItem value="high" className="text-white">High</SelectItem>
                  <SelectItem value="critical" className="text-white">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Trigger Conditions */}
          {formData.rule_type === 'metric_threshold' && (
            <div className="space-y-4 p-4 glass-card border-white/10 rounded-lg">
              <h3 className="text-white font-semibold">Trigger Condition</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Data Source</Label>
                  <Select 
                    value={formData.trigger_condition.metric_source} 
                    onValueChange={(v) => setFormData({ 
                      ...formData, 
                      trigger_condition: { ...formData.trigger_condition, metric_source: v }
                    })}
                  >
                    <SelectTrigger className="glass-card border-white/10 text-white">
                      <SelectValue placeholder="Select data source" />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      {syncConfigs.map(config => (
                        <SelectItem key={config.id} value={config.local_table_name || config.name} className="text-white">
                          {config.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-white">Field</Label>
                  <Input
                    value={formData.trigger_condition.metric_field}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      trigger_condition: { ...formData.trigger_condition, metric_field: e.target.value }
                    })}
                    placeholder="e.g., total_leads"
                    className="glass-card border-white/10 text-white"
                  />
                </div>

                <div>
                  <Label className="text-white">Operator</Label>
                  <Select 
                    value={formData.trigger_condition.operator} 
                    onValueChange={(v) => setFormData({ 
                      ...formData, 
                      trigger_condition: { ...formData.trigger_condition, operator: v }
                    })}
                  >
                    <SelectTrigger className="glass-card border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      <SelectItem value="greater_than" className="text-white">Greater Than</SelectItem>
                      <SelectItem value="less_than" className="text-white">Less Than</SelectItem>
                      <SelectItem value="equals" className="text-white">Equals</SelectItem>
                      <SelectItem value="greater_or_equal" className="text-white">Greater or Equal</SelectItem>
                      <SelectItem value="less_or_equal" className="text-white">Less or Equal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-white">Threshold Value</Label>
                  <Input
                    type="number"
                    value={formData.trigger_condition.threshold_value}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      trigger_condition: { ...formData.trigger_condition, threshold_value: Number(e.target.value) }
                    })}
                    className="glass-card border-white/10 text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {formData.rule_type === 'time_based' && (
            <div className="space-y-4 p-4 glass-card border-white/10 rounded-lg">
              <h3 className="text-white font-semibold">Schedule</h3>
              <div>
                <Label className="text-white">Frequency</Label>
                <Select 
                  value={formData.trigger_condition.time_schedule} 
                  onValueChange={(v) => setFormData({ 
                    ...formData, 
                    trigger_condition: { ...formData.trigger_condition, time_schedule: v }
                  })}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="hourly" className="text-white">Hourly</SelectItem>
                    <SelectItem value="daily" className="text-white">Daily</SelectItem>
                    <SelectItem value="weekly" className="text-white">Weekly</SelectItem>
                    <SelectItem value="monthly" className="text-white">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {formData.rule_type === 'event_based' && (
            <div className="space-y-4 p-4 glass-card border-white/10 rounded-lg">
              <h3 className="text-white font-semibold">Event Type</h3>
              <div>
                <Label className="text-white">Event</Label>
                <Select 
                  value={formData.trigger_condition.event_type} 
                  onValueChange={(v) => setFormData({ 
                    ...formData, 
                    trigger_condition: { ...formData.trigger_condition, event_type: v }
                  })}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue placeholder="Select event" />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="lead.created" className="text-white">Lead Created</SelectItem>
                    <SelectItem value="lead.sold" className="text-white">Lead Sold</SelectItem>
                    <SelectItem value="lead.rejected" className="text-white">Lead Rejected</SelectItem>
                    <SelectItem value="sync.failed" className="text-white">Sync Failed</SelectItem>
                    <SelectItem value="sync.completed" className="text-white">Sync Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Notification Channels */}
          <div className="space-y-3">
            <Label className="text-white">Notification Channels</Label>
            {channels.length === 0 ? (
              <p className="text-gray-400 text-sm">No channels configured. Add channels in the Channels tab first.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {channels.map(channel => (
                  <div
                    key={channel.id}
                    onClick={() => toggleChannel(channel.id)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      formData.notification_channels.includes(channel.id)
                        ? 'bg-[#00d4ff]/20 border-2 border-[#00d4ff]'
                        : 'bg-white/5 border-2 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.notification_channels.includes(channel.id)}
                        readOnly
                        className="w-4 h-4 cursor-pointer"
                      />
                      <span className="text-white text-sm">{channel.name}</span>
                      <Badge variant="outline" className="border-white/10 text-white text-xs">
                        {channel.channel_type}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recipients */}
          <div className="space-y-3">
            <Label className="text-white">Additional Recipients (Email)</Label>
            <div className="flex gap-2">
              <Input
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addRecipient();
                  }
                }}
                placeholder="email@example.com"
                className="glass-card border-white/10 text-white flex-1"
              />
              <Button
                type="button"
                onClick={addRecipient}
                className="bg-[#00d4ff] hover:bg-[#00d4ff]/90"
              >
                Add
              </Button>
            </div>
            {formData.recipients.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.recipients.map((email, idx) => (
                  <Badge key={idx} className="bg-white/10 text-white">
                    {email}
                    <button
                      onClick={() => removeRecipient(email)}
                      className="ml-2 hover:text-red-400"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Message Template */}
          <div>
            <Label className="text-white">Message Template</Label>
            <Textarea
              value={formData.message_template}
              onChange={(e) => setFormData({ ...formData, message_template: e.target.value })}
              placeholder="Use {{field_name}} for dynamic values. E.g., 'Alert: {{metric_field}} is {{threshold_value}}'"
              className="glass-card border-white/10 text-white"
              rows={4}
            />
            <p className="text-xs text-gray-400 mt-1">
              Available variables: {'{'}{'{'} metric_field {'}'}{'}'}, {'{'}{'{'}threshold_value{'}'}{'}'}, {'{'}{'{'} current_value {'}'}{'}'}, {'{'}{'{'}timestamp{'}'}{'}'} 
            </p>
          </div>

          {/* Settings */}
          <div>
            <Label className="text-white">Cooldown Period (minutes)</Label>
            <Input
              type="number"
              value={formData.cooldown_minutes}
              onChange={(e) => setFormData({ ...formData, cooldown_minutes: Number(e.target.value) })}
              className="glass-card border-white/10 text-white"
            />
            <p className="text-xs text-gray-400 mt-1">
              Minimum time between consecutive alerts to prevent spam
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}