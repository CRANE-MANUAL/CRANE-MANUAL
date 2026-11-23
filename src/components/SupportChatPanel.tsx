import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  MessageSquarePlus,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  createInquiry,
  sendInquiryMessage,
  subscribeInquiryMessages,
  subscribeUserInquiries,
} from '../lib/firestoreService';
import { Inquiry, InquiryMessage, VALIDATION_LIMITS } from '../types';

function formatShortTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

interface SupportChatPanelProps {
  defaultSubject?: string;
}

export function SupportChatPanel({ defaultSubject = '' }: SupportChatPanelProps) {
  const { authUser, userProfile, needsEmailVerification, setShowAuthModal, showToast } = useApp();

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const [subject, setSubject] = useState(defaultSubject);
  const [firstMessage, setFirstMessage] = useState('');
  const [submittingNew, setSubmittingNew] = useState(false);

  const [messages, setMessages] = useState<InquiryMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!authUser || needsEmailVerification) {
      setInquiries([]);
      return;
    }
    const unsub = subscribeUserInquiries(authUser.uid, (items) => {
      setInquiries(items);
      setSelectedInquiryId((prev) => {
        if (prev && items.some((i) => i.inquiryId === prev)) return prev;
        return items.length > 0 ? items[0].inquiryId : null;
      });
    });
    return () => unsub();
  }, [authUser, needsEmailVerification]);

  const activeInquiry =
    inquiries.find((i) => i.inquiryId === selectedInquiryId) || null;

  useEffect(() => {
    if (!authUser || !activeInquiry) {
      setMessages([]);
      return;
    }
    const unsub = subscribeInquiryMessages(
      activeInquiry.inquiryId,
      authUser.uid,
      false,
      (msgs) => {
        setMessages(msgs);
      },
    );
    return () => unsub();
  }, [authUser, activeInquiry?.inquiryId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!authUser || needsEmailVerification) {
    return (
      <div className="space-y-4 py-4 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          チャット形式のお問い合わせをご利用いただくには、ログインおよびメール認証が必要です。
        </p>
        <button
          type="button"
          onClick={() => setShowAuthModal(true)}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
        >
          ログイン / メール認証へ進む
        </button>
      </div>
    );
  }

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !firstMessage.trim()) {
      showToast('件名とメッセージを入力してください。', 'error');
      return;
    }
    setSubmittingNew(true);
    try {
      const newId = await createInquiry({
        userId: authUser.uid,
        email: authUser.email || userProfile?.email || 'unknown@example.com',
        subject: subject.trim(),
        message: firstMessage.trim(),
      });
      setSubject(defaultSubject);
      setFirstMessage('');
      setCreatingNew(false);
      setSelectedInquiryId(newId);
      showToast('お問い合わせチャットを開始しました。', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '送信に失敗しました。', 'error');
    } finally {
      setSubmittingNew(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInquiry || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await sendInquiryMessage({
        inquiryId: activeInquiry.inquiryId,
        inquiryOwnerId: authUser.uid,
        senderId: authUser.uid,
        senderRole: 'user',
        body: replyText.trim(),
      });
      setReplyText('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'メッセージ送信に失敗しました。', 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const showNewForm = creatingNew || inquiries.length === 0;

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {inquiries.length > 0 && !showNewForm ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <select
              aria-label="お問い合わせスレッドを選択"
              value={selectedInquiryId || ''}
              onChange={(e) => setSelectedInquiryId(e.target.value)}
              className="flex-1 min-w-0 min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
              {inquiries.map((inq) => (
                <option key={inq.inquiryId} value={inq.inquiryId}>
                  [{inq.status === 'open' ? '対応中' : '完了'}] {inq.subject}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>新規相談</span>
            </button>
          </div>
        ) : inquiries.length > 0 && showNewForm ? (
          <button
            type="button"
            onClick={() => setCreatingNew(false)}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>チャット履歴に戻る</span>
          </button>
        ) : null}
      </div>

      {showNewForm ? (
        <form onSubmit={(e) => void handleCreateThread(e)} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              件名
            </label>
            <input
              type="text"
              required
              maxLength={VALIDATION_LIMITS.inquirySubjectMax}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="例：アカウント制限について、不具合の報告"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              メッセージ
            </label>
            <textarea
              rows={4}
              required
              maxLength={VALIDATION_LIMITS.inquiryMessageMax}
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="お問い合わせ内容をご記入ください。サポートからチャット上で返信いたします。"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submittingNew}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              <span>{submittingNew ? '送信中...' : 'チャットを開始する'}</span>
            </button>
          </div>
        </form>
      ) : activeInquiry ? (
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950">
          {/* Thread Status Bar */}
          <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {activeInquiry.subject}
            </p>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg shrink-0 ${
                activeInquiry.status === 'open'
                  ? 'bg-sky-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              {activeInquiry.status === 'open' ? '対応中' : '完了'}
            </span>
          </div>

          {/* Messages Stream */}
          <div className="p-4 space-y-3 max-h-[320px] min-h-[200px] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 bg-blue-700 text-white text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                  {activeInquiry.message}
                  <div className="text-[10px] text-sky-200 mt-1 text-right font-mono-num">
                    {formatShortTime(activeInquiry.createdAt)}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.senderRole === 'user';
                return (
                  <div
                    key={m.messageId}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    {!isUser && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-sky-400 mb-1 px-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>CRANE MANUAL サポート</span>
                      </span>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'rounded-tr-sm bg-blue-700 text-white'
                          : 'rounded-tl-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {m.body}
                      <div
                        className={`text-[10px] mt-1 font-mono-num ${
                          isUser ? 'text-sky-200 text-right' : 'text-slate-400'
                        }`}
                      >
                        {formatShortTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Reply Composer */}
          {activeInquiry.status === 'open' ? (
            <form
              onSubmit={(e) => void handleSendReply(e)}
              className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-end gap-2"
            >
              <textarea
                rows={2}
                maxLength={VALIDATION_LIMITS.inquiryMessageMax}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="メッセージを入力..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                aria-label="送信"
                className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">送信</span>
              </button>
            </form>
          ) : (
            <div className="px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              このお問い合わせは完了しました。新しく質問がある場合は「新規相談」を押してください。
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
