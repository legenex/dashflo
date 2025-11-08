import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Palette } from "lucide-react";

export default function ThemeSettings() {
  const [theme, setTheme] = useState('dark');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    const user = await base44.auth.me();
    setTheme(user.theme || 'dark');
  };

  const handleThemeChange = async (newTheme) => {
    setTheme(newTheme);
    await base44.auth.updateMe({ theme: newTheme });
    setSaveMessage(`Theme changed to ${newTheme}`);
    setTimeout(() => setSaveMessage(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Theme Settings</h1>
        <p className="text-gray-400">Customize your visual experience</p>
      </div>

      {saveMessage && (
        <div className="glass-card border-green-500/30 bg-green-500/10 p-4 rounded-lg">
          <p className="text-green-400">{saveMessage}</p>
        </div>
      )}

      <Card className="glass-card border-white/10 max-w-2xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Theme Preference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleThemeChange('dark')}
              className={`p-6 rounded-xl border-2 transition-all ${
                theme === 'dark'
                  ? 'border-[#00d4ff] bg-gradient-to-br from-[#00d4ff]/20 to-[#a855f7]/20'
                  : 'border-white/10 glass-card'
              }`}
            >
              <div className="w-full h-32 rounded-lg bg-gradient-to-br from-[#0f0f23] to-[#1a1a3e] mb-4"></div>
              <p className="text-white font-medium">Dark Mode</p>
              <p className="text-gray-400 text-sm">Current theme</p>
            </button>

            <button
              onClick={() => handleThemeChange('light')}
              className={`p-6 rounded-xl border-2 transition-all ${
                theme === 'light'
                  ? 'border-[#00d4ff] bg-gradient-to-br from-[#00d4ff]/20 to-[#a855f7]/20'
                  : 'border-white/10 glass-card'
              }`}
            >
              <div className="w-full h-32 rounded-lg bg-gradient-to-br from-white to-gray-100 mb-4"></div>
              <p className="text-white font-medium">Light Mode</p>
              <p className="text-gray-400 text-sm">Coming soon</p>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}