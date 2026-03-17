'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { db, collection, getDocs, doc, updateDoc, query, where, deleteDoc } from '@/lib/local-data';
import { motion } from 'motion/react';
import { Users, CreditCard, CheckCircle, XCircle, FileText, Trash2, Save } from 'lucide-react';
import { useRouter } from 'next/router';
import { AdminContentManager } from '@/components/admin/content-manager';
import { SeedDataButton } from '@/components/admin/seed-data';

type AdminUser = {
  id: string;
  displayName?: string;
  email?: string;
  role?: 'admin' | 'user' | 'vip' | 'vip_plus';
  subscriptionEndDate?: string;
  subscriptionApprovalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  purchasedVideos?: string[];
  purchasedPacks?: string[];
};

type AdminPayment = {
  id: string;
  userId: string;
  type: 'subscription' | 'pack' | 'cart';
  targetId?: string;
  items?: Array<{ id: string; type: 'video' | 'pack'; title: string; price: number }>;
  plan?: 'monthly' | 'yearly';
  amount: number;
  method: string;
  receiptUrl?: string;
  createdAt: string;
};

export default function AdminDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'users' | 'payments' | 'content'>('payments');
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [unlockedVideosDrafts, setUnlockedVideosDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const activeTabLabel =
    activeTab === 'payments'
      ? 'Paiements en attente'
      : activeTab === 'users'
        ? 'Utilisateurs'
        : 'Contenu pédagogique';

  useEffect(() => {
    if (!authLoading && profile?.role !== 'admin') {
      router.push('/');
    }
  }, [profile, authLoading, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (profile?.role !== 'admin') return;
      
      try {
        const paymentsSnap = await getDocs(query(collection(db, 'payments'), where('status', '==', 'pending')));
        setPayments(paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AdminPayment)));

        const usersSnap = await getDocs(collection(db, 'users'));
        const nextUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as AdminUser));
        setUsers(nextUsers);
        setUnlockedVideosDrafts(
          Object.fromEntries(nextUsers.map((u) => [u.id, (u.purchasedVideos ?? []).join(', ')])),
        );
      } catch (error) {
        console.error('Error fetching admin data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) fetchData();
  }, [profile, authLoading]);

  const handleApprovePayment = async (
    paymentId: string,
    userId: string,
    type: string,
    targetId?: string,
    items?: Array<{ id: string; type: 'video' | 'pack'; title: string; price: number }>,
    plan?: string,
  ) => {
    try {
      await updateDoc(doc(db, 'payments', paymentId), { status: 'approved' });
      
      const userRef = doc(db, 'users', userId);
      const userDoc = users.find(u => u.id === userId);
      
      if (type === 'subscription') {
        const endDate = new Date();
        if (plan === 'yearly') {
          endDate.setFullYear(endDate.getFullYear() + 1);
        } else {
          endDate.setMonth(endDate.getMonth() + 1);
        }
        await updateDoc(userRef, { 
          role: 'vip_plus',
          subscriptionEndDate: endDate.toISOString(),
          subscriptionApprovalStatus: 'approved',
        });
      } else if (type === 'pack' && targetId) {
        const currentPacks = userDoc?.purchasedPacks || [];
        await updateDoc(userRef, {
          role: userDoc?.role === 'user' ? 'vip' : userDoc?.role,
          purchasedPacks: [...currentPacks, targetId]
        });
      } else if (type === 'cart' && items) {
        const currentPacks = userDoc?.purchasedPacks || [];
        const currentVideos = userDoc?.purchasedVideos || [];
        
        const videoIds = items.filter(i => i.type === 'video').map(i => i.id);
        const packIds = items.filter(i => i.type === 'pack').map(i => i.id);
        
        const updates: any = {
          role: userDoc?.role === 'user' ? 'vip' : userDoc?.role
        };
        
        if (videoIds.length > 0) {
          updates.purchasedVideos = [...new Set([...currentVideos, ...videoIds])];
        }
        if (packIds.length > 0) {
          updates.purchasedPacks = [...new Set([...currentPacks, ...packIds])];
        }
        
        await updateDoc(userRef, updates);
      }
      
      setPayments(payments.filter(p => p.id !== paymentId));
      alert('Paiement approuvé et accès débloqué.');
    } catch (error) {
      console.error('Error approving payment:', error);
      alert('Erreur lors de l\'approbation.');
    }
  };

  const handleRejectPayment = async (payment: AdminPayment) => {
    try {
      await updateDoc(doc(db, 'payments', payment.id), { status: 'rejected' });

      if (payment.type === 'subscription') {
        await updateDoc(doc(db, 'users', payment.userId), {
          role: 'user',
          subscriptionApprovalStatus: 'rejected',
        });
      }

      setPayments(payments.filter(p => p.id !== payment.id));
      alert('Paiement rejeté.');
    } catch (error) {
      console.error('Error rejecting payment:', error);
    }
  };

  const handleSaveUnlockedVideos = async (userId: string) => {
    try {
      const parsed = (unlockedVideosDrafts[userId] || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

      await updateDoc(doc(db, 'users', userId), {
        purchasedVideos: [...new Set(parsed)],
      });

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? {
                ...user,
                purchasedVideos: [...new Set(parsed)],
              }
            : user,
        ),
      );
    } catch (error) {
      console.error('Error saving unlocked videos:', error);
      alert('Erreur lors de la sauvegarde des videos debloquees.');
    }
  };

  if (loading || authLoading) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-12 h-12 border-4 border-medical-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (profile?.role !== 'admin') return null;

  return (
    <div className="flex-1 bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex-shrink-0 border-r border-slate-800">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-6">Administration</h2>
          <nav className="space-y-2">
            {[
              { id: 'payments', label: 'Paiements en attente', icon: CreditCard, count: payments.length },
              { id: 'users', label: 'Utilisateurs', icon: Users },
              { id: 'content', label: 'Contenu Pédagogique', icon: FileText },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                  activeTab === item.id ? 'bg-medical-600 text-white' : 'hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{item.count}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h1 className="text-3xl font-bold text-slate-900">{activeTabLabel}</h1>
            <SeedDataButton />
          </div>

          {activeTab === 'payments' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {payments.length === 0 ? (
                <div className="p-10 text-center text-slate-500">Aucun paiement en attente.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium text-sm">
                        <th className="p-4">Date</th>
                        <th className="p-4">Utilisateur</th>
                        <th className="p-4">Type</th>
                        <th className="p-4">Montant</th>
                        <th className="p-4">Méthode</th>
                        <th className="p-4">Reçu</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {payments.map((payment) => {
                        const user = users.find(u => u.id === payment.userId);
                        return (
                          <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-sm text-slate-600">{new Date(payment.createdAt).toLocaleDateString()}</td>
                            <td className="p-4">
                              <div className="font-medium text-slate-900">{user?.displayName || 'Inconnu'}</div>
                              <div className="text-xs text-slate-500">{user?.email}</div>
                            </td>
                            <td className="p-4 text-sm font-medium text-slate-700 capitalize">{payment.type}</td>
                            <td className="p-4 font-bold text-slate-900">{payment.amount} DZD</td>
                            <td className="p-4 text-sm font-medium text-slate-700 uppercase">{payment.method}</td>
                            <td className="p-4">
                              {payment.receiptUrl ? (
                                <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="text-medical-600 hover:underline text-sm font-medium">Voir le reçu</a>
                              ) : (
                                <span className="text-slate-400 text-sm">Aucun</span>
                              )}
                            </td>
                            <td className="p-4 text-right flex justify-end gap-2">
                              <button 
                                onClick={() => handleApprovePayment(payment.id, payment.userId, payment.type, payment.targetId, payment.items, payment.plan)}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Approuver"
                              >
                                <CheckCircle className="h-5 w-5" />
                              </button>
                              <button 
                                onClick={() => handleRejectPayment(payment)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Rejeter"
                              >
                                <XCircle className="h-5 w-5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium text-sm">
                      <th className="p-4">Nom</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Rôle</th>
                      <th className="p-4">Statut abo</th>
                      <th className="p-4">Abonnement Exp.</th>
                      <th className="p-4">Videos debloquees</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-medium text-slate-900">{user.displayName}</td>
                        <td className="p-4 text-sm text-slate-600">{user.email}</td>
                        <td className="p-4">
                          <select
                            value={user.role}
                            title="Role utilisateur"
                            aria-label="Role utilisateur"
                            onChange={async (e) => {
                              try {
                                const nextRole = e.target.value;
                                const roleUpdate: Record<string, unknown> = { role: nextRole };

                                if (nextRole !== 'vip_plus') {
                                  roleUpdate.subscriptionApprovalStatus = 'none';
                                }

                                await updateDoc(doc(db, 'users', user.id), roleUpdate);
                                setUsers(
                                  users.map((u) =>
                                    u.id === user.id
                                      ? {
                                          ...u,
                                          role: nextRole as any,
                                          subscriptionApprovalStatus:
                                            nextRole !== 'vip_plus'
                                              ? 'none'
                                              : u.subscriptionApprovalStatus,
                                        }
                                      : u,
                                  ),
                                );
                              } catch (error) {
                                console.error('Error updating user role:', error);
                                alert('Erreur lors de la mise à jour du rôle.');
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none outline-none cursor-pointer transition-colors
                              ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 
                                user.role === 'vip_plus' ? 'bg-accent-100 text-accent-800' : 
                                user.role === 'vip' ? 'bg-medical-100 text-medical-800' : 
                                'bg-slate-100 text-slate-800'}`}
                          >
                            <option value="user">User (Demo)</option>
                            <option value="vip">VIP (Achats)</option>
                            <option value="vip_plus">VIP Plus (Abonné)</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          <select
                            value={user.subscriptionApprovalStatus || 'none'}
                            title="Statut d abonnement"
                            aria-label="Statut d abonnement"
                            onChange={async (e) => {
                              try {
                                const nextStatus = e.target.value as 'none' | 'pending' | 'approved' | 'rejected';
                                const statusUpdate: Record<string, unknown> = {
                                  subscriptionApprovalStatus: nextStatus,
                                };

                                if (nextStatus === 'approved') {
                                  statusUpdate.role = 'vip_plus';
                                }

                                if (nextStatus === 'rejected') {
                                  statusUpdate.role = 'user';
                                }

                                await updateDoc(doc(db, 'users', user.id), statusUpdate);
                                setUsers(
                                  users.map((u) =>
                                    u.id === user.id
                                      ? {
                                          ...u,
                                          subscriptionApprovalStatus: nextStatus,
                                          role:
                                            nextStatus === 'approved'
                                              ? 'vip_plus'
                                              : nextStatus === 'rejected'
                                                ? 'user'
                                                : u.role,
                                        }
                                      : u,
                                  ),
                                );
                              } catch (error) {
                                console.error('Error updating subscription approval status:', error);
                                alert('Erreur lors de la mise a jour du statut d\'abonnement.');
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-300 outline-none cursor-pointer transition-colors bg-white"
                          >
                            <option value="none">Aucun</option>
                            <option value="pending">En attente</option>
                            <option value="approved">Approuve</option>
                            <option value="rejected">Rejete</option>
                          </select>
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          <input
                            type="date"
                            title="Date de fin d abonnement"
                            aria-label="Date de fin d abonnement"
                            value={user.subscriptionEndDate ? new Date(user.subscriptionEndDate).toISOString().split('T')[0] : ''}
                            onChange={async (e) => {
                              try {
                                const newDate = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                                await updateDoc(doc(db, 'users', user.id), { subscriptionEndDate: newDate });
                                setUsers(users.map(u => u.id === user.id ? { ...u, subscriptionEndDate: newDate } : u));
                              } catch (error) {
                                console.error('Error updating subscription date:', error);
                                alert('Erreur lors de la mise à jour de la date.');
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                          />
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={unlockedVideosDrafts[user.id] || ''}
                              onChange={(e) =>
                                setUnlockedVideosDrafts((prev) => ({
                                  ...prev,
                                  [user.id]: e.target.value,
                                }))
                              }
                              placeholder="idVideo1, idVideo2"
                              className="min-w-[220px] px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveUnlockedVideos(user.id)}
                              className="p-2 text-medical-700 hover:bg-medical-50 rounded-lg transition-colors"
                              title="Sauvegarder les videos debloquees"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={async () => {
                              if (confirm('Voulez-vous vraiment supprimer cet utilisateur ?')) {
                                try {
                                  await deleteDoc(doc(db, 'users', user.id));
                                  setUsers(users.filter(u => u.id !== user.id));
                                } catch (error) {
                                  console.error('Error deleting user:', error);
                                  alert('Erreur lors de la suppression de l\'utilisateur.');
                                }
                              }
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Supprimer l'utilisateur"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'content' && (
            <AdminContentManager />
          )}
        </div>
      </main>
    </div>
  );
}
