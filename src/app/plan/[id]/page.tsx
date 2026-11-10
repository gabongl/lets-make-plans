'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Calendar as CalendarIcon,
  Users,
  Share2,
  Check,
  Clock,
  ChevronLeft,
  Sparkles,
  AlertCircle,
  Copy,
  Info,
  Layers,
  CheckCircle2,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Meeting, ParticipantResponse, DateSelection, AvailabilityType } from '@/types';
import {
  generateMonthsInRange,
  aggregateMeetingResponses,
  getBestMatchDates,
  CalendarDay,
  MonthCalendar,
} from '@/lib/dateUtils';

export default function PlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [responses, setResponses] = useState<ParticipantResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab: 'VOTE' (내 일정 입력) vs 'RESULTS' (전체 결과 캘린더)
  const [activeTab, setActiveTab] = useState<'VOTE' | 'RESULTS'>('VOTE');

  // Participant Input state
  const [participantName, setParticipantName] = useState('');
  const [mySelections, setMySelections] = useState<Record<string, DateSelection>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Conditional time modal state
  const [conditionalModalDate, setConditionalModalDate] = useState<string | null>(null);
  const [conditionalNote, setConditionalNote] = useState('19:00 이후 가능');

  // Selected date for viewing details in Results tab
  const [inspectDate, setInspectDate] = useState<string | null>(null);

  // Share state
  const [copiedLink, setCopiedLink] = useState(false);

  // Confetti celebration modal state
  const [showCelebration, setShowCelebration] = useState(false);

  // Fetch meeting data
  const fetchData = async () => {
    try {
      const res = await fetch(`/api/meetings/${id}`);
      const data = await res.json();
      if (data.success && data.meeting) {
        setMeeting(data.meeting);
        setResponses(data.meeting.responses || []);

        // Load previously entered name from localStorage if exists
        const savedName = localStorage.getItem(`plan_name_${id}`);
        if (savedName) {
          setParticipantName(savedName);
          // find user's previous selection
          const prev = data.meeting.responses?.find((r: any) => r.participantName === savedName);
          if (prev) {
            setMySelections(prev.selections || {});
            setHasSubmitted(true);
          }
        }
      } else {
        setError(data.error || '모임 정보를 불러올 수 없습니다.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  // Calendar month structure
  const monthsData = useMemo<MonthCalendar[]>(() => {
    if (!meeting) return [];
    return generateMonthsInRange(meeting.startDate, meeting.endDate);
  }, [meeting]);

  // Aggregated results
  const aggregatedResults = useMemo(() => {
    if (!meeting) return {};
    return aggregateMeetingResponses(meeting, responses);
  }, [meeting, responses]);

  // Best match dates
  const bestMatches = useMemo(() => {
    return getBestMatchDates(aggregatedResults, responses.length);
  }, [aggregatedResults, responses.length]);

  // Check if all targeted or at least 2 participants have responded and there is a match
  useEffect(() => {
    if (!meeting || responses.length === 0) return;
    const isTargetMet = responses.length >= meeting.targetCount;
    const hasFullMatch = bestMatches.some((m) => m.isFullMatch);

    if (isTargetMet && hasFullMatch && activeTab === 'RESULTS') {
      setShowCelebration(true);
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [meeting, responses.length, bestMatches, activeTab]);

  // Toggle date in voting mode
  const handleDayClickInVote = (dateStr: string) => {
    const current = mySelections[dateStr];
    if (!current) {
      // First click: ALL_DAY
      setMySelections((prev) => ({
        ...prev,
        [dateStr]: { date: dateStr, type: 'ALL_DAY' },
      }));
    } else if (current.type === 'ALL_DAY') {
      // Second click: open conditional modal
      setConditionalModalDate(dateStr);
      setConditionalNote('19:00 이후 가능');
    } else {
      // Third click: toggle off
      setMySelections((prev) => {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
    }
  };

  // Save conditional note
  const handleSaveConditional = () => {
    if (!conditionalModalDate) return;
    setMySelections((prev) => ({
      ...prev,
      [conditionalModalDate]: {
        date: conditionalModalDate,
        type: 'CONDITIONAL',
        note: conditionalNote.trim() || '시간 협의 가능',
      },
    }));
    setConditionalModalDate(null);
  };

  // Submit response
  const handleSubmitResponse = async () => {
    if (!participantName.trim()) {
      alert('참여자 닉네임을 입력해주세요!');
      return;
    }
    const selectedCount = Object.keys(mySelections).length;
    if (selectedCount === 0) {
      alert('가능한 날짜를 최소 하루 이상 캘린더에서 터치해 주세요!');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/meetings/${id}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantName: participantName.trim(),
          selections: mySelections,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setHasSubmitted(true);
        localStorage.setItem(`plan_name_${id}`, participantName.trim());
        setResponses(data.allResponses || []);
        setActiveTab('RESULTS');
        alert('🎉 일정이 성공적으로 등록되었습니다! 전체 결과를 확인해보세요.');
      } else {
        alert(data.error || '제출 중 오류가 발생했습니다.');
      }
    } catch {
      alert('서버와 통신할 수 없습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyAnnouncement = (dateStr: string) => {
    if (!meeting) return;
    const text = `[Let's make plans! 🎉 확정 안내]\n"${meeting.title}" 약속 날짜가 확정되었습니다!\n\n📅 확정일: ${dateStr}\n참여 인원: ${responses.map((r) => r.participantName).join(', ')}\n\n모두 늦지 않게 만나요! 🍻`;
    navigator.clipboard.writeText(text);
    alert('카카오톡 공유 공지 문구가 복사되었습니다!');
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <span className="text-4xl animate-bounce">🐿️</span>
        <p className="text-sm font-bold text-slate-700 mt-3">약속방 데이터를 불러오는 중...</p>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-2" />
        <h2 className="text-base font-bold text-slate-800">오류가 발생했습니다</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">{error}</p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl"
        >
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  const selectedCount = Object.keys(mySelections).length;

  return (
    <div className="flex-1 flex flex-col pb-24">
      {/* Top Navigation */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-md z-30 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push('/')}
          className="p-1.5 -ml-1.5 hover:bg-slate-100 rounded-xl transition text-slate-600"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-xs font-extrabold text-slate-800 truncate max-w-[200px]">
          {meeting.title}
        </span>
        <button
          onClick={handleCopyLink}
          className="p-1.5 -mr-1.5 hover:bg-slate-100 rounded-xl transition text-blue-600 flex items-center gap-1 text-xs font-bold"
        >
          {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
          <span className="text-[11px]">{copiedLink ? '복사됨' : '공유'}</span>
        </button>
      </header>

      {/* Meeting Brief Header Banner */}
      <div className="bg-slate-50 border-b border-slate-200 p-4">
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-100 text-blue-700 mb-1">
              주관자: {meeting.hostName}
            </span>
            <h1 className="text-lg font-black text-slate-900 leading-tight">{meeting.title}</h1>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {meeting.startDate} ~ {meeting.endDate}
              </span>
            </p>
            {meeting.description && (
              <p className="text-xs text-slate-600 mt-1.5 bg-white p-2 rounded-lg border border-slate-200">
                💬 {meeting.description}
              </p>
            )}
          </div>
        </div>

        {/* Participation Progress Counter */}
        <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">
              참여 완료: {responses.length} / {meeting.targetCount}명
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            {responses.map((r) => (
              <span
                key={r.participantName}
                className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium text-slate-700"
              >
                {r.participantName}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="p-3 bg-white border-b border-slate-200 sticky top-[53px] z-20">
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
          <button
            onClick={() => setActiveTab('VOTE')}
            className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'VOTE'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>내 일정 선택 {selectedCount > 0 && `(${selectedCount})`}</span>
          </button>
          <button
            onClick={() => setActiveTab('RESULTS')}
            className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'RESULTS'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>전체 결과 캘린더</span>
            {responses.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: Participant Voting Mode */}
      {activeTab === 'VOTE' && (
        <div className="p-4 flex-1">
          {/* Participant Name Input */}
          <div className="mb-4 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              내 닉네임 (이름) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="예: 김철수, Smart Lee"
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              💡 팁: 날짜를 1번 누르면 <span className="text-emerald-600 font-bold">종일 가능</span>, 2번
              누르면 <span className="text-amber-600 font-bold">시간대(조건부)</span> 설정이 열립니다.
            </p>
          </div>

          {/* Touch Legend */}
          <div className="flex items-center justify-around mb-4 py-2 px-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-semibold text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-emerald-500" />
              <span>종일 가능</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-amber-500" />
              <span>몇시 이후(조건부)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-slate-200" />
              <span>불가(미선택)</span>
            </div>
          </div>

          {/* Multi-month Continuous Calendar Grid */}
          <div className="space-y-6">
            {monthsData.map((month) => (
              <div key={month.monthLabel} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-900 mb-3">{month.monthLabel}</h3>

                {/* Weekday Header */}
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['일', '월', '화', '수', '목', '금', '토'].map((w, idx) => (
                    <span
                      key={w}
                      className={`text-[11px] font-bold ${
                        idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-400'
                      }`}
                    >
                      {w}
                    </span>
                  ))}
                </div>

                {/* Calendar Days Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {month.days.map((day, idx) => {
                    const sel = mySelections[day.dateStr];
                    const isSelectable = day.isInRange && day.isCurrentMonth;

                    let bgClass = 'bg-slate-50 text-slate-300 cursor-not-allowed';
                    if (isSelectable) {
                      if (sel?.type === 'ALL_DAY') {
                        bgClass = 'bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/30 scale-95';
                      } else if (sel?.type === 'CONDITIONAL') {
                        bgClass = 'bg-amber-500 text-white font-bold shadow-md shadow-amber-500/30 scale-95';
                      } else {
                        bgClass = 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 active:scale-95';
                      }
                    }

                    return (
                      <div
                        key={idx}
                        onClick={() => isSelectable && handleDayClickInVote(day.dateStr)}
                        className={`h-12 rounded-xl flex flex-col items-center justify-center relative select-none transition-all duration-150 ${bgClass}`}
                      >
                        <span className="text-xs">{day.dayNumber}</span>
                        {sel?.type === 'ALL_DAY' && (
                          <Check className="w-3 h-3 text-white mt-0.5" />
                        )}
                        {sel?.type === 'CONDITIONAL' && (
                          <span className="text-[9px] text-amber-100 font-medium truncate max-w-[42px] px-0.5">
                            {sel.note?.replace(' 가능', '') || '조건'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Aggregated Results & Heatmap */}
      {activeTab === 'RESULTS' && (
        <div className="p-4 flex-1">
          {/* Top Recommendation Banner if any full match */}
          {bestMatches.length > 0 && (
            <div className="mb-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-emerald-800 mb-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black">가장 많은 인원이 모일 수 있는 날</h3>
              </div>
              <div className="space-y-1.5">
                {bestMatches.slice(0, 3).map((match, i) => (
                  <div
                    key={match.date}
                    onClick={() => setInspectDate(match.date)}
                    className="p-2.5 bg-white/90 hover:bg-white rounded-xl border border-emerald-200/80 flex items-center justify-between cursor-pointer transition"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-slate-900">{match.date}</span>
                        {match.isFullMatch && (
                          <span className="px-1.5 py-0.5 bg-emerald-600 text-white text-[9px] font-black rounded-md">
                            전원 가능!
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {match.totalAvailableCount}명 가능 (종일 {match.allDayCount}명
                        {match.conditionalCount > 0 && `, 조건부 ${match.conditionalCount}명`})
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyAnnouncement(match.date);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
                    >
                      확정 공지
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results Heatmap Legend */}
          <div className="flex items-center justify-around mb-4 py-2 px-3 bg-slate-50 rounded-xl border border-slate-200 text-[10px] font-semibold text-slate-600">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-500" />
              <span>전원 가능</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-blue-300" />
              <span>과반수</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-amber-400" />
              <span>조건부 포함</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300" />
              <span>불가</span>
            </div>
          </div>

          {/* Multi-month Heatmap Calendar */}
          <div className="space-y-6">
            {monthsData.map((month) => (
              <div key={month.monthLabel} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-900 mb-3">{month.monthLabel}</h3>

                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['일', '월', '화', '수', '목', '금', '토'].map((w, idx) => (
                    <span
                      key={w}
                      className={`text-[11px] font-bold ${
                        idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-400'
                      }`}
                    >
                      {w}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {month.days.map((day, idx) => {
                    const agg = aggregatedResults[day.dateStr];
                    const isSelectable = day.isInRange && day.isCurrentMonth;
                    const totalResp = responses.length;

                    let bgClass = 'bg-slate-50 text-slate-300';
                    let extraGlow = '';

                    if (isSelectable && agg) {
                      if (agg.isFullMatch && totalResp > 0) {
                        bgClass = 'bg-emerald-500 text-white font-bold cursor-pointer';
                        extraGlow = 'glow-full-match';
                      } else if (agg.totalAvailableCount > 0 && agg.totalAvailableCount >= Math.ceil(totalResp / 2)) {
                        bgClass = 'bg-blue-100 text-blue-900 font-semibold cursor-pointer border border-blue-300';
                      } else if (agg.conditionalCount > 0) {
                        bgClass = 'bg-amber-100 text-amber-900 font-semibold cursor-pointer border border-amber-300';
                      } else {
                        bgClass = 'bg-white text-slate-600 border border-slate-200 cursor-pointer';
                      }
                    }

                    return (
                      <div
                        key={idx}
                        onClick={() => isSelectable && setInspectDate(day.dateStr)}
                        className={`h-12 rounded-xl flex flex-col items-center justify-center relative select-none transition ${bgClass} ${extraGlow}`}
                      >
                        <span className="text-xs">{day.dayNumber}</span>
                        {isSelectable && agg && agg.totalAvailableCount > 0 && (
                          <span
                            className={`text-[9px] font-bold mt-0.5 px-1 rounded ${
                              agg.isFullMatch ? 'bg-emerald-700 text-white' : 'text-slate-600'
                            }`}
                          >
                            {agg.totalAvailableCount}/{totalResp}명
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Inspect Date Bottom Card */}
          {inspectDate && (
            <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
              <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-slate-200 animate-in slide-in-from-bottom duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">{inspectDate} 참여 현황</h4>
                    <p className="text-xs text-slate-500">
                      총 {aggregatedResults[inspectDate]?.totalAvailableCount || 0}명 가능
                    </p>
                  </div>
                  <button
                    onClick={() => setInspectDate(null)}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                  {responses.map((r) => {
                    const sel = r.selections[inspectDate];
                    return (
                      <div
                        key={r.participantName}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-50 text-xs"
                      >
                        <span className="font-bold text-slate-800">{r.participantName}</span>
                        {sel?.type === 'ALL_DAY' && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-md">
                            종일 가능 🟢
                          </span>
                        )}
                        {sel?.type === 'CONDITIONAL' && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-md">
                            {sel.note || '조건부 가능'} 🟠
                          </span>
                        )}
                        {(!sel || sel.type === 'UNAVAILABLE') && (
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-600 font-medium rounded-md">
                            불가능 ❌
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => handleCopyAnnouncement(inspectDate)}
                  className="w-full mt-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition"
                >
                  이 날짜로 카톡 공지 문구 복사
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Action Bar (in VOTE tab) */}
      {activeTab === 'VOTE' && (
        <div className="fixed bottom-0 inset-x-0 z-30 flex justify-center p-4 bg-gradient-to-t from-white via-white/95 to-transparent">
          <div className="w-full max-w-md">
            <button
              onClick={handleSubmitResponse}
              disabled={isSubmitting}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-extrabold rounded-2xl shadow-xl shadow-blue-500/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="text-sm">일정 저장 중...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">
                    {hasSubmitted ? '내 일정 수정하여 다시 제출' : '내 가능 일정 확정 제출하기'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Conditional Time Setting Bottom Sheet Modal */}
      {conditionalModalDate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-slate-100 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <h4 className="text-sm font-extrabold text-slate-900">
                  {conditionalModalDate} 조건부 시간 설정
                </h4>
              </div>
              <button
                onClick={() => setConditionalModalDate(null)}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              가능한 시간대나 사유를 선택하거나 직접 입력하세요.
            </p>

            {/* Quick Presets */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                '18:00 이후 가능',
                '19:00 이후 가능',
                '20:00 이후 가능',
                '점심/낮 시간만 가능',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setConditionalNote(preset)}
                  className={`p-2 text-xs font-bold rounded-xl border transition text-left ${
                    conditionalNote === preset
                      ? 'bg-amber-500 text-white border-amber-600'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="mt-3">
              <input
                type="text"
                placeholder="직접 입력: 예) 애들 재우고 8시 반부터 가능"
                value={conditionalNote}
                onChange={(e) => setConditionalNote(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Confirm buttons */}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConditionalModalDate(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveConditional}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-md shadow-amber-500/20"
              >
                조건부 가능 적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎉 All Responded Full Match Celebration Popup */}
      {showCelebration && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-emerald-200 text-center animate-in zoom-in duration-200">
            <span className="text-5xl">🎊</span>
            <h3 className="text-lg font-black text-slate-900 mt-2">
              전원 참석 가능한 날을 찾았습니다!
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              목표 인원 {responses.length}명 모두가 가능한 황금 약속일입니다.
            </p>

            <div className="my-4 space-y-2">
              {bestMatches.slice(0, 2).map((item, idx) => (
                <div
                  key={item.date}
                  className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900">
                      {idx === 0 ? '🥇 1순위 추천일' : '🥈 2순위 추천일'}
                    </span>
                    <span className="text-xs font-extrabold text-emerald-700">{item.date}</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 mt-1">
                    전원 가능 (종일 {item.allDayCount}명
                    {item.conditionalCount > 0 && `, 조건부 ${item.conditionalCount}명`})
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleCopyAnnouncement(bestMatches[0]?.date || '')}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-emerald-600/30 transition"
              >
                카톡 단톡방에 최종 확정 공지 복사
              </button>
              <button
                onClick={() => setShowCelebration(false)}
                className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                캘린더 자세히 보기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

