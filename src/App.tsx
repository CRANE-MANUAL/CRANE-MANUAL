/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Award,
  Bookmark,
  Home,
  LogIn,
  Plus,
  Search,
  User,
  X,
} from 'lucide-react';
import { AppProvider, useApp } from './contexts/AppContext';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AuthModal } from './components/AuthModal';
import { BrandWordmark } from './components/BrandLogo';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FavoritesView } from './components/FavoritesView';
import { HomeView } from './components/HomeView';
import { MyPageView } from './components/MyPageView';
import { PostDetailView } from './components/PostDetailView';
import { PostFormModal } from './components/PostFormModal';
import { RecommendedView } from './components/RecommendedView';
import { SearchView } from './components/SearchView';
import { SuspendedAccountView } from './components/SuspendedAccountView';
import { NavTab } from './types';

function MainLayout() {
  const {
    authUser,
    isAdmin,
    needsEmailVerification,
    isFullySuspended,
    activeTab,
    setActiveTab,
    selectedPostId,
    showAdminView,
    openCreatePost,
    setShowAuthModal,
    unreadNotificationCount,
    toasts,
    dismissToast,
  } = useApp();

  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'home', label: 'ホーム', icon: Home },
    { id: 'search', label: '検索', icon: Search },
    { id: 'recommended', label: 'おすすめ設定', icon: Award },
    { id: 'favorites', label: 'お気に入り', icon: Bookmark },
    {
      id: 'mypage',
      label: 'マイページ',
      icon: User,
      badge: unreadNotificationCount,
    },
  ];

  const isLoggedInVerified = Boolean(authUser && !needsEmailVerification);

  if (isFullySuspended) {
    return (
      <>
        <SuspendedAccountView />
        {toasts.length > 0 && (
          <div className="fixed top-18 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-auto pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto rounded-2xl px-4 py-3 text-xs sm:text-sm font-semibold shadow-lg border flex items-center justify-between gap-3 ${
                  t.variant === 'error'
                    ? 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-200 dark:border-red-900'
                    : t.variant === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900'
                      : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                }`}
              >
                <span>{t.text}</span>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  aria-label="通知を閉じる"
                  className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Bar (Strict 3-Zone Contract on Desktop, Compact on Mobile) */}
      <header className="sticky top-0 z-30 h-12 sm:h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="focus-visible:outline-2 focus-visible:outline-blue-600 rounded-lg"
          >
            <BrandWordmark compact />
          </button>

          {/* Zone 2: Desktop Navigation Links (5 items, single-line) */}
          <nav
            aria-label="メインナビゲーション"
            className="hidden md:flex items-center gap-6 text-sm font-semibold"
          >
            {navItems.map((item) => {
              const active = !selectedPostId && !showAdminView && activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    active
                      ? 'text-blue-700 dark:text-sky-400 border-blue-700 dark:border-sky-400'
                      : 'text-slate-600 dark:text-slate-300 border-transparent hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                  {item.badge ? ` (${item.badge})` : ''}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            {isLoggedInVerified ? (
              <button
                type="button"
                onClick={openCreatePost}
                className="min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>投稿する</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className="min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>ログイン</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 pb-20 md:pb-12">
        {showAdminView && isAdmin ? (
          <AdminDashboardView />
        ) : selectedPostId ? (
          <PostDetailView postId={selectedPostId} />
        ) : (
          <>
            {activeTab === 'home' && <HomeView />}
            {activeTab === 'search' && <SearchView />}
            {activeTab === 'recommended' && <RecommendedView />}
            {activeTab === 'favorites' && <FavoritesView />}
            {activeTab === 'mypage' && <MyPageView />}
          </>
        )}
      </main>

      {/* Footer: displays strictly CRANE MANUAL as specified */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 pb-20 md:pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400">
          CRANE MANUAL
        </div>
      </footer>

      {/* Mobile Fixed Bottom Navigation (5 Destinations) */}
      <nav
        aria-label="モバイル下部ナビゲーション"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-5 h-14 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = !selectedPostId && !showAdminView && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`h-full flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
                  active
                    ? 'text-blue-700 dark:text-sky-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {Boolean(item.badge && item.badge > 0) && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center font-mono-num">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      <AuthModal />
      <PostFormModal />

      {/* Toast Stack */}
      {toasts.length > 0 && (
        <div className="fixed top-18 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-auto pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-2xl px-4 py-3 text-xs sm:text-sm font-semibold shadow-lg border flex items-center justify-between gap-3 ${
                t.variant === 'error'
                  ? 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-200 dark:border-red-900'
                  : t.variant === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900'
                    : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
              }`}
            >
              <span>{t.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="通知を閉じる"
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </ErrorBoundary>
  );
}
