'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Users, Share2, Copy, Check, Sparkles, Clock, ArrowRight, Bookmark } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  // Form states
  const todayStr = formatDate(new Date());
  const fourWeeksLater = new Date();
  fourWeeksLater.setDate(fourWeeksLater.getDate() + 25);
  const defaultEndStr = formatDate(fourWeeksLater);

  const [title, setTitle] = useState('');
  const [hostName, setHostName] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(defaultEndStr);
  const [targetCount, setTargetCount] = useState(4);
  const [description, setDescription] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState<any | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedKakao, setCopiedKakao] = useState(false);

  // Recent meetings
  const [recentPlans, setRecentPlans] = useState<any[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lets_make_plans_recents');
      if (saved) {
        setRecentPlans(JSON.parse(saved));
      }
    } catch { }
  }, []);

  // Quick presets for dates
  const handlePreset = (type: 'this_month' | 'next_month' | 'year_end') => {
    const now = new Date();
    setStartDate(formatDate(now));

    if (type === 'this_month') {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setEndDate(formatDate(lastDay));
    } else if (type === 'next_month') {
      const nextMonthLast = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      setEndDate(formatDate(nextMonthLast));
    } else if (type === 'year_end') {
      const yearEnd = new Date(now.getFullYear(), 11, 31);
      setEndDate(formatDate(yearEnd));
    }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !hostName.trim()) {
      alert('모임 이름과 주관자 이름을 입력해주세요!');
      return;
    }
    if (startDate > endDate) {
      alert('종료일은 시작일 이후여야 합니다.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          hostName,
          startDate,
          endDate,
          targetCount,
          description,
        }),
      });
      const data = await res.json();
      if (data.success && data.meeting) {
        setCreatedMeeting(data.meeting);

        // Save to recents
        const updated = [
          {
            id: data.meeting.id,
            title: data.meeting.title,
            hostName: data.meeting.hostName,
            startDate: data.meeting.startDate,
            endDate: data.meeting.endDate,
          },
          ...recentPlans.filter((p) => p.id !== data.meeting.id),
        ].slice(0, 5);
        setRecentPlans(updated);
        localStorage.setItem('lets_make_plans_recents', JSON.stringify(updated));
      } else {
        alert(data.error || '모임 생성 중 오류가 발생했습니다.');
      }
    } catch (err) {
      alert('서버와 통신할 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const getShareUrl = () => {
    if (!createdMeeting) return '';
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/plan/${createdMeeting.id}`;
    }
    return `/plan/${createdMeeting.id}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareUrl());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyKakaoText = () => {
    if (!createdMeeting) return;
    const text = `[Let's make plans! 📅]\n"${createdMeeting.title}" 약속 잡기 투표가 시작되었습니다!\n\n기간: ${createdMeeting.startDate} ~ ${createdMeeting.endDate}\n주관자: ${createdMeeting.hostName}\n\n아래 링크에 접속하여 투표하실 수 있습니다:\n${getShareUrl()}`;
    navigator.clipboard.writeText(text);
    setCopiedKakao(true);
    setTimeout(() => setCopiedKakao(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col p-5 pb-10">
      {/* Header */}
      <header className="pt-3 pb-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐿️</span>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Let's make plans!
          </h1>
        </div>
      </header>

      {/* Main Creation Card */}
      <div className="mt-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-800">새로운 모임 약속 만들기</h2>
        </div>

        <form onSubmit={handleCreateMeeting} className="space-y-4">
          {/* 모임명 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              모임 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="예: 고교 동창 송년회, 주말 맥주 한잔"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* 주관자 이름 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              주관자(본인) 닉네임 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="예: Smart Lee, 철수"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* 후보 기간 지정 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                후보 일정 기간 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handlePreset('this_month')}
                  className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-medium transition"
                >
                  이번달
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset('next_month')}
                  className="px-2 py-0.5 text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md font-medium transition"
                >
                  다음달까지
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset('year_end')}
                  className="px-2 py-0.5 text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-md font-medium transition"
                >
                  연말까지
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="block text-[10px] text-slate-400 mb-0.5">시작일</span>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 mb-0.5">종료일</span>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* 목표 인원수 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              예상 참석 인원수 (전원 완료 시 축하 팝업 발동)
            </label>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <input
                type="number"
                min="2"
                max="30"
                value={targetCount}
                onChange={(e) => setTargetCount(Math.max(2, parseInt(e.target.value) || 2))}
                className="w-20 px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold text-slate-800"
              />
              <span className="text-xs text-slate-500">명</span>
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              참고 메모 (선택)
            </label>
            <input
              type="text"
              placeholder="예: 장소는 강남 또는 종로 쪽 생각 중입니다!"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {isLoading ? (
              <span className="text-sm">약속방 생성 중...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span className="text-sm">약속방 생성 & 공유 링크 발급</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Recent Plans Card */}
      {recentPlans.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-1.5 mb-2.5 px-1">
            <Bookmark className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold text-slate-700">내가 참여/생성한 최근 약속</h3>
          </div>
          <div className="space-y-2">
            {recentPlans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => router.push(`/plan/${plan.id}`)}
                className="p-3 bg-white hover:bg-blue-50/50 active:scale-[0.99] border border-slate-200 rounded-xl flex items-center justify-between cursor-pointer transition"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{plan.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {plan.startDate} ~ {plan.endDate} · 주관자: {plan.hostName}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Creation Success Modal */}
      {createdMeeting && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="text-center mb-4">
              <span className="text-4xl">🎉</span>
              <h3 className="text-lg font-extrabold text-slate-900 mt-2">약속방이 생성되었습니다!</h3>
              <p className="text-xs text-slate-500 mt-1">
                링크를 복사해서 친구들에게 카톡으로 전달하세요.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 mb-4">
              <p className="text-xs font-bold text-slate-800 mb-0.5">{createdMeeting.title}</p>
              <p className="text-[11px] text-slate-500">
                후보 기간: {createdMeeting.startDate} ~ {createdMeeting.endDate}
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleCopyLink}
                className="w-full py-2.5 px-4 bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedLink ? '링크 복사 완료!' : '초대 링크 복사'}
              </button>

              <button
                onClick={handleCopyKakaoText}
                className="w-full py-2.5 px-4 bg-[#FEE500] text-[#191919] text-xs font-bold rounded-xl flex items-center justify-center gap-2 hover:brightness-95 transition"
              >
                {copiedKakao ? <Check className="w-4 h-4 text-emerald-700" /> : <Share2 className="w-4 h-4" />}
                {copiedKakao ? '카톡 문구 복사 완료!' : '카톡 공유 문구 복사'}
              </button>

              <button
                onClick={() => router.push(`/plan/${createdMeeting.id}`)}
                className="w-full py-2.5 px-4 bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition"
              >
                <span>내 일정 먼저 찍으러 가기</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <footer className="mt-auto pt-8 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-[11px] text-slate-500">
          <span>⚡ Lark Bitable DB & Vercel Serverless Ready</span>
        </div>
      </footer>
    </div>
  );
}

