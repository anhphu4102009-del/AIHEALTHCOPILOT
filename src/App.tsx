import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  LayoutDashboard, 
  ClipboardList, 
  Utensils, 
  TrendingUp, 
  Settings, 
  LogOut, 
  User as UserIcon,
  Plus,
  FileText,
  AlertCircle,
  ChevronRight,
  CheckCircle2,
  Clock,
  Dumbbell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { User, HealthRecord, HealthPlan, ProgressLog } from './types';
import { analyzeMedicalReport, generateHealthPlan } from './services/geminiService';
import { translations, Language } from './translations';

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      active 
        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' 
        : 'text-slate-500 hover:bg-slate-100'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

const MetricCard = ({ label, value, unit, trend, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-2xl card-shadow border border-slate-100">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      {trend && (
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <div className="space-y-1">
      <p className="text-sm text-slate-500 font-medium">{label}</p>
      <div className="flex items-baseline gap-1">
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        <span className="text-sm text-slate-400 font-medium">{unit}</span>
      </div>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const t = translations[lang];

  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [progress, setProgress] = useState<ProgressLog[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        fetchUserData(parsed.id);
      } catch (e) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const fetchUserData = async (userId: number) => {
    try {
      const [recordsRes, plansRes, progressRes] = await Promise.all([
        fetch(`/api/health/records/${userId}`),
        fetch(`/api/plans/${userId}`),
        fetch(`/api/progress/${userId}`)
      ]);
      
      setRecords(await recordsRes.json());
      setPlans(await plansRes.json());
      setProgress(await progressRes.json());
    } catch (e) {
      console.error("Failed to fetch data", e);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });
      const data = await res.json();
      if (data.id) {
        setUser(data);
        localStorage.setItem('user', JSON.stringify(data));
        setIsAuthModalOpen(false);
        if (authMode === 'register') setShowOnboarding(true);
        fetchUserData(data.id);
      }
    } catch (e) {
      alert("Auth failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    setActiveTab('overview');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const analysis = await analyzeMedicalReport(base64, lang);
        
        // Save record
        await fetch('/api/health/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            report_data: analysis.metrics,
            summary: analysis.summary
          })
        });

        // Generate Plan
        const plan = await generateHealthPlan({
          age: user.age || 20,
          gender: user.gender || 'Other',
          height: user.height || 170,
          weight: user.weight || 70,
          activityLevel: user.activity_level || 'Moderate',
          conditions: user.conditions?.split(',') || [],
          goal: user.goal || 'General Health',
          metrics: analysis.metrics
        }, lang);

        await fetch('/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            type: 'comprehensive',
            content: plan
          })
        });

        fetchUserData(user.id);
        alert("Report analyzed and plan updated!");
      } catch (e) {
        console.error(e);
        alert("Failed to process report");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Landing Nav */}
        <nav className="p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-lg">
              <Activity className="text-white" size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight">{t.appName}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-200 p-1 rounded-lg">
              <button onClick={() => setLang('en')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${lang === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>EN</button>
              <button onClick={() => setLang('vi')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${lang === 'vi' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>VI</button>
            </div>
            <button 
              onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}
              className="bg-slate-900 text-white px-6 py-2 rounded-full font-medium hover:bg-slate-800 transition-colors"
            >
              {t.getStarted}
            </button>
          </div>
        </nav>

        {/* Hero */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-6xl md:text-7xl font-bold text-slate-900 mb-6 tracking-tight leading-tight">
              {t.heroTitle} <span className="text-emerald-500">{t.heroTitleAccent}</span>
            </h1>
            <p className="text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
              {t.heroDesc}
            </p>
            <div className="flex flex-col md:flex-row gap-4 justify-center">
              <button 
                onClick={() => { setAuthMode('register'); setIsAuthModalOpen(true); }}
                className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-xl shadow-emerald-200 hover:bg-emerald-600 transition-all"
              >
                {t.startJourney}
              </button>
              <button className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-bold text-lg border border-slate-200 hover:bg-slate-50 transition-all">
                {t.learnMore}
              </button>
            </div>
          </motion.div>

          <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
            {[
              { icon: FileText, title: t.ocrFeature, desc: t.ocrDesc },
              { icon: Dumbbell, title: t.planFeature, desc: t.planDesc },
              { icon: TrendingUp, title: t.trackFeature, desc: t.trackDesc }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="bg-white p-8 rounded-3xl card-shadow border border-slate-100 text-left"
              >
                <div className="bg-emerald-50 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <feature.icon className="text-emerald-600" size={24} />
                </div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-slate-500">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </main>

        <footer className="p-10 text-center text-slate-400 text-sm">
          <p>© 2026 {t.appName}. {t.disclaimer.split(':')[0]}.</p>
        </footer>

        {/* Auth Modal */}
        <AnimatePresence>
          {isAuthModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAuthModalOpen(false)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
              >
                <h2 className="text-3xl font-bold mb-2">{authMode === 'login' ? t.welcomeBack : t.createAccount}</h2>
                <p className="text-slate-500 mb-8">{authMode === 'login' ? 'Enter your details to continue.' : 'Join us to start your health journey.'}</p>
                
                <form onSubmit={handleAuth} className="space-y-4">
                  {authMode === 'register' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t.fullName}</label>
                      <input 
                        type="text" 
                        required 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        placeholder="John Doe"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.email}</label>
                    <input 
                      type="email" 
                      required 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="name@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.password}</label>
                    <input 
                      type="password" 
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                  <button 
                    disabled={loading}
                    className="w-full bg-emerald-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-emerald-600 transition-all disabled:opacity-50"
                  >
                    {loading ? t.processing.split('.')[0] : (authMode === 'login' ? t.login : t.signup)}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <button 
                    onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                    className="text-emerald-600 font-medium hover:underline"
                  >
                    {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const latestPlan = plans[0]?.content;
  const latestRecord = records[0];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col fixed h-full">
        <div className="flex items-center gap-2 mb-10">
          <div className="bg-emerald-500 p-1.5 rounded-lg">
            <Activity className="text-white" size={20} />
          </div>
          <span className="text-lg font-bold tracking-tight">{t.appName}</span>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem icon={LayoutDashboard} label={t.overview} active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <SidebarItem icon={ClipboardList} label={t.metrics} active={activeTab === 'metrics'} onClick={() => setActiveTab('metrics')} />
          <SidebarItem icon={Dumbbell} label={t.workout} active={activeTab === 'workout'} onClick={() => setActiveTab('workout')} />
          <SidebarItem icon={Utensils} label={t.nutrition} active={activeTab === 'nutrition'} onClick={() => setActiveTab('nutrition')} />
          <SidebarItem icon={TrendingUp} label={t.progress} active={activeTab === 'progress'} onClick={() => setActiveTab('progress')} />
        </nav>

        <div className="pt-6 border-t border-slate-100 space-y-2">
          <SidebarItem icon={Settings} label={t.settings} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          <SidebarItem icon={LogOut} label={t.logout} active={false} onClick={handleLogout} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-10">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">{t.hello}, {user.name}</h2>
            <p className="text-slate-500">{t.summary}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-200 p-1 rounded-lg mr-4">
              <button onClick={() => setLang('en')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${lang === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>EN</button>
              <button onClick={() => setLang('vi')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${lang === 'vi' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>VI</button>
            </div>
            <label className="bg-emerald-500 text-white px-4 py-2 rounded-xl font-medium cursor-pointer hover:bg-emerald-600 transition-all flex items-center gap-2">
              <Plus size={18} />
              <span>{t.uploadReport}</span>
              <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
            </label>
            <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
              <UserIcon size={20} className="text-slate-500" />
            </div>
          </div>
        </header>

        {loading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-bold text-lg">{t.processing}</p>
              <p className="text-slate-500 text-sm">{t.extracting}</p>
            </div>
          </div>
        )}

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <MetricCard label={t.weight} value={user.weight || '--'} unit="kg" trend={-2.4} icon={Activity} color="bg-blue-500" />
                <MetricCard label={t.bmi} value={latestRecord?.report_data?.bmi || (user.weight && user.height ? (user.weight / Math.pow(user.height/100, 2)).toFixed(1) : '--')} unit="" trend={0} icon={TrendingUp} color="bg-emerald-500" />
                <MetricCard label={t.glucose} value={latestRecord?.report_data?.glucose || '--'} unit="mg/dL" trend={1.2} icon={Activity} color="bg-rose-500" />
                <MetricCard label={t.cholesterol} value={latestRecord?.report_data?.cholesterol || '--'} unit="mg/dL" trend={-5.1} icon={Activity} color="bg-amber-500" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart */}
                <div className="lg:col-span-2 bg-white p-8 rounded-3xl card-shadow border border-slate-100">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-bold">{t.weightProgress}</h3>
                    <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 text-sm outline-none">
                      <option>Last 30 Days</option>
                      <option>Last 6 Months</option>
                    </select>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={progress.length > 0 ? [...progress].reverse() : [{ created_at: '2026-01-01', weight: 70 }, { created_at: '2026-02-01', weight: 68 }]}>
                        <defs>
                          <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="created_at" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94a3b8', fontSize: 12 }}
                          tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Area type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorWeight)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Quick Plan */}
                <div className="bg-white p-8 rounded-3xl card-shadow border border-slate-100">
                  <h3 className="text-xl font-bold mb-6">{t.todayPlan}</h3>
                  {latestPlan ? (
                    <div className="space-y-6">
                      <div className="flex items-start gap-4">
                        <div className="bg-emerald-50 p-3 rounded-xl">
                          <Dumbbell className="text-emerald-600" size={20} />
                        </div>
                        <div>
                          <p className="text-sm text-slate-500 font-medium">{t.workout}</p>
                          <p className="font-bold">{latestPlan.workoutPlan[0]?.activity || 'Rest Day'}</p>
                          <p className="text-xs text-slate-400">{latestPlan.workoutPlan[0]?.duration || '--'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="bg-blue-50 p-3 rounded-xl">
                          <Utensils className="text-blue-600" size={20} />
                        </div>
                        <div>
                          <p className="text-sm text-slate-500 font-medium">{t.nutrition}</p>
                          <p className="font-bold">{latestPlan.nutritionPlan.dailyCalories} kcal</p>
                          <p className="text-xs text-slate-400">{latestPlan.nutritionPlan.macros.protein} Protein</p>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-slate-100">
                        <p className="text-sm font-bold mb-3">{t.healthAlert}</p>
                        <div className="bg-amber-50 p-4 rounded-2xl flex gap-3">
                          <AlertCircle className="text-amber-600 shrink-0" size={20} />
                          <p className="text-xs text-amber-800 leading-relaxed">
                            {latestRecord?.summary || t.noReports}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <p className="text-slate-400 mb-4">{t.noReports}</p>
                      <button 
                        onClick={() => setActiveTab('metrics')}
                        className="text-emerald-600 font-bold hover:underline"
                      >
                        {t.completeProfile}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'workout' && (
            <motion.div 
              key="workout"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h3 className="text-2xl font-bold mb-2">{t.workout}</h3>
                  <p className="text-slate-500">Tailored to your {user.activity_level} activity level.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {latestPlan?.workoutPlan.map((day: any, i: number) => (
                  <div key={i} className="bg-white p-6 rounded-3xl card-shadow border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{day.day}</span>
                      <div className="bg-emerald-50 p-2 rounded-lg">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      </div>
                    </div>
                    <h4 className="text-lg font-bold mb-2">{day.activity}</h4>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock size={14} />
                        <span>{day.duration}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Activity size={14} />
                        <span>{day.intensity}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-emerald-900 text-white p-8 rounded-3xl shadow-xl">
                <h4 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <AlertCircle size={24} />
                  {t.aiReasoning}
                </h4>
                <p className="text-emerald-100 leading-relaxed">
                  {latestPlan?.reasoning || t.noReports}
                </p>
              </div>
            </motion.div>
          )}

          {activeTab === 'nutrition' && (
            <motion.div 
              key="nutrition"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-white p-8 rounded-3xl card-shadow border border-slate-100">
                    <h3 className="text-xl font-bold mb-6">{t.dailyTargets}</h3>
                    <div className="space-y-6">
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm font-medium text-slate-500">Calories</span>
                          <span className="text-sm font-bold">{latestPlan?.nutritionPlan.dailyCalories || '--'} kcal</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full w-[75%]"></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Protein</p>
                          <p className="font-bold text-sm">{latestPlan?.nutritionPlan.macros.protein || '--'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Carbs</p>
                          <p className="font-bold text-sm">{latestPlan?.nutritionPlan.macros.carbs || '--'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Fats</p>
                          <p className="font-bold text-sm">{latestPlan?.nutritionPlan.macros.fats || '--'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl card-shadow border border-slate-100">
                    <h3 className="text-xl font-bold mb-4">{t.recommendations}</h3>
                    <ul className="space-y-3">
                      {latestPlan?.recommendations.map((rec: string, i: number) => (
                        <li key={i} className="flex gap-3 text-sm text-slate-600">
                          <ChevronRight className="text-emerald-500 shrink-0" size={18} />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="lg:col-span-2 bg-white p-8 rounded-3xl card-shadow border border-slate-100">
                  <h3 className="text-xl font-bold mb-6">{t.sampleMeals}</h3>
                  <div className="space-y-4">
                    {latestPlan?.nutritionPlan.sampleMeals.map((meal: string, i: number) => (
                      <div key={i} className="flex items-center gap-6 p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center shrink-0">
                          <Utensils className="text-emerald-600" size={24} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Meal {i + 1}</p>
                          <p className="font-bold text-slate-800">{meal}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'metrics' && (
            <motion.div 
              key="metrics"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="bg-white p-8 rounded-3xl card-shadow border border-slate-100">
                <h3 className="text-xl font-bold mb-8">{t.medicalHistory}</h3>
                <div className="space-y-6">
                  {records.length > 0 ? records.map((record, i) => (
                    <div key={i} className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-white p-2 rounded-lg shadow-sm">
                            <FileText className="text-emerald-500" size={20} />
                          </div>
                          <div>
                            <p className="font-bold">Medical Checkup Report</p>
                            <p className="text-xs text-slate-400">{new Date(record.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase">{t.analyzed}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-4 leading-relaxed">{record.summary}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.entries(record.report_data).map(([key, val]: [string, any]) => (
                          <div key={key} className="bg-white p-3 rounded-xl border border-slate-100">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">{key.replace(/([A-Z])/g, ' $1')}</p>
                            <p className="font-bold text-slate-800">{val}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-20">
                      <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileText className="text-slate-400" size={32} />
                      </div>
                      <p className="text-slate-500 mb-6">{t.noReports}</p>
                      <label className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-bold cursor-pointer hover:bg-emerald-600 transition-all inline-flex items-center gap-2">
                        <Plus size={20} />
                        <span>{t.uploadReport}</span>
                        <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Onboarding Modal */}
        <AnimatePresence>
          {showOnboarding && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative bg-white w-full max-w-2xl rounded-3xl p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
              >
                <h2 className="text-3xl font-bold mb-2 text-slate-900">{t.completeProfile}</h2>
                <p className="text-slate-500 mb-8">{t.onboardingDesc}</p>
                
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const profile = {
                    age: parseInt(formData.get('age') as string),
                    gender: formData.get('gender') as string,
                    height: parseFloat(formData.get('height') as string),
                    weight: parseFloat(formData.get('weight') as string),
                    activity_level: formData.get('activity_level') as string,
                    conditions: formData.get('conditions') as string,
                    goal: formData.get('goal') as string,
                  };
                  
                  if (user) {
                    await fetch(`/api/user/${user.id}/profile`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(profile)
                    });
                    setUser({ ...user, ...profile });
                    setShowOnboarding(false);
                  }
                }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">{t.age}</label>
                    <input name="age" type="number" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="20" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">{t.gender}</label>
                    <select name="gender" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                      <option>Male</option>
                      <option>Female</option>
                      <option>Non-binary</option>
                      <option>Prefer not to say</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">{t.height}</label>
                    <input name="height" type="number" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="175" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">{t.weightKg}</label>
                    <input name="weight" type="number" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="70" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">{t.activityLevel}</label>
                    <select name="activity_level" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                      <option>Sedentary (little or no exercise)</option>
                      <option>Light (1-3 days/week)</option>
                      <option>Moderate (3-5 days/week)</option>
                      <option>Active (6-7 days/week)</option>
                      <option>Very Active (intense exercise daily)</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">{t.bodyGoal}</label>
                    <select name="goal" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                      <option value="Lean">{t.goalLean}</option>
                      <option value="Bulky">{t.goalBulky}</option>
                      <option value="Athletic">{t.goalAthletic}</option>
                      <option value="Hourglass">{t.goalHourglass}</option>
                      <option value="VTaper">{t.goalVTaper}</option>
                      <option value="WeightLoss">{t.goalWeightLoss}</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">{t.conditions}</label>
                    <textarea name="conditions" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none h-24" placeholder="e.g. Asthma, Knee injury, Diabetes..."></textarea>
                  </div>
                  <div className="md:col-span-2 pt-4">
                    <button className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-100">
                      {t.completeSetup}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Disclaimer */}
        <div className="mt-12 p-6 bg-slate-100 rounded-2xl flex gap-4 items-start">
          <AlertCircle className="text-slate-400 shrink-0" size={20} />
          <p className="text-xs text-slate-500 leading-relaxed">
            {t.disclaimer}
          </p>
        </div>
      </main>
    </div>
  );
}
