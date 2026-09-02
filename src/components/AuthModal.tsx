import React, { useState } from 'react';
import {
  UserCheck,
  Lock,
  Mail,
  Store,
  MapPin,
  Utensils,
  Sparkles,
  X,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast?: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccessToast,
}) => {
  const { login, register, loginDemo, user, logout } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [concept, setConcept] = useState('Wood-Fired Bistro & Bar');
  const [location, setLocation] = useState('Downtown Metro Area');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        if (onSuccessToast) onSuccessToast('Welcome back! Your restaurant data has been loaded.');
      } else {
        await register({
          email,
          password,
          name,
          restaurantName,
          concept,
          location,
        });
        if (onSuccessToast) onSuccessToast('Account created and restaurant database initialized!');
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await loginDemo();
      if (onSuccessToast) onSuccessToast('Logged in as Demo General Manager (The Oak & Ember Tavern).');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Demo login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col text-stone-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-stone-800 bg-stone-950/60 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {user ? 'Account Settings' : mode === 'login' ? 'Restaurant Manager Login' : 'Create Manager Account'}
              </h2>
              <p className="text-xs text-stone-400">
                {user
                  ? `Signed in as ${user.email}`
                  : 'Sync and persist your forecasts, historical sales, and team schedules'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {user ? (
            <div className="space-y-4">
              <div className="bg-stone-950/80 p-4 rounded-xl border border-stone-800 space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-stone-300 pb-2 border-b border-stone-800">
                  <span className="text-stone-400">Manager:</span>
                  <span className="font-semibold text-white">{user.name}</span>
                </div>
                <div className="flex justify-between items-center text-stone-300 pb-2 border-b border-stone-800">
                  <span className="text-stone-400">Restaurant:</span>
                  <span className="font-semibold text-amber-300">{user.restaurantName}</span>
                </div>
                <div className="flex justify-between items-center text-stone-300 pb-2 border-b border-stone-800">
                  <span className="text-stone-400">Email:</span>
                  <span className="font-mono text-stone-200">{user.email}</span>
                </div>
                <div className="flex justify-between items-center text-stone-300">
                  <span className="text-stone-400">Database Status:</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Cloud Synced & Persistent
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    if (onSuccessToast) onSuccessToast('Logged out successfully.');
                    onClose();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition-colors border border-stone-700"
                >
                  Log Out
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Mode Toggle */}
              <div className="grid grid-cols-2 p-1 bg-stone-950 rounded-xl border border-stone-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                  }}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    mode === 'login'
                      ? 'bg-amber-500 text-stone-950 shadow-sm'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMessage(null);
                  }}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    mode === 'register'
                      ? 'bg-amber-500 text-stone-950 shadow-sm'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {mode === 'register' && (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-stone-400 mb-1">
                          Manager Name
                        </label>
                        <div className="relative">
                          <User className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-2.5" />
                          <input
                            type="text"
                            required
                            placeholder="e.g. Chef Alex"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-stone-400 mb-1">
                          Restaurant Name
                        </label>
                        <div className="relative">
                          <Store className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-2.5" />
                          <input
                            type="text"
                            required
                            placeholder="e.g. Lumina Osteria"
                            value={restaurantName}
                            onChange={(e) => setRestaurantName(e.target.value)}
                            className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-stone-400 mb-1">
                        Concept & Dining Style
                      </label>
                      <div className="relative">
                        <Utensils className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          placeholder="e.g. Modern Italian & Craft Cocktails"
                          value={concept}
                          onChange={(e) => setConcept(e.target.value)}
                          className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-stone-400 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      placeholder="manager@restaurant.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-400 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 mt-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="inline-block animate-spin">⌛</span>
                  ) : (
                    <>
                      <span>{mode === 'login' ? 'Sign In to Restaurant' : 'Create & Initialize Database'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Fast Demo One-Click Access */}
              <div className="pt-3 border-t border-stone-800/80">
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  disabled={isSubmitting}
                  className="w-full py-2 px-3 rounded-xl bg-stone-950 hover:bg-stone-800 border border-amber-500/30 text-amber-300 text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Instant Demo: Log In as Demo General Manager</span>
                </button>
                <p className="text-[10px] text-stone-500 text-center mt-1.5">
                  Preloaded with 30-day historical POS records, local events, and kitchen roster.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
