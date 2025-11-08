import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User } from "lucide-react";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    city: '',
    country: ''
  });
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const currentUser = await base44.auth.me();
    setUser(currentUser);
    setFormData({
      full_name: currentUser.full_name || '',
      email: currentUser.email || '',
      phone: currentUser.phone || '',
      city: currentUser.city || '',
      country: currentUser.country || ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await base44.auth.updateMe({
      phone: formData.phone,
      city: formData.city,
      country: formData.country
    });
    setSaveMessage('Profile updated successfully');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Profile Settings</h1>
        <p className="text-gray-400">Manage your personal information</p>
      </div>

      {saveMessage && (
        <div className="glass-card border-green-500/30 bg-green-500/10 p-4 rounded-lg">
          <p className="text-green-400">{saveMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass-card border-white/10">
          <CardContent className="p-6 text-center">
            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center">
              {user.photo_url ? (
                <img src={user.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="w-12 h-12 text-white" />
              )}
            </div>
            <h3 className="text-xl font-bold text-white mb-1">{user.full_name}</h3>
            <p className="text-gray-400">{user.email}</p>
            <Button className="mt-4 w-full bg-gradient-to-r from-[#00d4ff] to-[#a855f7]">
              Change Photo
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Personal Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Full Name</Label>
                  <Input
                    value={formData.full_name}
                    disabled
                    className="glass-card border-white/10 text-gray-400"
                  />
                </div>
                <div>
                  <Label className="text-white">Email</Label>
                  <Input
                    value={formData.email}
                    disabled
                    className="glass-card border-white/10 text-gray-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="glass-card border-white/10 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white">City</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="glass-card border-white/10 text-white"
                  />
                </div>
              </div>
              <div>
                <Label className="text-white">Country</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="glass-card border-white/10 text-white"
                />
              </div>
              <Button type="submit" className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]">
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}