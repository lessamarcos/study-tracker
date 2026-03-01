import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, BookOpen, CheckSquare, TrendingUp, Plus, Trash2, FileText, Target, Award, BarChart3, Flame, Download, Edit2, Check, X, LogOut, Play, Pause, RotateCcw, Timer, Trophy, Bell } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDfdwW8q8poJDczwF5KeB4DAm2yT4j9vZE",
  authDomain: "meu-tracker-a49e2.firebaseapp.com",
  projectId: "meu-tracker-a49e2",
  storageBucket: "meu-tracker-a49e2.firebasestorage.app",
  messagingSenderId: "669962122112",
  appId: "1:669962122112:web:749883ee3e5422de4cc765"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Achievements definition
const ACHIEVEMENTS = [
  { id: 'first_session', name: 'Primeiro Passo', description: 'Complete sua primeira sessão', icon: '🎯', requirement: 1, type: 'sessions' },
  { id: 'week_streak', name: 'Semana Completa', description: '7 dias consecutivos estudando', icon: '🔥', requirement: 7, type: 'streak' },
  { id: 'hours_10', name: 'Maratonista', description: 'Complete 10 horas de estudo', icon: '⏱️', requirement: 600, type: 'minutes' },
  { id: 'hours_50', name: 'Dedicado', description: 'Complete 50 horas de estudo', icon: '💪', requirement: 3000, type: 'minutes' },
  { id: 'hours_100', name: 'Mestre', description: 'Complete 100 horas de estudo', icon: '👑', requirement: 6000, type: 'minutes' },
  { id: 'exercises_50', name: 'Praticante', description: 'Resolva 50 exercícios', icon: '✍️', requirement: 50, type: 'exercises' },
  { id: 'exercises_100', name: 'Expert', description: 'Resolva 100 exercícios', icon: '🎓', requirement: 100, type: 'exercises' },
  { id: 'month_streak', name: 'Mês Perfeito', description: '30 dias consecutivos', icon: '🌟', requirement: 30, type: 'streak' },
];

export default function StudyTracker() {
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [goals, setGoals] = useState({ daily: 120, weekly: 600 }); // em minutos
  const [achievements, setAchievements] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showAchievementNotification, setShowAchievementNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingTopic, setEditingTopic] = useState(null);

  // Pomodoro Timer States
  const [pomodoroTime, setPomodoroTime] = useState(25 * 60); // 25 minutes in seconds
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroTopic, setPomodoroTopic] = useState('');
  const [pomodoroStartTime, setPomodoroStartTime] = useState(null);
  const timerRef = useRef(null);

  const [sessionForm, setSessionForm] = useState({
    date: new Date().toISOString().split('T')[0],
    topicId: '',
    duration: '',
    exercises: '',
    pages: '',
    notes: ''
  });

  const [topicForm, setTopicForm] = useState({
    name: '',
    category: '',
    status: 'todo',
    color: '#3B82F6'
  });

  // Auth state observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load data from Firestore
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);

    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setSessions(data.sessions || []);
        setTopics(data.topics || []);
        setGoals(data.goals || { daily: 120, weekly: 600 });
        setAchievements(data.achievements || []);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Check for new achievements whenever sessions change
  useEffect(() => {
    if (sessions.length > 0 && user) {
      checkAchievements();
    }
  }, [sessions]);

  // Pomodoro Timer Effect
  useEffect(() => {
    if (pomodoroRunning && pomodoroTime > 0) {
      timerRef.current = setInterval(() => {
        setPomodoroTime(prev => {
          if (prev <= 1) {
            handlePomodoroComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [pomodoroRunning, pomodoroTime]);

  // Save data to Firestore
  const saveToFirebase = async (newSessions, newTopics, newGoals = goals, newAchievements = achievements) => {
    if (!user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        sessions: newSessions,
        topics: newTopics,
        goals: newGoals,
        achievements: newAchievements,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error('Erro ao salvar:', error);
    }
  };

  // Check and unlock achievements
  const checkAchievements = () => {
    const newAchievements = [];
    const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
    const totalExercises = sessions.reduce((sum, s) => sum + s.exercises, 0);
    const currentStreak = calculateStreak().current;

    ACHIEVEMENTS.forEach(achievement => {
      if (achievements.includes(achievement.id)) return; // Already unlocked

      let unlocked = false;

      switch (achievement.type) {
        case 'sessions':
          unlocked = sessions.length >= achievement.requirement;
          break;
        case 'minutes':
          unlocked = totalMinutes >= achievement.requirement;
          break;
        case 'exercises':
          unlocked = totalExercises >= achievement.requirement;
          break;
        case 'streak':
          unlocked = currentStreak >= achievement.requirement;
          break;
        case 'special':
          // Check for special achievements
            unlocked = sessions.some(s => {
              const hour = new Date(s.date + 'T06:00:00').getHours();
              return hour < 7;
            });
          }
            unlocked = sessions.some(s => {
              const hour = new Date(s.date + 'T22:00:00').getHours();
              return hour >= 22;
            });
          }
          break;
      }

      if (unlocked) {
        newAchievements.push(achievement.id);
        // Show notification
        setShowAchievementNotification(achievement);
        setTimeout(() => setShowAchievementNotification(null), 5000);
      }
    });

    if (newAchievements.length > 0) {
      const updatedAchievements = [...achievements, ...newAchievements];
      setAchievements(updatedAchievements);
      saveToFirebase(sessions, topics, goals, updatedAchievements);
    }
  };

  // Pomodoro handlers
  const startPomodoro = () => {
    if (!pomodoroTopic) {
      alert('Selecione um tópico primeiro!');
      return;
    }
    setPomodoroRunning(true);
    setPomodoroStartTime(Date.now());
  };

  const pausePomodoro = () => {
    setPomodoroRunning(false);
  };

  const resetPomodoro = () => {
    setPomodoroRunning(false);
    setPomodoroTime(25 * 60);
    setPomodoroStartTime(null);
  };

  const handlePomodoroComplete = () => {
    setPomodoroRunning(false);

    // Play notification sound (browser notification)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Pomodoro Completo! 🎉', {
        body: 'Sessão de estudo finalizada. Faça uma pausa!',
        icon: '/favicon.ico'
      });
    }

    // Auto-save session
    const duration = Math.round((Date.now() - pomodoroStartTime) / 1000 / 60); // minutes
    const newSession = {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      topicId: pomodoroTopic,
      duration: duration,
      exercises: 0,
      pages: 0,
      notes: 'Sessão Pomodoro'
    };

    const updatedSessions = [newSession, ...sessions];
    setSessions(updatedSessions);
    saveToFirebase(updatedSessions, topics);

    alert('Pomodoro completo! Sessão salva automaticamente.');
    resetPomodoro();
  };

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Login/Logout
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Erro no login:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSessions([]);
      setTopics([]);
      setAchievements([]);
    } catch (error) {
      console.error('Erro no logout:', error);
    }
  };

  // Session handlers
  const handleSessionSubmit = (e) => {
    e.preventDefault();
    const newSession = {
      id: Date.now(),
      ...sessionForm,
      duration: parseInt(sessionForm.duration) || 0,
      exercises: parseInt(sessionForm.exercises) || 0,
      pages: parseInt(sessionForm.pages) || 0
    };

    const updatedSessions = [newSession, ...sessions];
    setSessions(updatedSessions);
    saveToFirebase(updatedSessions, topics);

    setSessionForm({
      date: new Date().toISOString().split('T')[0],
      topicId: '',
      duration: '',
      exercises: '',
      pages: '',
      notes: ''
    });
    setShowSessionForm(false);
  };

  const deleteSession = (id) => {
    const updatedSessions = sessions.filter(s => s.id !== id);
    setSessions(updatedSessions);
    saveToFirebase(updatedSessions, topics);
  };

  // Topic handlers
  const handleTopicSubmit = (e) => {
    e.preventDefault();

    let updatedTopics;
    if (editingTopic) {
      updatedTopics = topics.map(t => t.id === editingTopic.id ? {...topicForm, id: t.id} : t);
      setEditingTopic(null);
    } else {
      const newTopic = { id: Date.now(), ...topicForm };
      updatedTopics = [...topics, newTopic];
    }

    setTopics(updatedTopics);
    saveToFirebase(sessions, updatedTopics);

    setTopicForm({ name: '', category: '', status: 'todo', color: '#3B82F6' });
    setShowTopicForm(false);
  };

  const deleteTopic = (id) => {
    const updatedTopics = topics.filter(t => t.id !== id);
    setTopics(updatedTopics);
    saveToFirebase(sessions, updatedTopics);
  };

  const editTopic = (topic) => {
    setEditingTopic(topic);
    setTopicForm(topic);
    setShowTopicForm(true);
  };

  const updateTopicStatus = (id, status) => {
    const updatedTopics = topics.map(t => t.id === id ? {...t, status} : t);
    setTopics(updatedTopics);
    saveToFirebase(sessions, updatedTopics);
  };

  // Goals handler
  const handleGoalsSubmit = (e) => {
    e.preventDefault();
    saveToFirebase(sessions, topics, goals);
    setShowGoalsModal(false);
  };

  // Calculate daily progress
  const getDailyProgress = () => {
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter(s => s.date === today);
    const totalMinutes = todaySessions.reduce((sum, s) => sum + s.duration, 0);
    return {
      current: totalMinutes,
      goal: goals.daily,
      percentage: Math.min((totalMinutes / goals.daily) * 100, 100)
    };
  };

  // Calculate weekly progress
  const getWeeklyProgress = () => {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekSessions = sessions.filter(s => {
      const sessionDate = new Date(s.date);
      return sessionDate >= weekAgo && sessionDate <= today;
    });
    const totalMinutes = weekSessions.reduce((sum, s) => sum + s.duration, 0);
    return {
      current: totalMinutes,
      goal: goals.weekly,
      percentage: Math.min((totalMinutes / goals.weekly) * 100, 100)
    };
  };

  // Statistics
  const stats = {
    totalDays: sessions.length,
    totalHours: sessions.reduce((sum, s) => sum + s.duration, 0),
    totalExercises: sessions.reduce((sum, s) => sum + s.exercises, 0),
    totalPages: sessions.reduce((sum, s) => sum + s.pages, 0),
  };

  // Streak calculation
  const calculateStreak = () => {
    if (sessions.length === 0) return { current: 0, best: 0 };

    const dates = [...new Set(sessions.map(s => s.date))].sort().reverse();
    let current = 0;
    let best = 0;
    let temp = 0;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (dates[0] === today || dates[0] === yesterday) {
      current = 1;
      for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i-1]) - new Date(dates[i])) / 86400000;
        if (diff === 1) current++;
        else break;
      }
    }

    temp = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i-1]) - new Date(dates[i])) / 86400000;
      if (diff === 1) {
        temp++;
        best = Math.max(best, temp);
      } else {
        temp = 1;
      }
    }
    best = Math.max(best, temp, current);

    return { current, best };
  };

  const streak = calculateStreak();
  const dailyProgress = getDailyProgress();
  const weeklyProgress = getWeeklyProgress();

  // Charts data
  const getLast7DaysData = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000);
      const dateStr = date.toISOString().split('T')[0];
      const daySessions = sessions.filter(s => s.date === dateStr);
      const totalMinutes = daySessions.reduce((sum, s) => sum + s.duration, 0);

      days.push({
        name: date.toLocaleDateString('pt-BR', { weekday: 'short' }),
        horas: Math.round(totalMinutes / 60 * 10) / 10,
        exercícios: daySessions.reduce((sum, s) => sum + s.exercises, 0)
      });
    }
    return days;
  };

  const getTopicDistribution = () => {
    const distribution = {};
    sessions.forEach(s => {
      const topic = topics.find(t => t.id === parseInt(s.topicId));
      const name = topic ? topic.name : 'Sem tópico';
      distribution[name] = (distribution[name] || 0) + s.duration;
    });

    return Object.entries(distribution).map(([name, value]) => ({
      name,
      value: Math.round(value / 60 * 10) / 10
    }));
  };

  const getHeatmapData = () => {
    const data = [];
    const today = new Date();

    for (let i = 90; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 86400000);
      const dateStr = date.toISOString().split('T')[0];
      const daySessions = sessions.filter(s => s.date === dateStr);
      const intensity = daySessions.length > 0 ? Math.min(daySessions.reduce((sum, s) => sum + s.duration, 0) / 60, 4) : 0;

      data.push({
        date: dateStr,
        day: date.getDate(),
        month: date.getMonth(),
        intensity: Math.ceil(intensity)
      });
    }

    return data;
  };

  const generatePDFReport = () => {
    const reportData = {
      generatedAt: new Date().toLocaleString('pt-BR'),
      period: 'Últimos 30 dias',
      stats: {
        totalDays: sessions.filter(s => {
          const sessionDate = new Date(s.date);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
          return sessionDate >= thirtyDaysAgo;
        }).length,
        totalHours: Math.round(sessions.filter(s => {
          const sessionDate = new Date(s.date);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
          return sessionDate >= thirtyDaysAgo;
        }).reduce((sum, s) => sum + s.duration, 0) / 60 * 10) / 10,
        totalExercises: sessions.filter(s => {
          const sessionDate = new Date(s.date);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
          return sessionDate >= thirtyDaysAgo;
        }).reduce((sum, s) => sum + s.exercises, 0),
      },
      streak,
      topTopics: getTopicDistribution().slice(0, 5),
      achievements: ACHIEVEMENTS.filter(a => achievements.includes(a.id))
    };

    const report = `
═══════════════════════════════════════════
📚 RELATÓRIO DE ESTUDOS
═══════════════════════════════════════════

Gerado em: ${reportData.generatedAt}
Período: ${reportData.period}

───────────────────────────────────────────
📊 ESTATÍSTICAS GERAIS
───────────────────────────────────────────

✓ Dias de estudo: ${reportData.stats.totalDays}
✓ Total de horas: ${reportData.stats.totalHours}h
✓ Exercícios resolvidos: ${reportData.stats.totalExercises}

───────────────────────────────────────────
🔥 SEQUÊNCIA (STREAK)
───────────────────────────────────────────

• Sequência atual: ${reportData.streak.current} dias
• Melhor sequência: ${reportData.streak.best} dias

───────────────────────────────────────────
🏆 CONQUISTAS DESBLOQUEADAS
───────────────────────────────────────────

${reportData.achievements.map(a => `${a.icon} ${a.name} - ${a.description}`).join('\n')}

───────────────────────────────────────────
📖 TÓPICOS MAIS ESTUDADOS
───────────────────────────────────────────

${reportData.topTopics.map((t, i) => `${i+1}. ${t.name}: ${t.value}h`).join('\n')}

───────────────────────────────────────────
📋 LISTA DE TÓPICOS
───────────────────────────────────────────

${topics.map(t => {
  const statusEmoji = t.status === 'completed' ? '✅' : t.status === 'inProgress' ? '🔄' : '📝';
  return `${statusEmoji} ${t.name} - ${t.category || 'Sem categoria'}`;
}).join('\n')}

═══════════════════════════════════════════
Continue estudando e evoluindo! 🚀
═══════════════════════════════════════════
    `;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-estudos-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatHours = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}min`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}min`;
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#EF4444'];

  // Login screen
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full border border-gray-700 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">
              📚 Tracker de Estudos
            </h1>
            <p className="text-gray-400">Seus dados sincronizados na nuvem</p>
          </div>

          <button
            onClick={handleLogin}
            className="w-full px-6 py-4 bg-white hover:bg-gray-100 text-gray-900 font-semibold rounded-lg transition-all flex items-center justify-center gap-3 shadow-lg"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Entrar com Google
          </button>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>✨ Acesse de qualquer dispositivo</p>
            <p>🔒 Seus dados seguros no Google Cloud</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Achievement Notification */}
      {showAchievementNotification && (
        <div className="fixed top-4 right-4 z-50 bg-gradient-to-r from-yellow-600 to-orange-600 rounded-xl p-4 shadow-2xl animate-bounce">
          <div className="flex items-center gap-3">
            <Trophy size={32} className="text-yellow-100" />
            <div>
              <div className="font-bold text-white">Nova Conquista Desbloqueada! 🎉</div>
              <div className="text-yellow-100 text-sm">{showAchievementNotification.icon} {showAchievementNotification.name}</div>
              <div className="text-yellow-200 text-xs">{showAchievementNotification.description}</div>
            </div>
          </div>
        </div>
      )}

      {/* Goals Modal */}
      {showGoalsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-40 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h2 className="text-2xl font-bold mb-4">Configurar Metas</h2>
            <form onSubmit={handleGoalsSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Meta Diária (minutos)
                </label>
                <input
                  type="number"
                  value={goals.daily}
                  onChange={(e) => setGoals({...goals, daily: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-100"
                  min="0"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">{Math.floor(goals.daily / 60)}h {goals.daily % 60}min por dia</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Meta Semanal (minutos)
                </label>
                <input
                  type="number"
                  value={goals.weekly}
                  onChange={(e) => setGoals({...goals, weekly: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-100"
                  min="0"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">{Math.floor(goals.weekly / 60)}h {goals.weekly % 60}min por semana</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-lg font-semibold transition-all"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setShowGoalsModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              📚 Tracker de Estudos
            </h1>

            <div className="flex items-center gap-3">
              <div className="text-right hidden md:block">
                <div className="text-sm text-gray-400">Logado como</div>
                <div className="text-sm font-medium text-gray-200">{user.displayName}</div>
              </div>
              {user.photoURL && (
                <img src={user.photoURL} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-blue-500" />
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-all flex items-center gap-2"
                title="Sair"
              >
                <LogOut size={18} />
                <span className="hidden md:inline">Sair</span>
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <TrendingUp size={18} />
                Dashboard
              </div>
            </button>

            <button
              onClick={() => setActiveTab('pomodoro')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'pomodoro'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <Timer size={18} />
                Pomodoro
              </div>
            </button>

            <button
              onClick={() => setActiveTab('sessions')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'sessions'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText size={18} />
                Sessões
              </div>
            </button>

            <button
              onClick={() => setActiveTab('topics')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'topics'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <Target size={18} />
                Metas
              </div>
            </button>

            <button
              onClick={() => setActiveTab('achievements')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'achievements'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <Trophy size={18} />
                Conquistas
              </div>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 size={18} />
                Análises
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 shadow-lg">
                <div className="flex items-center gap-2 text-blue-100 mb-2">
                  <Calendar size={20} />
                  <span className="text-sm font-medium">Dias</span>
                </div>
                <div className="text-3xl font-bold text-white">{stats.totalDays}</div>
              </div>

              <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-5 shadow-lg">
                <div className="flex items-center gap-2 text-purple-100 mb-2">
                  <Clock size={20} />
                  <span className="text-sm font-medium">Horas</span>
                </div>
                <div className="text-3xl font-bold text-white">{Math.round(stats.totalHours / 60)}</div>
              </div>

              <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-5 shadow-lg">
                <div className="flex items-center gap-2 text-green-100 mb-2">
                  <CheckSquare size={20} />
                  <span className="text-sm font-medium">Exercícios</span>
                </div>
                <div className="text-3xl font-bold text-white">{stats.totalExercises}</div>
              </div>

              <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-xl p-5 shadow-lg">
                <div className="flex items-center gap-2 text-orange-100 mb-2">
                  <Flame size={20} />
                  <span className="text-sm font-medium">Sequência</span>
                </div>
                <div className="text-3xl font-bold text-white">{streak.current}</div>
                <div className="text-xs text-orange-200 mt-1">Recorde: {streak.best} dias</div>
              </div>
            </div>

            {/* Goals Progress */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Daily Goal */}
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Target size={20} />
                    Meta Diária
                  </h3>
                  <button
                    onClick={() => setShowGoalsModal(true)}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Editar
                  </button>
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{formatHours(dailyProgress.current)}</span>
                    <span className="text-gray-400">{formatHours(dailyProgress.goal)}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-4">
                    <div
                      className="bg-gradient-to-r from-green-500 to-emerald-500 h-4 rounded-full transition-all flex items-center justify-end px-2"
                      style={{width: `${dailyProgress.percentage}%`}}
                    >
                      {dailyProgress.percentage >= 20 && (
                        <span className="text-xs font-bold text-white">{Math.round(dailyProgress.percentage)}%</span>
                      )}
                    </div>
                  </div>
                </div>

                {dailyProgress.percentage >= 100 && (
                  <div className="text-green-400 text-sm font-medium flex items-center gap-1 mt-2">
                    <Check size={16} />
                    Meta cumprida hoje! 🎉
                  </div>
                )}
                {dailyProgress.percentage < 100 && (
                  <div className="text-gray-400 text-sm mt-2">
                    Faltam {formatHours(dailyProgress.goal - dailyProgress.current)} para atingir a meta
                  </div>
                )}
              </div>

              {/* Weekly Goal */}
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Calendar size={20} />
                    Meta Semanal
                  </h3>
                  <button
                    onClick={() => setShowGoalsModal(true)}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Editar
                  </button>
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{formatHours(weeklyProgress.current)}</span>
                    <span className="text-gray-400">{formatHours(weeklyProgress.goal)}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-4">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-4 rounded-full transition-all flex items-center justify-end px-2"
                      style={{width: `${weeklyProgress.percentage}%`}}
                    >
                      {weeklyProgress.percentage >= 20 && (
                        <span className="text-xs font-bold text-white">{Math.round(weeklyProgress.percentage)}%</span>
                      )}
                    </div>
                  </div>
                </div>

                {weeklyProgress.percentage >= 100 && (
                  <div className="text-blue-400 text-sm font-medium flex items-center gap-1 mt-2">
                    <Check size={16} />
                    Meta semanal cumprida! 🎉
                  </div>
                )}
                {weeklyProgress.percentage < 100 && (
                  <div className="text-gray-400 text-sm mt-2">
                    Faltam {formatHours(weeklyProgress.goal - weeklyProgress.current)} nesta semana
                  </div>
                )}
              </div>
            </div>

            {/* Streak Message */}
            {streak.current >= 7 && (
              <div className="bg-gradient-to-r from-yellow-600 to-orange-600 rounded-xl p-4 shadow-lg">
                <div className="flex items-center gap-3">
                  <Award size={32} className="text-yellow-100" />
                  <div>
                    <div className="font-bold text-white text-lg">Incrível! 🎉</div>
                    <div className="text-yellow-100 text-sm">Você está em uma sequência de {streak.current} dias! Continue assim!</div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setActiveTab('pomodoro')}
                className="flex-1 min-w-[200px] px-6 py-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <Timer size={20} />
                Iniciar Pomodoro
              </button>

              <button
                onClick={() => {
                  setShowSessionForm(true);
                  setActiveTab('sessions');
                }}
                className="flex-1 min-w-[200px] px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <Plus size={20} />
                Nova Sessão
              </button>

              <button
                onClick={generatePDFReport}
                className="flex-1 min-w-[200px] px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <Download size={20} />
                Exportar Relatório
              </button>
            </div>

            {/* Recent Achievements */}
            {achievements.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Trophy size={24} />
                  Conquistas Recentes
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {ACHIEVEMENTS.filter(a => achievements.includes(a.id)).slice(-4).map(achievement => (
                    <div key={achievement.id} className="bg-gradient-to-br from-yellow-600 to-orange-600 rounded-lg p-4 text-center">
                      <div className="text-4xl mb-2">{achievement.icon}</div>
                      <div className="text-sm font-bold text-white">{achievement.name}</div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setActiveTab('achievements')}
                  className="mt-4 w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all"
                >
                  Ver Todas ({achievements.length}/{ACHIEVEMENTS.length})
                </button>
              </div>
            )}

            {/* Recent Sessions Preview */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <FileText size={24} />
                Sessões Recentes
              </h2>

              {sessions.slice(0, 3).map(session => {
                const topic = topics.find(t => t.id === parseInt(session.topicId));
                return (
                  <div key={session.id} className="mb-3 pb-3 border-b border-gray-700 last:border-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-blue-400">
                          {topic ? topic.name : 'Sem tópico'}
                        </div>
                        <div className="text-sm text-gray-400">
                          {new Date(session.date).toLocaleDateString('pt-BR')} • {formatHours(session.duration)}
                        </div>
                      </div>
                      <div className="text-sm text-gray-400">
                        {session.exercises > 0 && `${session.exercises} ex.`}
                      </div>
                    </div>
                  </div>
                );
              })}

              {sessions.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Nenhuma sessão registrada ainda
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pomodoro Tab */}
        {activeTab === 'pomodoro' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
              <h2 className="text-2xl font-bold mb-6 text-center">⏱️ Timer Pomodoro</h2>

              {/* Timer Display */}
              <div className="text-center mb-8">
                <div className="text-8xl font-bold bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent mb-4">
                  {formatTime(pomodoroTime)}
                </div>

                <div className="text-gray-400 mb-6">
                  {pomodoroRunning ? '⏳ Em execução...' : pomodoroTime === 0 ? '✅ Completo!' : '⏸️ Pausado'}
                </div>
              </div>

              {/* Topic Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">Estudando</label>
                <select
                  value={pomodoroTopic}
                  onChange={(e) => setPomodoroTopic(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-100 text-lg"
                  disabled={pomodoroRunning}
                >
                  <option value="">Selecione um tópico</option>
                  {topics.map(topic => (
                    <option key={topic.id} value={topic.id}>{topic.name}</option>
                  ))}
                </select>
              </div>

              {/* Controls */}
              <div className="flex gap-3 justify-center mb-6">
                {!pomodoroRunning ? (
                  <button
                    onClick={startPomodoro}
                    disabled={pomodoroTime === 0}
                    className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-600 rounded-lg font-semibold transition-all flex items-center gap-2 shadow-lg text-lg"
                  >
                    <Play size={24} />
                    Iniciar
                  </button>
                ) : (
                  <button
                    onClick={pausePomodoro}
                    className="px-8 py-4 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 rounded-lg font-semibold transition-all flex items-center gap-2 shadow-lg text-lg"
                  >
                    <Pause size={24} />
                    Pausar
                  </button>
                )}

                <button
                  onClick={resetPomodoro}
                  className="px-8 py-4 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-all flex items-center gap-2 shadow-lg text-lg"
                >
                  <RotateCcw size={24} />
                  Resetar
                </button>
              </div>

              {/* Info */}
              <div className="bg-blue-900 bg-opacity-30 rounded-lg p-4 text-sm text-blue-200">
                <div className="flex items-start gap-2">
                  <Bell size={18} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold mb-1">Como funciona:</p>
                    <ul className="space-y-1 text-xs">
                      <li>• Timer padrão: 25 minutos (Pomodoro clássico)</li>
                      <li>• Quando terminar, a sessão é salva automaticamente</li>
                      <li>• Você receberá uma notificação quando completar</li>
                      <li>• Faça pausas de 5-10 minutos entre sessões!</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Pomodoros */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-bold mb-4">Sessões Pomodoro Recentes</h3>
              <div className="space-y-2">
                {sessions
                  .filter(s => s.notes === 'Sessão Pomodoro')
                  .slice(0, 5)
                  .map(session => {
                    const topic = topics.find(t => t.id === parseInt(session.topicId));
                    return (
                      <div key={session.id} className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                        <div>
                          <div className="font-medium">{topic?.name || 'Sem tópico'}</div>
                          <div className="text-sm text-gray-400">{new Date(session.date).toLocaleDateString('pt-BR')}</div>
                        </div>
                        <div className="text-sm text-gray-300">{formatHours(session.duration)}</div>
                      </div>
                    );
                  })}
                {sessions.filter(s => s.notes === 'Sessão Pomodoro').length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    Nenhuma sessão Pomodoro ainda
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Achievements Tab */}
        {activeTab === 'achievements' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-yellow-600 to-orange-600 rounded-xl p-6 shadow-lg">
              <div className="flex items-center gap-3 mb-2">
                <Trophy size={32} className="text-yellow-100" />
                <div>
                  <h2 className="text-2xl font-bold text-white">Suas Conquistas</h2>
                  <p className="text-yellow-100">{achievements.length} de {ACHIEVEMENTS.length} desbloqueadas</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="w-full bg-yellow-900 bg-opacity-50 rounded-full h-4">
                  <div
                    className="bg-white h-4 rounded-full transition-all"
                    style={{width: `${(achievements.length / ACHIEVEMENTS.length) * 100}%`}}
                  />
                </div>
              </div>
            </div>

            {/* Unlocked Achievements */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-xl font-bold mb-4">✅ Desbloqueadas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ACHIEVEMENTS.filter(a => achievements.includes(a.id)).map(achievement => (
                  <div key={achievement.id} className="bg-gradient-to-br from-yellow-600 to-orange-600 rounded-lg p-4 shadow-lg">
                    <div className="text-5xl mb-3 text-center">{achievement.icon}</div>
                    <div className="text-center">
                      <div className="font-bold text-white text-lg mb-1">{achievement.name}</div>
                      <div className="text-yellow-100 text-sm">{achievement.description}</div>
                    </div>
                  </div>
                ))}
              </div>

              {achievements.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  Continue estudando para desbloquear conquistas! 🏆
                </div>
              )}
            </div>

            {/* Locked Achievements */}
            {ACHIEVEMENTS.filter(a => !achievements.includes(a.id)).length > 0 && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-xl font-bold mb-4">🔒 Bloqueadas</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ACHIEVEMENTS.filter(a => !achievements.includes(a.id)).map(achievement => (
                    <div key={achievement.id} className="bg-gray-700 rounded-lg p-4 opacity-60">
                      <div className="text-5xl mb-3 text-center grayscale">{achievement.icon}</div>
                      <div className="text-center">
                        <div className="font-bold text-gray-300 text-lg mb-1">{achievement.name}</div>
                        <div className="text-gray-400 text-sm">{achievement.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sessions Tab - mantém o mesmo código anterior */}
        {activeTab === 'sessions' && (
          <div className="space-y-6">
            <button
              onClick={() => setShowSessionForm(!showSessionForm)}
              className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Plus size={20} />
              {showSessionForm ? 'Cancelar' : 'Nova Sessão'}
            </button>

            {showSessionForm && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 shadow-xl">
                <form onSubmit={handleSessionSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Data</label>
                      <input
                        type="date"
                        value={sessionForm.date}
                        onChange={(e) => setSessionForm({...sessionForm, date: e.target.value})}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Tópico/Meta</label>
                      <select
                        value={sessionForm.topicId}
                        onChange={(e) => setSessionForm({...sessionForm, topicId: e.target.value})}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100"
                        required
                      >
                        <option value="">Selecione um tópico</option>
                        {topics.map(topic => (
                          <option key={topic.id} value={topic.id}>{topic.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Tempo (minutos)</label>
                      <input
                        type="number"
                        value={sessionForm.duration}
                        onChange={(e) => setSessionForm({...sessionForm, duration: e.target.value})}
                        placeholder="120"
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 placeholder-gray-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Exercícios</label>
                      <input
                        type="number"
                        value={sessionForm.exercises}
                        onChange={(e) => setSessionForm({...sessionForm, exercises: e.target.value})}
                        placeholder="15"
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 placeholder-gray-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Páginas</label>
                      <input
                        type="number"
                        value={sessionForm.pages}
                        onChange={(e) => setSessionForm({...sessionForm, pages: e.target.value})}
                        placeholder="30"
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 placeholder-gray-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Notas</label>
                    <textarea
                      value={sessionForm.notes}
                      onChange={(e) => setSessionForm({...sessionForm, notes: e.target.value})}
                      placeholder="Como foi o estudo?"
                      rows="3"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 placeholder-gray-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-lg font-semibold transition-all shadow-lg"
                  >
                    Salvar Sessão
                  </button>
                </form>
              </div>
            )}

            {/* Sessions List */}
            <div className="space-y-4">
              {sessions.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
                  <BookOpen size={48} className="mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400">Nenhuma sessão registrada</p>
                </div>
              ) : (
                sessions.map(session => {
                  const topic = topics.find(t => t.id === parseInt(session.topicId));
                  return (
                    <div key={session.id} className="bg-gray-800 rounded-lg p-5 border border-gray-700 hover:border-gray-600 transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {topic && (
                              <div className="w-3 h-3 rounded-full" style={{backgroundColor: topic.color}}></div>
                            )}
                            <h3 className="text-lg font-semibold text-blue-400">
                              {topic ? topic.name : 'Sem tópico'}
                            </h3>
                          </div>
                          <p className="text-sm text-gray-400">
                            {new Date(session.date).toLocaleDateString('pt-BR', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteSession(session.id)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div className="flex items-center gap-2 text-gray-300">
                          <Clock size={16} className="text-purple-400" />
                          <span className="text-sm">{formatHours(session.duration)}</span>
                        </div>
                        {session.exercises > 0 && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <CheckSquare size={16} className="text-green-400" />
                            <span className="text-sm">{session.exercises} ex.</span>
                          </div>
                        )}
                        {session.pages > 0 && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <BookOpen size={16} className="text-yellow-400" />
                            <span className="text-sm">{session.pages} pág.</span>
                          </div>
                        )}
                      </div>

                      {session.notes && (
                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <p className="text-sm text-gray-400 italic">{session.notes}</p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Topics Tab - mantém o mesmo */}
        {activeTab === 'topics' && (
          <div className="space-y-6">
            <button
              onClick={() => {
                setShowTopicForm(!showTopicForm);
                if (showTopicForm) {
                  setEditingTopic(null);
                  setTopicForm({ name: '', category: '', status: 'todo', color: '#3B82F6' });
                }
              }}
              className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Plus size={20} />
              {showTopicForm ? 'Cancelar' : 'Novo Tópico/Meta'}
            </button>

            {showTopicForm && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 shadow-xl">
                <form onSubmit={handleTopicSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Nome do Tópico</label>
                      <input
                        type="text"
                        value={topicForm.name}
                        onChange={(e) => setTopicForm({...topicForm, name: e.target.value})}
                        placeholder="Ex: React Hooks, Cálculo I"
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 placeholder-gray-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Categoria</label>
                      <input
                        type="text"
                        value={topicForm.category}
                        onChange={(e) => setTopicForm({...topicForm, category: e.target.value})}
                        placeholder="Ex: Programação, Matemática"
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 placeholder-gray-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                      <select
                        value={topicForm.status}
                        onChange={(e) => setTopicForm({...topicForm, status: e.target.value})}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100"
                      >
                        <option value="todo">📝 Para fazer</option>
                        <option value="inProgress">🔄 Em progresso</option>
                        <option value="completed">✅ Concluído</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Cor</label>
                      <input
                        type="color"
                        value={topicForm.color}
                        onChange={(e) => setTopicForm({...topicForm, color: e.target.value})}
                        className="w-full h-10 px-2 py-1 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-lg font-semibold transition-all shadow-lg"
                  >
                    {editingTopic ? 'Atualizar' : 'Criar'} Tópico
                  </button>
                </form>
              </div>
            )}

            {/* Topics by Status */}
            {['todo', 'inProgress', 'completed'].map(status => {
              const statusTopics = topics.filter(t => t.status === status);
              const statusLabels = {
                todo: '📝 Para Fazer',
                inProgress: '🔄 Em Progresso',
                completed: '✅ Concluídos'
              };

              return (
                <div key={status} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-bold mb-4">{statusLabels[status]} ({statusTopics.length})</h3>

                  {statusTopics.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Nenhum tópico nesta categoria</p>
                  ) : (
                    <div className="space-y-3">
                      {statusTopics.map(topic => (
                        <div key={topic.id} className="bg-gray-700 rounded-lg p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-4 h-4 rounded-full" style={{backgroundColor: topic.color}}></div>
                            <div className="flex-1">
                              <div className="font-semibold">{topic.name}</div>
                              {topic.category && (
                                <div className="text-sm text-gray-400">{topic.category}</div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {status !== 'completed' && (
                              <button
                                onClick={() => updateTopicStatus(topic.id, status === 'todo' ? 'inProgress' : 'completed')}
                                className="p-2 text-green-400 hover:bg-gray-600 rounded transition-colors"
                                title={status === 'todo' ? 'Iniciar' : 'Concluir'}
                              >
                                <Check size={18} />
                              </button>
                            )}
                            {status !== 'todo' && (
                              <button
                                onClick={() => updateTopicStatus(topic.id, status === 'inProgress' ? 'todo' : 'inProgress')}
                                className="p-2 text-yellow-400 hover:bg-gray-600 rounded transition-colors"
                                title="Voltar"
                              >
                                <X size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => editTopic(topic)}
                              className="p-2 text-blue-400 hover:bg-gray-600 rounded transition-colors"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => deleteTopic(topic.id)}
                              className="p-2 text-red-400 hover:bg-gray-600 rounded transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Analytics Tab - mantém o mesmo */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Weekly Chart */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-bold mb-4">📊 Últimos 7 Dias</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={getLast7DaysData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#F3F4F6' }}
                  />
                  <Legend />
                  <Bar dataKey="horas" fill="#8B5CF6" name="Horas" />
                  <Bar dataKey="exercícios" fill="#10B981" name="Exercícios" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Topic Distribution */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-bold mb-4">📖 Distribuição por Tópico</h2>
              {getTopicDistribution().length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getTopicDistribution()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({name, value}) => `${name}: ${value}h`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getTopicDistribution().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Sem dados para exibir
                </div>
              )}
            </div>

            {/* Heatmap */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-bold mb-4">🔥 Mapa de Atividade (Últimos 90 dias)</h2>
              <div className="overflow-x-auto">
                <div className="inline-grid grid-flow-col gap-1" style={{gridTemplateRows: 'repeat(7, 1fr)'}}>
                  {getHeatmapData().map((day, index) => {
                    const intensityColors = ['#1F2937', '#1e3a5f', '#1e4d7f', '#1e5f9f', '#1e72bf'];
                    return (
                      <div
                        key={index}
                        className="w-3 h-3 rounded-sm"
                        style={{backgroundColor: intensityColors[day.intensity]}}
                        title={`${day.date}: ${day.intensity > 0 ? 'Estudou' : 'Sem estudo'}`}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 text-sm text-gray-400">
                <span>Menos</span>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className="w-3 h-3 rounded-sm"
                      style={{backgroundColor: ['#1F2937', '#1e3a5f', '#1e4d7f', '#1e5f9f', '#1e72bf'][i]}}
                    />
                  ))}
                </div>
                <span>Mais</span>
              </div>
            </div>

            {/* Export Button */}
            <button
              onClick={generatePDFReport}
              className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Download size={20} />
              Exportar Relatório Completo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
