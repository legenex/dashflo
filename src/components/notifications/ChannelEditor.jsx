import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ChannelEditor({ channel, onClose }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    channel_type: 'email',
    configuration: {
      email_addresses: [],
      phone_numbers: [],
      slack_webhook_url: '',
      slack_channel: '',
      webhook_url: '',
      webhook_headers: {}
    },
    enabled: true
  });

  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');

  useEffect(() => {
    if (channel) {
      setFormData({
        name: channel.name || '',
        channel_type: channel.channel_type || 'email',
        configuration: channel.configuration || {
          email_addresses: [],
          phone_numbers: [],
          slack_webhook_url: '',
          slack_channel: '',
          webhook_url: '',
          webhook_headers: {}
        },
        enabled: channel.enabled !== false
      });
    }
  }, [channel]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (channel) {
        return base44.entities.NotificationChannel.update(channel.id, data);
      }
      return base44.entities.NotificationChannel.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
      alert(channel ? "Channel updated successfully" : "Channel created successfully");
      onClose();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name) {
      alert("Please enter a channel name");
      return;
    }
    saveMutation.mutate(formData);
  };

  const addEmail = () => {
    if (emailInput.trim()) {
      const emails = formData.configuration.email_addresses || [];
      if (!emails.includes(emailInput.trim())) {
        setFormData({
          ...formData,
          configuration: {
            ...formData.configuration,
            email_addresses: [...emails, emailInput.trim()]
          }
        });
      }
      setEmailInput('');
    }
  };

  const removeEmail = (email) => {
    setFormData({
      ...formData,
      configuration: {
        ...formData.configuration,
        email_addresses: formData.configuration.email_addresses.filter(e => e !== email)
      }
    });
  };

  const addPhone = () => {
    if (phoneInput.trim()) {
      const phones = formData.configuration.phone_numbers || [];
      if (!phones.includes(phoneInput.trim())) {
        setFormData({
          ...formData,
          configuration: {
            ...formData.configuration,
            phone_numbers: [...phones, phoneInput.trim()]
          }
        });
      }
      setPhoneInput('');
    }
  };

  const removePhone = (phone) => {
    setFormData({
      ...formData,
      configuration: {
        ...formData.configuration,
        phone_numbers: formData.configuration.phone_numbers.filter(p => p !== phone)
      }
    });
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
          Back to Channels
        </Button>
        <Button
          onClick={handleSubmit}
          className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
          disabled={saveMutation.isPending}
        >
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? 'Saving...' : 'Save Channel'}
        </Button>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">
            {channel ? 'Edit Notification Channel' : 'Add Notification Channel'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label className="text-white">Channel Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Marketing Team Email"
                className="glass-card border-white/10 text-white"
              />
            </div>

            <div>
              <Label className="text-white">Channel Type</Label>
              <Select value={formData.channel_type} onValueChange={(v) => setFormData({ ...formData, channel_type: v })}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10">
                  <SelectItem value="email" className="text-white">📧 Email</SelectItem>
                  <SelectItem value="sms" className="text-white">📱 SMS</SelectItem>
                  <SelectItem value="slack" className="text-white">💬 Slack</SelectItem>
                  <SelectItem value="webhook" className="text-white">🔗 Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Email Configuration */}
          {formData.channel_type === 'email' && (
            <div className="space-y-3">
              <Label className="text-white">Email Addresses</Label>
              <div className="flex gap-2">
                <Input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                  placeholder="email@example.com"
                  className="glass-card border-white/10 text-white flex-1"
                />
                <Button type="button" onClick={addEmail} className="bg-[#00d4ff] hover:bg-[#00d4ff]/90">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {formData.configuration.email_addresses?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.configuration.email_addresses.map((email, idx) => (
                    <Badge key={idx} className="bg-white/10 text-white">
                      {email}
                      <button onClick={() => removeEmail(email)} className="ml-2 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SMS Configuration */}
          {formData.channel_type === 'sms' && (
            <div className="space-y-3">
              <Label className="text-white">Phone Numbers</Label>
              <div className="flex gap-2">
                <Input
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addPhone();
                    }
                  }}
                  placeholder="+1234567890"
                  className="glass-card border-white/10 text-white flex-1"
                />
                <Button type="button" onClick={addPhone} className="bg-[#00d4ff] hover:bg-[#00d4ff]/90">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {formData.configuration.phone_numbers?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.configuration.phone_numbers.map((phone, idx) => (
                    <Badge key={idx} className="bg-white/10 text-white">
                      {phone}
                      <button onClick={() => removePhone(phone)} className="ml-2 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Slack Configuration */}
          {formData.channel_type === 'slack' && (
            <div className="space-y-4">
              <div>
                <Label className="text-white">Slack Webhook URL</Label>
                <Input
                  value={formData.configuration.slack_webhook_url}
                  onChange={(e) => setFormData({
                    ...formData,
                    configuration: { ...formData.configuration, slack_webhook_url: e.target.value }
                  })}
                  placeholder="https://hooks.slack.com/services/..."
                  className="glass-card border-white/10 text-white"
                />
              </div>
              <div>
                <Label className="text-white">Channel Name (optional)</Label>
                <Input
                  value={formData.configuration.slack_channel}
                  onChange={(e) => setFormData({
                    ...formData,
                    configuration: { ...formData.configuration, slack_channel: e.target.value }
                  })}
                  placeholder="#alerts"
                  className="glass-card border-white/10 text-white"
                />
              </div>
            </div>
          )}

          {/* Webhook Configuration */}
          {formData.channel_type === 'webhook' && (
            <div className="space-y-4">
              <div>
                <Label className="text-white">Webhook URL</Label>
                <Input
                  value={formData.configuration.webhook_url}
                  onChange={(e) => setFormData({
                    ...formData,
                    configuration: { ...formData.configuration, webhook_url: e.target.value }
                  })}
                  placeholder="https://your-webhook.com/endpoint"
                  className="glass-card border-white/10 text-white"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}