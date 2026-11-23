import React, { useState } from 'react';
import {
  Ban,
  Clock,
  LogOut,
  MessageCircle,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { BrandWordmark } from './BrandLogo';
import { SupportChatPanel } from './SupportChatPanel';

export function SuspendedAccountView() {
  const { userProfile, suspensionExpiryLabel, logoutUser } = useApp();
  const [showChat, setShowChat] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="h-14 sm:h-16 bg-white/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between">
        <BrandWordmark compact />
        <button
          type="button"
          onClick={() => void logoutUser()}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          <span>ログアウト</span>
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <Ban className="w-8 h-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              アカウントが停止されました
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              現在このアカウント（{userProfile?.username || 'ユーザー'}）は利用停止措置が適用されているため、CRANE MANUALの全機能をご利用いただけません。
            </p>
          </div>

          {(suspensionExpiryLabel || userProfile?.suspensionReason) && (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 text-xs sm:text-sm">
              {suspensionExpiryLabel && (
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Clock className="w-4 h-4 text-blue-700 dark:text-sky-400 shrink-0" />
                  <span>
                    停止期間: <strong className="font-mono-num">{suspensionExpiryLabel}</strong>
                  </span>
                </div>
              )}
              {userProfile?.suspensionReason && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    理由・ご案内
                  </p>
                  <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {userProfile.suspensionReason}
                  </p>
                </div>
              )}
            </div>
          )}

          {!showChat ? (
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowChat(true)}
                className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>お問い合わせ（チャット）</span>
              </button>
              <button
                type="button"
                onClick={() => void logoutUser()}
                className="flex-1 min-h-[48px] px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>ログアウト</span>
              </button>
            </div>
          ) : (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-blue-700 dark:text-sky-400" />
                  <span>サポートチャット</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setShowChat(false)}
                  aria-label="チャットを閉じる"
                  className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <SupportChatPanel defaultSubject="アカウント停止に関するお問い合わせ" />
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-5">
        <div className="text-center text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400">
          CRANE MANUAL
        </div>
      </footer>
    </div>
  );
}
