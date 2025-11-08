import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BellRing } from "lucide-react";

export default function NotificationSettings() {
  const [settings, setSettings] = useState({
    notifications_email: true,
    notifications_sms: false,
    notifications_slack: false
  });
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const user = await base44.auth.me();
    setSettings({
      notifications_email: user.notifications_email ?? true,
      notifications_sms: user.notifications_sms ?? false,
      notifications_slack: user.notifications_slack ?? false
    });
  };

  const handleToggle = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await base44.auth.updateMe(newSettings);
    setSaveMessage('Notification settings updated');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Notification Settings</h1>
        <p className="text-gray-400">Manage how you receive notifications</p>
      </div>

      {saveMessage && (
        <div className="glass-card border-green-500/30 bg-green-500/10 p-4 rounded-lg">
          <p className="text-green-400">{saveMessage}</p>
        </div>
      )}

      <Card className="glass-card border-white/10 max-w-2xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BellRing className="w-5 h-5" />
            Notification Channels
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white">Email Notifications</Label>
              <p className="text-gray-400 text-sm">Receive notifications via email</p>
            </div>
            <Switch
              checked={settings.notifications_email}
              onCheckedChange={(v) => handleToggle('notifications_email', v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white">SMS Notifications</Label>
              <p className="text-gray-400 text-sm">Receive notifications via text message</p>
            </div>
            <Switch
              checked={settings.notifications_sms}
              onCheckedChange={(v) => handleToggle('notifications_sms', v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white">Slack Notifications</Label>
              <p className="text-gray-400 text-sm">Receive notifications in Slack</p>
            </div>
            <Switch
              checked={settings.notifications_slack}
              onCheckedChange={(v) => handleToggle('notifications_slack', v)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}