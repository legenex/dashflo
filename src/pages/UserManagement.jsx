import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Plus,
  Edit,
  Trash2,
  ArrowLeft,
  UserPlus,
  Shield,
  Mail,
  Clock,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";

export default function UserManagement() {
  const [view, setView] = useState('list'); // 'list', 'invite', 'edit'
  const [editingUser, setEditingUser] = useState(null);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'user',
    full_name: ''
  });
  const [editForm, setEditForm] = useState({
    role: 'user',
    permissions: [],
    active: true
  });

  const queryClient = useQueryClient();

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list('-created_date'),
    initialData: [],
  });

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      setView('list');
      setEditingUser(null);
      alert('User updated successfully');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
    },
  });

  const handleEditUser = (user) => {
    setEditingUser(user);
    setEditForm({
      role: user.role,
      permissions: user.permissions || [],
      active: user.active !== false
    });
    setView('edit');
  };

  const handleSaveUser = () => {
    updateUserMutation.mutate({
      id: editingUser.id,
      data: editForm
    });
  };

  const resetInviteForm = () => {
    setInviteForm({
      email: '',
      role: 'user',
      full_name: ''
    });
  };

  // List View
  if (view === 'list') {
    return (
      <div className="space-y-6">
        <div>
          <Link to={createPageUrl("AdminSettings")}>
            <Button variant="ghost" className="text-white hover:bg-white/10 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin Settings
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">User Management</h1>
          <p className="text-gray-400">Manage roles, permissions, and user access</p>
        </div>

        <div className="glass-card border-[#00d4ff]/30 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-[#00d4ff] mt-0.5" />
            <div>
              <p className="text-[#00d4ff] font-medium mb-1">💡 How to Invite Users</p>
              <p className="text-gray-400 text-sm">
                Users must be invited through the Base44 dashboard. Go to <strong>Dashboard → Users → Invite User</strong> to send email invitations. 
                Once invited users register, they will appear in this list where you can manage their roles and permissions.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            <p className="text-gray-400">
              {users.length} {users.length === 1 ? 'user' : 'users'} in your organization
            </p>
          </div>
          <Button
            onClick={() => {
              resetInviteForm();
              setView('invite');
            }}
            className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Invite User
          </Button>
        </div>

        <Card className="glass-card border-white/10">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-gray-400">User</TableHead>
                  <TableHead className="text-gray-400">Email</TableHead>
                  <TableHead className="text-gray-400">Role</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Joined</TableHead>
                  <TableHead className="text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow className="border-white/10 hover:bg-white/5">
                    <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                      No users yet. Invite your first team member!
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id} className="border-white/10 hover:bg-white/5">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center">
                            {user.photo_url ? (
                              <img 
                                src={user.photo_url} 
                                alt={user.full_name} 
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-white font-semibold">
                                {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="text-white font-medium">{user.full_name}</div>
                            {currentUser?.id === user.id && (
                              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 border text-xs mt-1">
                                You
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400">{user.email}</TableCell>
                      <TableCell>
                        <Badge className={
                          user.role === 'admin' 
                            ? "bg-orange-500/20 text-orange-400 border-orange-500/30 border"
                            : "bg-blue-500/20 text-blue-400 border-blue-500/30 border"
                        }>
                          {user.role === 'admin' ? (
                            <><Shield className="w-3 h-3 mr-1 inline" /> Admin</>
                          ) : (
                            'User'
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.active !== false ? (
                          <div className="flex items-center gap-1 text-green-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-sm">Active</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-gray-400">
                            <XCircle className="w-4 h-4" />
                            <span className="text-sm">Inactive</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {user.created_date ? format(new Date(user.created_date), 'MMM dd, yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditUser(user)}
                            className="text-[#00d4ff] hover:bg-[#00d4ff]/20 hover:text-[#00d4ff]"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {currentUser?.id !== user.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm(`Are you sure you want to remove ${user.full_name}?`)) {
                                  deleteUserMutation.mutate(user.id);
                                }
                              }}
                              className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass-card border-white/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Users</p>
                  <p className="text-3xl font-bold text-white mt-1">{users.length}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00d4ff] to-[#0099cc] bg-opacity-20 flex items-center justify-center">
                  <Users className="w-6 h-6 text-[#00d4ff]" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-white/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Admins</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {users.filter(u => u.role === 'admin').length}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f97316] to-[#ea580c] bg-opacity-20 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-white/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Active Users</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {users.filter(u => u.active !== false).length}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] bg-opacity-20 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Invite User View
  if (view === 'invite') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => setView('list')}
              className="text-white hover:bg-white/10 mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to List
            </Button>
            <h1 className="text-3xl font-bold text-white mb-2">Invite User</h1>
          </div>
        </div>

        <Card className="glass-card border-white/10 max-w-2xl">
          <CardContent className="p-6 space-y-6">
            <div className="glass-card border-[#00d4ff]/30 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-[#00d4ff] mt-0.5" />
                <div>
                  <p className="text-[#00d4ff] font-medium mb-1">Important Notice</p>
                  <p className="text-gray-400 text-sm">
                    User invitations must be sent through the Base44 dashboard. This page allows you to prepare invitation details, 
                    but you'll need to complete the invitation process in <strong>Dashboard → Users → Invite User</strong>.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">User Details</h3>
              
              <div>
                <Label className="text-white">Full Name *</Label>
                <Input
                  value={inviteForm.full_name}
                  onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                  placeholder="John Doe"
                  className="glass-card border-white/10 text-white"
                />
              </div>

              <div>
                <Label className="text-white">Email Address *</Label>
                <Input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="john@example.com"
                  className="glass-card border-white/10 text-white"
                />
              </div>

              <div>
                <Label className="text-white">Role *</Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="user" className="text-white">
                      User - Basic access
                    </SelectItem>
                    <SelectItem value="admin" className="text-white">
                      Admin - Full access
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 border-t border-white/10">
                <h4 className="text-white font-medium mb-3">Invitation Preview</h4>
                <div className="glass-card border-white/10 p-4 rounded space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Name:</span>
                    <span className="text-white">{inviteForm.full_name || 'Not specified'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Email:</span>
                    <span className="text-white">{inviteForm.email || 'Not specified'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Role:</span>
                    <Badge className={
                      inviteForm.role === 'admin'
                        ? "bg-orange-500/20 text-orange-400 border-orange-500/30 border"
                        : "bg-blue-500/20 text-blue-400 border-blue-500/30 border"
                    }>
                      {inviteForm.role === 'admin' ? 'Admin' : 'User'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 max-w-2xl">
          <Button
            variant="outline"
            onClick={() => setView('list')}
            className="glass-card border-white/10 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              alert(`To complete the invitation:\n\n1. Go to Base44 Dashboard\n2. Navigate to Users → Invite User\n3. Enter: ${inviteForm.email}\n4. Assign role: ${inviteForm.role}`);
            }}
            disabled={!inviteForm.email || !inviteForm.full_name}
            className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
          >
            <Mail className="w-4 h-4 mr-2" />
            View Instructions
          </Button>
        </div>
      </div>
    );
  }

  // Edit User View
  if (view === 'edit' && editingUser) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => setView('list')}
              className="text-white hover:bg-white/10 mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to List
            </Button>
            <h1 className="text-3xl font-bold text-white mb-2">Edit User</h1>
            <p className="text-gray-400">{editingUser.full_name} • {editingUser.email}</p>
          </div>
        </div>

        <Card className="glass-card border-white/10 max-w-2xl">
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">User Information</h3>
              
              <div className="glass-card border-white/10 p-4 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center">
                    {editingUser.photo_url ? (
                      <img 
                        src={editingUser.photo_url} 
                        alt={editingUser.full_name} 
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-2xl font-semibold">
                        {editingUser.full_name?.charAt(0)?.toUpperCase() || 'U'}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-white font-medium text-lg">{editingUser.full_name}</p>
                    <p className="text-gray-400">{editingUser.email}</p>
                    <p className="text-gray-500 text-sm">
                      Joined {editingUser.created_date ? format(new Date(editingUser.created_date), 'MMMM dd, yyyy') : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-white">Role *</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(v) => setEditForm({ ...editForm, role: v })}
                  disabled={currentUser?.id === editingUser.id}
                >
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="user" className="text-white">
                      User - Basic access
                    </SelectItem>
                    <SelectItem value="admin" className="text-white">
                      Admin - Full access
                    </SelectItem>
                  </SelectContent>
                </Select>
                {currentUser?.id === editingUser.id && (
                  <p className="text-xs text-gray-500 mt-1">You cannot change your own role</p>
                )}
              </div>

              <div className="flex items-center justify-between p-4 glass-card border-white/10 rounded-lg">
                <div>
                  <Label className="text-white">Account Status</Label>
                  <p className="text-gray-400 text-sm">
                    {editForm.active ? 'User can access the system' : 'User is blocked from accessing the system'}
                  </p>
                </div>
                <Switch
                  checked={editForm.active}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, active: checked })}
                  disabled={currentUser?.id === editingUser.id}
                />
              </div>
              {currentUser?.id === editingUser.id && (
                <p className="text-xs text-gray-500">You cannot deactivate your own account</p>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white">Permissions Overview</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 glass-card border-white/10 rounded">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-white">View Dashboard</span>
                  </div>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 border">
                    Granted
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 glass-card border-white/10 rounded">
                  <div className="flex items-center gap-2">
                    {editForm.role === 'admin' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-white">Manage Users</span>
                  </div>
                  <Badge className={
                    editForm.role === 'admin'
                      ? "bg-green-500/20 text-green-400 border-green-500/30 border"
                      : "bg-gray-500/20 text-gray-400 border-gray-500/30 border"
                  }>
                    {editForm.role === 'admin' ? 'Granted' : 'Denied'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 glass-card border-white/10 rounded">
                  <div className="flex items-center gap-2">
                    {editForm.role === 'admin' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-white">System Settings</span>
                  </div>
                  <Badge className={
                    editForm.role === 'admin'
                      ? "bg-green-500/20 text-green-400 border-green-500/30 border"
                      : "bg-gray-500/20 text-gray-400 border-gray-500/30 border"
                  }>
                    {editForm.role === 'admin' ? 'Granted' : 'Denied'}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 max-w-2xl">
          <Button
            variant="outline"
            onClick={() => setView('list')}
            className="glass-card border-white/10 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveUser}
            className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
          >
            Save Changes
          </Button>
        </div>
      </div>
    );
  }

  return null;
}