import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";

export default function SecuritySettings() {
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [saveMessage, setSaveMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSaveMessage('');
    
    if (passwords.new !== passwords.confirm) {
      setErrorMessage("Passwords don't match");
      return;
    }
    
    setSaveMessage('Password updated successfully');
    setPasswords({ current: '', new: '', confirm: '' });
    setTimeout(() => setSaveMessage(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Security Settings</h1>
        <p className="text-gray-400">Manage your account security</p>
      </div>

      {saveMessage && (
        <div className="glass-card border-green-500/30 bg-green-500/10 p-4 rounded-lg">
          <p className="text-green-400">{saveMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="glass-card border-red-500/30 bg-red-500/10 p-4 rounded-lg">
          <p className="text-red-400">{errorMessage}</p>
        </div>
      )}

      <Card className="glass-card border-white/10 max-w-2xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-white">Current Password</Label>
              <Input
                type="password"
                value={passwords.current}
                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                className="glass-card border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-white">New Password</Label>
              <Input
                type="password"
                value={passwords.new}
                onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                className="glass-card border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-white">Confirm New Password</Label>
              <Input
                type="password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                className="glass-card border-white/10 text-white"
              />
            </div>
            <Button type="submit" className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]">
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}