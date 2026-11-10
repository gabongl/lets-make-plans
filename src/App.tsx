import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import {
  Calendar as CalendarIcon,
  Users,
  Share2,
  Copy,
  Check,
  Sparkles,
  Clock,
  ArrowRight,
  Bookmark,
  ChevronLeft,
  AlertCircle,
  Layers,
  CheckCircle2,
  X,
  UserCheck,
  RotateCcw,
  MapPin,
  Trash2,
  Send,
  Crown,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Key,
  Edit3,
  RefreshCw,
  Compass,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Meeting, ParticipantResponse, DateSelection, LocationVoteResult } from '@/types';
import {
  formatDate,
  parseDate,
  getAllDatesInRange,
  generateMonthsInRange,
  aggregateMeetingResponses,
  getBestMatchDates,
  addMinutesToTime,
  MonthCalendar,
} from '@/lib/dateUtils';
import { api } from '@/lib/api';

// ============================================================================
// 🔔 SLEEK TOAST NOTIFICATION SYSTEM
// ============================================================================
interface ToastMessage {
  id: number;
  text: string;
  type?: 'success' | 'info' | 'warning';
}

const ToastContext = createContext<(text: string, type?: 'success' | 'info' | 'warning') => void>(
  () => {}
);

export const useToast = () => useContext(ToastContext);

// 100% Guaranteed Clipboard Engine (모바일, PC, HTTP/LAN IP 환경 및 팝업 모달 내부 클립보드 완벽 호환)
async function copyToClipboardRobust(text: string): Promise<boolean> {
  let copied = false;

  // 1. 최신 navigator.clipboard 시도 (localhost 및 HTTPS 환경)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {}
  }

  // 2. HTTP LAN IP (192.168.x.x) 및 모달 내부용 고호환성 DOM 복사 엔진
  if (!copied && typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      // 화면 밖으로 멀리 보내지 않고(브라우저 복사 거부 방지), 화면 내 투명 오버레이로 최상위 배치
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = '0';
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      textArea.style.opacity = '0.01';
      textArea.style.zIndex = '999999'; // 모든 팝업 모달보다 위에 띄워 포커스 확보
      // readonly를 넣으면 iOS Safari 등에서 selection이 무시되므로 지정하지 않음
      document.body.appendChild(textArea);
      textArea.focus({ preventScroll: true });
      textArea.select();
      textArea.setSelectionRange(0, text.length);

      copied = document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch {
      copied = false;
    }
  }

  return copied;
}

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let devId = localStorage.getItem('lets_make_plans_device_id');
  if (!devId) {
    devId = 'dev-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('lets_make_plans_device_id', devId);
  }
  return devId;
}

function getCurrentRoute(): { planId: string | null; queryName: string | null; hostTokenQuery: string | null } {
  if (typeof window === 'undefined') return { planId: null, queryName: null, hostTokenQuery: null };

  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  const hashParams = hash.includes('?') ? new URLSearchParams(hash.split('?')[1]) : null;

  const queryName = params.get('name') || hashParams?.get('name') || null;
  const hostTokenQuery = params.get('host') || hashParams?.get('host') || null;

  const pathParts = window.location.pathname.split('/');
  const planIdx = pathParts.indexOf('plan');
  if (planIdx !== -1 && pathParts[planIdx + 1]) {
    return { planId: pathParts[planIdx + 1], queryName, hostTokenQuery };
  }

  if (hash.includes('/plan/')) {
    const rawId = hash.split('/plan/')[1].split('?')[0];
    return { planId: rawId, queryName, hostTokenQuery };
  }

  const planId = params.get('plan') || params.get('id');
  return { planId, queryName, hostTokenQuery };
}

export default function App() {
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [invitedName, setInvitedName] = useState<string | null>(null);
  const [hostTokenFromUrl, setHostTokenFromUrl] = useState<string | null>(null);
  const [autoOpenEdit, setAutoOpenEdit] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  };

  useEffect(() => {
    const handleUrlChange = () => {
      const { planId, queryName, hostTokenQuery } = getCurrentRoute();
      setCurrentPlanId(planId);
      if (queryName) setInvitedName(decodeURIComponent(queryName));
      if (hostTokenQuery) setHostTokenFromUrl(hostTokenQuery);
    };
    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  const navigateToPlan = (id: string, name?: string, autoEdit?: boolean) => {
    const query = name ? `?name=${encodeURIComponent(name)}` : '';
    window.history.pushState({}, '', `#/plan/${id}${query}`);
    setCurrentPlanId(id);
    if (name) setInvitedName(name);
    setAutoOpenEdit(!!autoEdit);
  };

  const navigateToHome = () => {
    window.history.pushState({}, '', '#/');
    setCurrentPlanId(null);
    setInvitedName(null);
    setHostTokenFromUrl(null);
    setAutoOpenEdit(false);
  };

  return (
    <ToastContext.Provider value={showToast}>
      <div className="w-full flex-1 flex flex-col bg-[#0b1329] text-slate-100 min-h-screen">
        <div className="fixed top-4 inset-x-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#162344]/95 backdrop-blur-md border border-[#2b3c5e] text-xs font-semibold text-slate-100 shadow-2xl shadow-black/60 animate-in slide-in-from-top-3 duration-200"
            >
              {toast.type === 'warning' ? (
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              ) : toast.type === 'info' ? (
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{toast.text}</span>
            </div>
          ))}
        </div>

        {currentPlanId ? (
          <PlanDetailView
            planId={currentPlanId}
            prefilledName={invitedName}
            urlHostToken={hostTokenFromUrl}
            initialOpenEdit={autoOpenEdit}
            onBack={navigateToHome}
          />
        ) : (
          <CreatePlanView onSelectPlan={navigateToPlan} />
        )}
      </div>
    </ToastContext.Provider>
  );
}

// ============================================================================
// 🗺️ MAP LOCATION MODAL (카카오맵 / 네이버 지도 / 구글 지도 무설치 딥링크)
// ============================================================================
function MapModal({
  location,
  onClose,
}: {
  location: string | null;
  onClose: () => void;
}) {
  if (!location) return null;

  const kakaoUrl = `https://map.kakao.com/link/search/${encodeURIComponent(location)}`;
  const naverUrl = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(location)}`;
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

  const handleOpen = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#101b33] w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-sky-500/40 text-left animate-in zoom-in duration-200 flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1f3056]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white truncate max-w-[200px]">
                {location}
              </h3>
              <p className="text-[11px] text-slate-400">위치 및 주변 맛집·출구 확인</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1a2b4f]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 안내 문구 */}
        <p className="text-xs text-slate-300 leading-relaxed">
          원하시는 지도 서비스를 선택하시면 <strong className="text-amber-300 font-bold">{location}</strong>의 상세 위치, 지하철 출구, 주변 맛집을 즉시 확인하실 수 있습니다.
        </p>

        {/* Map Links */}
        <div className="space-y-2.5">
          {/* 🟡 Kakao Map */}
          <button
            type="button"
            onClick={() => handleOpen(kakaoUrl)}
            className="w-full p-3 rounded-2xl bg-[#fee500]/10 hover:bg-[#fee500]/20 border border-[#fee500]/40 flex items-center justify-between transition group active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5 text-left">
              <span className="w-8 h-8 rounded-xl bg-[#fee500] text-black font-black text-xs flex items-center justify-center shadow-sm">
                카카오
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white group-hover:text-yellow-300">
                    카카오맵으로 확인
                  </span>
                  <span className="text-[9px] font-bold text-yellow-400 bg-yellow-950/60 px-1.5 py-0.2 rounded border border-yellow-500/30">
                    약속 장소 추천
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">지하철 출구, 길찾기, 로드뷰</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-yellow-300 flex-shrink-0" />
          </button>

          {/* 🟢 Naver Map */}
          <button
            type="button"
            onClick={() => handleOpen(naverUrl)}
            className="w-full p-3 rounded-2xl bg-[#03c75a]/10 hover:bg-[#03c75a]/20 border border-[#03c75a]/40 flex items-center justify-between transition group active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5 text-left">
              <span className="w-8 h-8 rounded-xl bg-[#03c75a] text-white font-black text-xs flex items-center justify-center shadow-sm">
                네이버
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white group-hover:text-emerald-300">
                    네이버 지도로 확인
                  </span>
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-500/30">
                    맛집 & 리뷰
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">플레이스 평점, 방문자 리뷰, 사진</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-300 flex-shrink-0" />
          </button>

          {/* 🔵 Google Maps */}
          <button
            type="button"
            onClick={() => handleOpen(googleUrl)}
            className="w-full p-3 rounded-2xl bg-[#4285f4]/10 hover:bg-[#4285f4]/20 border border-[#4285f4]/40 flex items-center justify-between transition group active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5 text-left">
              <span className="w-8 h-8 rounded-xl bg-[#4285f4] text-white font-black text-xs flex items-center justify-center shadow-sm">
                구글
              </span>
              <div>
                <span className="text-xs font-bold text-white group-hover:text-sky-300">
                  구글 지도로 확인
                </span>
                <p className="text-[10px] text-slate-400">글로벌 지도, 위성 뷰</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-sky-300 flex-shrink-0" />
          </button>
        </div>

        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-[#17223e] hover:bg-[#203056] text-slate-300 text-xs font-bold rounded-xl border border-[#283d6a] transition"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 📅 CANDIDATE DATE SELECTOR (후보 일정 내 특정 날짜 선택 및 제외 컴포넌트)
// ============================================================================
function CandidateDateSelector({
  startDate,
  endDate,
  selectedDates,
  onChange,
}: {
  startDate: string;
  endDate: string;
  selectedDates: string[];
  onChange: (dates: string[]) => void;
}) {
  const allDates = useMemo(() => getAllDatesInRange(startDate, endDate), [startDate, endDate]);
  const months = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return [];
    return generateMonthsInRange(startDate, endDate);
  }, [startDate, endDate]);
  const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  if (!startDate || !endDate || startDate > endDate) {
    return null;
  }

  // Quick Preset Handlers
  const handleSelectAll = () => {
    onChange([...allDates]);
  };

  const handleSelectFriSat = () => {
    const filtered = allDates.filter((d) => {
      const day = parseDate(d).getDay();
      return day === 5 || day === 6;
    });
    onChange(filtered);
  };

  const handleSelectWeekend = () => {
    const filtered = allDates.filter((d) => {
      const day = parseDate(d).getDay();
      return day === 0 || day === 5 || day === 6;
    });
    onChange(filtered);
  };

  const handleSelectWeekdays = () => {
    const filtered = allDates.filter((d) => {
      const day = parseDate(d).getDay();
      return day >= 1 && day <= 4;
    });
    onChange(filtered);
  };

  const handleClear = () => {
    onChange([]);
  };

  const toggleDate = (dateStr: string) => {
    if (selectedSet.has(dateStr)) {
      onChange(selectedDates.filter((d) => d !== dateStr));
    } else {
      const next = [...selectedDates, dateStr].sort();
      onChange(next);
    }
  };

  return (
    <div className="bg-[#0b1329] border border-[#203056] rounded-2xl p-3 space-y-2.5">
      {/* Header & Quick Presets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1c2944] pb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-xs font-bold text-white">후보 날짜 지정 (선택/제외)</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            전체 {allDates.length}일 중 <span className="text-sky-300 font-bold">{selectedDates.length}일</span> 후보 등록됨
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={handleSelectAll}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition border ${
              selectedDates.length === allDates.length
                ? 'bg-sky-600 text-white border-sky-400'
                : 'bg-[#14203d] text-slate-300 border-[#23355e] hover:bg-[#1a2b52]'
            }`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={handleSelectFriSat}
            className="px-2 py-0.5 text-[10px] font-bold bg-[#14203d] text-slate-300 hover:text-white rounded-lg border border-[#23355e] hover:bg-[#1a2b52] transition"
          >
            금·토
          </button>
          <button
            type="button"
            onClick={handleSelectWeekend}
            className="px-2 py-0.5 text-[10px] font-bold bg-[#14203d] text-slate-300 hover:text-white rounded-lg border border-[#23355e] hover:bg-[#1a2b52] transition"
          >
            금·토·일
          </button>
          <button
            type="button"
            onClick={handleSelectWeekdays}
            className="px-2 py-0.5 text-[10px] font-bold bg-[#14203d] text-slate-300 hover:text-white rounded-lg border border-[#23355e] hover:bg-[#1a2b52] transition"
          >
            평일
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-2 py-0.5 text-[10px] font-bold bg-[#14203d] text-rose-300 hover:text-rose-200 rounded-lg border border-[#23355e] hover:bg-rose-950/40 transition"
          >
            초기화
          </button>
        </div>
      </div>

      {/* Mini Interactive Calendar Grid */}
      <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
        {months.map((month) => (
          <div key={month.monthLabel} className="bg-[#101b33] rounded-xl p-2.5 border border-[#1b2a4a]">
            <div className="text-[11px] font-bold text-slate-200 mb-1.5 px-0.5">
              {month.monthLabel}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {['일', '월', '화', '수', '목', '금', '토'].map((w, idx) => (
                <span
                  key={w}
                  className={`text-[9px] font-bold ${
                    idx === 0 ? 'text-rose-400' : idx === 6 ? 'text-sky-400' : 'text-slate-500'
                  }`}
                >
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {month.days.map((day, dIdx) => {
                const inRange = day.isInRange && day.isCurrentMonth;
                const isSelected = selectedSet.has(day.dateStr);

                if (!inRange) {
                  return (
                    <div
                      key={dIdx}
                      className="h-8 rounded-lg flex items-center justify-center text-[10px] text-slate-700 bg-transparent opacity-20"
                    >
                      {day.dayNumber}
                    </div>
                  );
                }

                return (
                  <button
                    key={dIdx}
                    type="button"
                    onClick={() => toggleDate(day.dateStr)}
                    className={`h-8 rounded-lg flex flex-col items-center justify-center text-[10px] font-bold transition-all ${
                      isSelected
                        ? 'bg-sky-600 text-white border border-sky-400 shadow-sm shadow-sky-600/30'
                        : 'bg-[#090f20] text-slate-500 border border-[#1d2b4a] hover:border-slate-500 opacity-45'
                    }`}
                  >
                    <span className={isSelected ? 'text-white' : 'line-through text-slate-500'}>
                      {day.dayNumber}
                    </span>
                    <span className="text-[8px] font-normal leading-none -mt-0.5">
                      {isSelected ? '후보' : '제외'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedDates.length === 0 ? (
        <div className="p-2 bg-rose-950/40 border border-rose-500/40 rounded-lg text-[10px] text-rose-300 flex items-center gap-1.5 text-left">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>최소 1개 이상의 날짜를 터치하여 후보일로 지정해주세요.</span>
        </div>
      ) : (
        <p className="text-[10px] text-slate-400 text-left">
          💡 날짜를 터치하여 포함(파란색) 또는 제외(어둡게)할 수 있습니다.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// 1. CREATE PLAN VIEW
// ============================================================================
function CreatePlanView({
  onSelectPlan,
}: {
  onSelectPlan: (id: string, name?: string, autoEdit?: boolean) => void;
}) {
  const toast = useToast();
  const today = new Date();
  const todayStr = formatDate(today);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const defaultEndStr = formatDate(endOfMonth);

  const [title, setTitle] = useState('');
  const [hostName, setHostName] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(defaultEndStr);
  const [meetingTime, setMeetingTime] = useState('19:00');
  const [targetCount, setTargetCount] = useState<number | string>(4);
  const [description, setDescription] = useState('');
  const [locations, setLocations] = useState<string[]>(['', '', '']);
  const [candidateDates, setCandidateDates] = useState<string[]>(() =>
    getAllDatesInRange(todayStr, defaultEndStr)
  );

  const prevRangeRef = React.useRef({ startDate, endDate });
  useEffect(() => {
    if (prevRangeRef.current.startDate !== startDate || prevRangeRef.current.endDate !== endDate) {
      prevRangeRef.current = { startDate, endDate };
      const all = getAllDatesInRange(startDate, endDate);
      setCandidateDates((prev) => {
        const filtered = prev.filter((d) => d >= startDate && d <= endDate);
        return filtered.length > 0 ? filtered : all;
      });
    }
  }, [startDate, endDate]);

  const [isLoading, setIsLoading] = useState(false);
  const [recentPlans, setRecentPlans] = useState<any[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [mapTargetLocation, setMapTargetLocation] = useState<string | null>(null);

  const refreshRecents = () => {
    try {
      const saved = localStorage.getItem('lets_make_plans_recents');
      if (saved) {
        setRecentPlans(JSON.parse(saved));
      } else {
        setRecentPlans([]);
      }
    } catch {}
  };

  useEffect(() => {
    refreshRecents();
  }, []);

  const handleLocationChange = (index: number, val: string) => {
    setLocations((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handlePreset = (type: 'this_week' | 'this_month') => {
    const now = new Date();
    setStartDate(formatDate(now));

    if (type === 'this_week') {
      const dayOfWeek = now.getDay();
      const daysToAdd = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
      const thisSunday = new Date(now);
      thisSunday.setDate(now.getDate() + daysToAdd);
      setEndDate(formatDate(thisSunday));
    } else if (type === 'this_month') {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setEndDate(formatDate(lastDay));
    }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !hostName.trim()) {
      toast('모임 이름과 주관자 닉네임을 입력해주세요.', 'warning');
      return;
    }
    if (startDate > endDate) {
      toast('종료일은 시작일 이후여야 합니다.', 'warning');
      return;
    }
    if (candidateDates.length === 0) {
      toast('최소 1개 이상의 후보 날짜를 선택해주세요.', 'warning');
      return;
    }

    const filteredLocations = locations.map((l) => l.trim()).filter(Boolean);

    setIsLoading(true);
    try {
      const { meeting: newPlan, hostToken } = await api.createMeeting({
        title,
        hostName,
        startDate,
        endDate,
        candidateDates,
        meetingTime,
        targetCount: Number(targetCount) || 4,
        description,
        locations: filteredLocations,
      });

      localStorage.setItem(`plan_name_${newPlan.id}`, hostName.trim());

      const updated = [
        {
          id: newPlan.id,
          title: newPlan.title,
          hostName: newPlan.hostName,
          startDate: newPlan.startDate,
          endDate: newPlan.endDate,
          meetingTime: newPlan.meetingTime || meetingTime,
          isHost: true,
        },
        ...recentPlans.filter((p) => p.id !== newPlan.id),
      ].slice(0, 5);
      setRecentPlans(updated);
      localStorage.setItem('lets_make_plans_recents', JSON.stringify(updated));

      toast('🎉 약속방이 생성되었습니다! 초대장 전송과 내 투표를 진행해 보세요.');
      onSelectPlan(newPlan.id, hostName.trim());
    } catch (err: any) {
      toast(err.message || '모임 생성 중 오류가 발생했습니다.', 'warning');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRoom = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api.deleteMeeting(id);
      refreshRecents();
      setDeleteTargetId(null);
      toast('약속방이 삭제되었습니다.', 'info');
    } catch {
      toast('삭제 중 오류가 발생했습니다.', 'warning');
    }
  };

  return (
    <div className="flex-1 flex flex-col p-5 pb-10 bg-[#0b1329] text-slate-100">
      <header className="pt-3 pb-5 border-b border-[#1c2944] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐿️</span>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            Let's make plans!
          </h1>
        </div>
      </header>

      {/* Main Creation Card */}
      <div className="mt-5 bg-[#131d38] rounded-2xl border border-[#203056] shadow-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarIcon className="w-5 h-5 text-sky-400" />
          <h2 className="text-base font-bold text-white">새로운 약속 모임 개설</h2>
        </div>

        <form onSubmit={handleCreateMeeting} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              모임 이름 <span className="text-sky-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder=""
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-[#090f21] border border-[#23355e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              주관자(본인) 닉네임 <span className="text-sky-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder=""
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-[#090f21] border border-[#23355e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            />
          </div>

          {/* 📍 장소 옵션 3개 지정 */}
          <div>
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span>모임 장소 후보 (최대 3개)</span>
            </label>

            <div className="space-y-2">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-5 text-[11px] font-bold text-slate-400 text-center">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    placeholder={`후보 ${idx + 1}`}
                    value={locations[idx] || ''}
                    onChange={(e) => handleLocationChange(idx, e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                  />
                  {locations[idx]?.trim() && (
                    <button
                      type="button"
                      onClick={() => setMapTargetLocation(locations[idx].trim())}
                      className="px-2 py-1.5 text-[10px] font-bold bg-[#172545] hover:bg-[#223663] text-sky-300 border border-[#2b4478] rounded-xl flex items-center gap-1 transition"
                      title="지도 확인"
                    >
                      <Compass className="w-3 h-3 text-sky-400" />
                      <span>지도</span>
                    </button>
                  )}
                  {locations[idx] && (
                    <button
                      type="button"
                      onClick={() => handleLocationChange(idx, '')}
                      className="p-1 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 후보 기간 지정 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                후보 일정 기간 <span className="text-sky-400">*</span>
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePreset('this_week')}
                  className="px-2.5 py-1 text-[11px] bg-[#1a294a] hover:bg-[#253966] text-sky-300 rounded-lg font-bold transition border border-[#2a4070]"
                >
                  이번주
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset('this_month')}
                  className="px-2.5 py-1 text-[11px] bg-[#1a294a] hover:bg-[#253966] text-sky-300 rounded-lg font-bold transition border border-[#2a4070]"
                >
                  이번달
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
                  className="w-full px-2.5 py-2 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 mb-0.5">종료일</span>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* 📅 특정 후보일 선택/제외 인터랙티브 캘린더 */}
            <div className="mt-2.5">
              <CandidateDateSelector
                startDate={startDate}
                endDate={endDate}
                selectedDates={candidateDates}
                onChange={setCandidateDates}
              />
            </div>
          </div>

          {/* 모임 시작 예정 시간 (주관자 모임 시간 등록) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>모임 시작 예정 시간</span>
                <span className="text-sky-400">*</span>
              </label>
              <span className="text-[10px] text-slate-400">참석 판별 기준 시간</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  required
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                  className="px-3 py-2 text-xs font-bold bg-[#090f21] border border-[#23355e] rounded-xl text-white focus:outline-none focus:border-sky-500"
                />
                <div className="flex flex-wrap gap-1">
                  {['17:00', '18:00', '18:30', '19:00', '19:30', '20:00'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMeetingTime(t)}
                      className={`px-2 py-1 text-[11px] rounded-lg font-bold transition border ${
                        meetingTime === t
                          ? 'bg-sky-600 text-white border-sky-400 shadow-sm shadow-sky-600/40'
                          : 'bg-[#152037] hover:bg-[#1e2e4f] text-slate-300 border-[#23355e]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                💡 참가자들은 이 시작 시간을 기준으로 <strong className="text-emerald-400">정시 참석</strong> 또는 <strong className="text-amber-400">늦게 참석(늦참)</strong>을 선택하게 됩니다.
              </p>
            </div>
          </div>

          {/* 목표 인원수 */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              예상 참석 인원수
            </label>

            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <button
                type="button"
                onClick={() => setTargetCount((prev) => Math.max(2, (Number(prev) || 2) - 1))}
                className="w-9 h-9 rounded-xl bg-[#152037] hover:bg-[#1e2e4f] text-white font-bold flex items-center justify-center border border-[#23355e] active:scale-95 transition"
              >
                -
              </button>

              <input
                type="number"
                min="2"
                max="50"
                value={targetCount}
                onChange={(e) => setTargetCount(e.target.value)}
                onBlur={() => {
                  const num = parseInt(String(targetCount), 10);
                  if (isNaN(num) || num < 2) setTargetCount(2);
                  else if (num > 50) setTargetCount(50);
                  else setTargetCount(num);
                }}
                className="w-16 h-9 px-2 text-center text-sm font-bold bg-[#090f21] border border-[#23355e] rounded-xl text-white focus:outline-none focus:border-sky-500"
              />

              <button
                type="button"
                onClick={() => setTargetCount((prev) => Math.min(50, (Number(prev) || 2) + 1))}
                className="w-9 h-9 rounded-xl bg-[#152037] hover:bg-[#1e2e4f] text-white font-bold flex items-center justify-center border border-[#23355e] active:scale-95 transition"
              >
                +
              </button>

              <span className="text-xs text-slate-400 ml-1">명</span>
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              참고 메모 (선택)
            </label>
            <input
              type="text"
              placeholder=""
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {isLoading ? (
              <span className="text-sm">약속방 생성 중...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-sky-200" />
                <span className="text-sm">날짜 & 장소 투표방 생성</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Recent Plans Card */}
      {recentPlans.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <div className="flex items-center gap-1.5">
              <Bookmark className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-bold text-slate-300">최근 생성/참여한 약속</h3>
            </div>
            <span className="text-[10px] text-slate-500">방 삭제 가능</span>
          </div>
          <div className="space-y-2">
            {recentPlans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => onSelectPlan(plan.id)}
                className="p-3 bg-[#131d38] hover:bg-[#1a274a] active:scale-[0.99] border border-[#203056] rounded-xl flex items-center justify-between cursor-pointer transition group"
              >
                <div className="truncate mr-2">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-bold text-white truncate">{plan.title}</h4>
                    {plan.isHost && (
                      <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold rounded">
                        개설자 👑
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {plan.startDate} ~ {plan.endDate} · 주관자: {plan.hostName}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {plan.isHost && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPlan(plan.id, undefined, true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-[#202945] rounded-lg transition"
                      title="이 약속방 정보 수정하기 (재투표)"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTargetId(plan.id);
                    }}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-[#201c2e] rounded-lg transition"
                    title="이 약속방 삭제하기"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#131d38] w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-rose-500/40 animate-in zoom-in duration-200">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <h3 className="text-base font-bold text-white">약속방을 삭제하시겠습니까?</h3>
              <p className="text-xs text-slate-400 mt-1">
                삭제하면 참여자들의 투표 데이터와 링크가 모두 영구히 삭제됩니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="flex-1 py-2.5 bg-[#17223e] hover:bg-[#203056] text-slate-300 text-xs font-bold rounded-xl border border-[#283d6a]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRoom(deleteTargetId)}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/30"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto pt-8 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#131d38] border border-[#203056] rounded-full text-[11px] text-slate-400">
          <span>⚡ 날짜 & 장소 복합 투표 · Lark Bitable DB Ready</span>
        </div>
      </footer>

      {/* 🗺️ Location Map Modal */}
      {mapTargetLocation && (
        <MapModal
          location={mapTargetLocation}
          onClose={() => setMapTargetLocation(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// EDIT PLAN MODAL (주관자 약속방 수정 & 재투표 세팅)
// ============================================================================
function EditPlanModal({
  meeting,
  isOpen,
  onClose,
  onUpdated,
}: {
  meeting: Meeting;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updated: Meeting) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(meeting.title || '');
  const [meetingTime, setMeetingTime] = useState(meeting.meetingTime || '19:00');
  const [locations, setLocations] = useState<string[]>([
    meeting.locations?.[0] || '',
    meeting.locations?.[1] || '',
    meeting.locations?.[2] || '',
  ]);
  const [startDate, setStartDate] = useState(meeting.startDate || '');
  const [endDate, setEndDate] = useState(meeting.endDate || '');
  const [targetCount, setTargetCount] = useState(meeting.targetCount || 4);
  const [description, setDescription] = useState(meeting.description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [mapTargetLocation, setMapTargetLocation] = useState<string | null>(null);
  const [candidateDates, setCandidateDates] = useState<string[]>(() => {
    if (meeting.candidateDates && meeting.candidateDates.length > 0) {
      return meeting.candidateDates;
    }
    return getAllDatesInRange(meeting.startDate || '', meeting.endDate || '');
  });

  const prevEditRangeRef = React.useRef({ startDate, endDate });
  useEffect(() => {
    if (prevEditRangeRef.current.startDate !== startDate || prevEditRangeRef.current.endDate !== endDate) {
      prevEditRangeRef.current = { startDate, endDate };
      const all = getAllDatesInRange(startDate, endDate);
      setCandidateDates((prev) => {
        const filtered = prev.filter((d) => d >= startDate && d <= endDate);
        return filtered.length > 0 ? filtered : all;
      });
    }
  }, [startDate, endDate]);

  useEffect(() => {
    setTitle(meeting.title || '');
    setMeetingTime(meeting.meetingTime || '19:00');
    setLocations([
      meeting.locations?.[0] || '',
      meeting.locations?.[1] || '',
      meeting.locations?.[2] || '',
    ]);
    setStartDate(meeting.startDate || '');
    setEndDate(meeting.endDate || '');
    setTargetCount(meeting.targetCount || 4);
    setDescription(meeting.description || '');

    const initialCandidates =
      meeting.candidateDates && meeting.candidateDates.length > 0
        ? meeting.candidateDates
        : getAllDatesInRange(meeting.startDate || '', meeting.endDate || '');
    setCandidateDates(initialCandidates);
  }, [meeting, isOpen]);

  if (!isOpen) return null;

  const handleLocationChange = (index: number, val: string) => {
    const next = [...locations];
    next[index] = val;
    setLocations(next);
  };

  const handlePreset = (type: 'this_week' | 'this_month' | 'next_month') => {
    const today = new Date();
    const todayStr = formatDate(today);
    if (type === 'this_week') {
      const day = today.getDay();
      const diffToSunday = (7 - day) % 7;
      const sunday = new Date(today);
      sunday.setDate(today.getDate() + diffToSunday);
      setStartDate(todayStr);
      setEndDate(formatDate(sunday));
    } else if (type === 'this_month') {
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(todayStr);
      setEndDate(formatDate(endOfMonth));
    } else if (type === 'next_month') {
      const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      setStartDate(todayStr);
      setEndDate(formatDate(endOfNextMonth));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast('모임 이름을 입력해주세요.', 'warning');
      return;
    }
    if (!startDate || !endDate) {
      toast('시작일과 종료일을 지정해주세요.', 'warning');
      return;
    }
    if (startDate > endDate) {
      toast('시작일은 종료일보다 이전이어야 합니다.', 'warning');
      return;
    }
    if (candidateDates.length === 0) {
      toast('최소 1개 이상의 후보 날짜를 선택해주세요.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await api.updateMeeting(meeting.id, {
        title: title.trim(),
        startDate,
        endDate,
        candidateDates,
        targetCount: Number(targetCount) || 4,
        meetingTime: meetingTime.trim(),
        description: description.trim(),
        locations: locations.map((l) => l.trim()).filter(Boolean),
      });
      toast('🎉 방 정보가 수정되었습니다! 기존 투표가 초기화되어 새 투표를 시작합니다.');
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      toast(err.message || '수정 중 오류가 발생했습니다.', 'warning');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#101b33] w-full max-w-md rounded-3xl p-5 shadow-2xl border border-amber-500/40 text-left animate-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-[#1f3056]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">약속방 정보 수정 (재투표)</h3>
              <p className="text-[11px] text-slate-400">일자, 장소, 시간을 조정하여 새 투표를 개설합니다.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1a2b4f]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto py-3 space-y-3.5 pr-1 flex-1">
          {/* Warning Notice */}
          <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl flex items-start gap-2 text-left">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-200/90 leading-relaxed">
              <strong className="text-amber-300 font-bold">재투표 안내:</strong> 방 정보를 수정하면
              기존 참가자들의 <strong className="text-white">모든 투표 내역이 초기화</strong>됩니다.
              기존 초대 링크는 그대로 유지되므로 단톡방에 다시 투표를 요청하시면 됩니다.
            </div>
          </div>

          {/* 모임 이름 */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              모임 이름 <span className="text-sky-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* 모임 장소 후보 3개 */}
          <div>
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span>모임 장소 후보 (최대 3개)</span>
            </label>
            <div className="space-y-1.5">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-4 text-[10px] font-bold text-slate-400 text-center">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    placeholder={`후보 ${idx + 1}`}
                    value={locations[idx] || ''}
                    onChange={(e) => handleLocationChange(idx, e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                  />
                  {locations[idx]?.trim() && (
                    <button
                      type="button"
                      onClick={() => setMapTargetLocation(locations[idx].trim())}
                      className="px-2 py-1 text-[10px] font-bold bg-[#172545] hover:bg-[#223663] text-sky-300 border border-[#2b4478] rounded-lg flex items-center gap-1 transition"
                      title="지도 확인"
                    >
                      <Compass className="w-3 h-3 text-sky-400" />
                      <span>지도</span>
                    </button>
                  )}
                  {locations[idx] && (
                    <button
                      type="button"
                      onClick={() => handleLocationChange(idx, '')}
                      className="p-1 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 후보 일정 기간 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                후보 일정 기간 <span className="text-sky-400">*</span>
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handlePreset('this_week')}
                  className="px-2 py-0.5 text-[10px] bg-[#1a294a] hover:bg-[#253966] text-sky-300 rounded font-bold transition border border-[#2a4070]"
                >
                  이번주
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset('this_month')}
                  className="px-2 py-0.5 text-[10px] bg-[#1a294a] hover:bg-[#253966] text-sky-300 rounded font-bold transition border border-[#2a4070]"
                >
                  이번달
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset('next_month')}
                  className="px-2 py-0.5 text-[10px] bg-[#1a294a] hover:bg-[#253966] text-sky-300 rounded font-bold transition border border-[#2a4070]"
                >
                  다음달까지
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
                  className="w-full px-2.5 py-1.5 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 mb-0.5">종료일</span>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* 📅 특정 후보일 선택/제외 인터랙티브 캘린더 */}
            <div className="mt-2">
              <CandidateDateSelector
                startDate={startDate}
                endDate={endDate}
                selectedDates={candidateDates}
                onChange={setCandidateDates}
              />
            </div>
          </div>

          {/* 모임 시작 예정 시간 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>시작 예정 시간</span>
                <span className="text-sky-400">*</span>
              </label>
              <span className="text-[10px] text-slate-400">정시/늦참 기준</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  required
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold bg-[#090f21] border border-[#23355e] rounded-xl text-white focus:outline-none focus:border-sky-500"
                />
                <div className="flex flex-wrap gap-1">
                  {['17:00', '18:00', '18:30', '19:00', '19:30', '20:00'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMeetingTime(t)}
                      className={`px-1.5 py-0.5 text-[10px] rounded font-bold transition border ${
                        meetingTime === t
                          ? 'bg-sky-600 text-white border-sky-400'
                          : 'bg-[#152037] hover:bg-[#1e2e4f] text-slate-300 border-[#23355e]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 예상 참석 인원수 */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              예상 참석 인원수
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTargetCount((prev) => Math.max(2, prev - 1))}
                className="w-8 h-8 rounded-lg bg-[#15223e] hover:bg-[#203258] text-white font-bold flex items-center justify-center border border-[#243760]"
              >
                -
              </button>
              <input
                type="number"
                min="2"
                max="50"
                value={targetCount}
                onChange={(e) => setTargetCount(Math.max(2, Number(e.target.value) || 2))}
                className="w-16 text-center py-1.5 bg-[#090f21] border border-[#23355e] rounded-lg text-white font-extrabold text-sm"
              />
              <button
                type="button"
                onClick={() => setTargetCount((prev) => Math.min(50, prev + 1))}
                className="w-8 h-8 rounded-lg bg-[#15223e] hover:bg-[#203258] text-white font-bold flex items-center justify-center border border-[#243760]"
              >
                +
              </button>
              <span className="text-xs text-slate-400">명</span>
            </div>
          </div>

          {/* 참고 메모 */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              참고 메모 (선택)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 1차는 고기, 2차는 맥주 한잔!"
              className="w-full px-3 py-2 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2.5 bg-[#17223e] hover:bg-[#203056] text-slate-300 text-xs font-bold rounded-xl border border-[#283d6a]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black rounded-xl shadow-lg shadow-amber-500/30 flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              {isSaving ? (
                <span>저장 중...</span>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>수정 완료 & 재투표 시작</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 🗺️ Location Map Modal */}
      {mapTargetLocation && (
        <MapModal
          location={mapTargetLocation}
          onClose={() => setMapTargetLocation(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// 2. PLAN DETAIL VIEW (개설자 권한 분리 + 일자 전체보기 + 일자 선택취소 모달)
// ============================================================================
function PlanDetailView({
  planId,
  prefilledName,
  urlHostToken,
  initialOpenEdit,
  onBack,
}: {
  planId: string;
  prefilledName?: string | null;
  urlHostToken?: string | null;
  initialOpenEdit?: boolean;
  onBack: () => void;
}) {
  const toast = useToast();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [responses, setResponses] = useState<ParticipantResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'VOTE' | 'RESULTS'>('VOTE');

  // Participant State
  const [participantName, setParticipantName] = useState(prefilledName || '');
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [mySelections, setMySelections] = useState<Record<string, DateSelection>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [targetGuestName, setTargetGuestName] = useState('');

  // 👑 Host Authority Detection
  const [isHostUser, setIsHostUser] = useState(false);
  const [showHostAuthModal, setShowHostAuthModal] = useState(false);
  const [inputHostPin, setInputHostPin] = useState('');

  // 🗓️ Date Selection Action Modal (선택 변경 및 확실한 선택 취소)
  const meetingTime = meeting?.meetingTime || '19:00';
  const [dateModalTarget, setDateModalTarget] = useState<string | null>(null);
  const [dateModalNote, setDateModalNote] = useState('20:00경 합류 (+1시간 늦참)');

  // Results inspect modal
  const [inspectDate, setInspectDate] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showZeroMatchModal, setShowZeroMatchModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(initialOpenEdit || false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [mapTargetLocation, setMapTargetLocation] = useState<string | null>(null);

  const handleMeetingUpdated = (updated: Meeting) => {
    setMeeting(updated);
    setResponses([]);
    setMySelections({});
    setSelectedLocations([]);
    setHasSubmitted(false);
    setShowCelebration(false);
    setShowZeroMatchModal(false);
    setActiveTab('VOTE');
  };

  const handleNameChange = (newName: string) => {
    setParticipantName(newName);
    const trimmed = newName.trim();
    if (!trimmed) {
      setHasSubmitted(false);
      return;
    }
    const prev = responses.find((r) => r.participantName.trim() === trimmed);
    if (prev) {
      setMySelections(prev.selections || {});
      setSelectedLocations(prev.selectedLocations || []);
      setHasSubmitted(true);
    } else {
      setHasSubmitted(false);
    }
  };

  const loadData = async () => {
    try {
      const data = await api.getMeeting(planId);
      if (data) {
        setMeeting(data);
        const respList = data.responses || [];
        setResponses(respList);

        // Check Host Authority
        const storedHostToken = localStorage.getItem(`host_token_${planId}`);
        const isHost =
          (storedHostToken && storedHostToken === data.hostToken) ||
          (urlHostToken && urlHostToken === data.hostToken) ||
          (data.hostToken && storedHostToken === data.hostToken);

        if (isHost) {
          setIsHostUser(true);
          // If host token was in URL, save to local storage for persistence
          if (urlHostToken && data.hostToken) {
            localStorage.setItem(`host_token_${planId}`, data.hostToken);
          }
          if (initialOpenEdit) {
            setShowEditModal(true);
          }
        }

        const savedName = localStorage.getItem(`plan_name_${planId}`);
        const effectiveName = prefilledName || (isHost ? data.hostName : savedName || '');

        if (effectiveName) {
          setParticipantName(effectiveName);
          const prev = respList.find((r) => r.participantName === effectiveName);
          if (prev) {
            setMySelections(prev.selections || {});
            setSelectedLocations(prev.selectedLocations || []);
            setHasSubmitted(true);
          }
        }
      } else {
        setError('해당 모임을 찾을 수 없습니다.');
      }
    } catch {
      setError('데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [planId]);

  const monthsData = useMemo<MonthCalendar[]>(() => {
    if (!meeting) return [];
    return generateMonthsInRange(meeting.startDate, meeting.endDate, meeting.candidateDates);
  }, [meeting]);

  const aggregatedResults = useMemo(() => {
    if (!meeting) return {};
    return aggregateMeetingResponses(meeting, responses);
  }, [meeting, responses]);

  const bestMatches = useMemo(() => {
    return getBestMatchDates(aggregatedResults, responses.length);
  }, [aggregatedResults, responses.length]);

  // Split into Full Matches (100% attendance) and Partial Matches
  const fullMatches = useMemo(() => {
    return bestMatches.filter((m) => m.isFullMatch);
  }, [bestMatches]);

  // Pure All-Day Full Matches (전원 종일 가능, 제약 없음)
  const pureFullMatches = useMemo(() => {
    return fullMatches.filter((m) => m.conditionalCount === 0);
  }, [fullMatches]);

  // Conditional Full Matches (전원 가능하지만 조건부 포함)
  const conditionalFullMatches = useMemo(() => {
    return fullMatches.filter((m) => m.conditionalCount > 0);
  }, [fullMatches]);

  const partialMatches = useMemo(() => {
    return bestMatches.filter((m) => !m.isFullMatch);
  }, [bestMatches]);

  // Aggregate Location Votes
  const locationVotes = useMemo<LocationVoteResult[]>(() => {
    if (!meeting?.locations?.length) return [];
    const totalResp = responses.length;

    const tally: Record<string, { count: number; voters: string[] }> = {};
    for (const loc of meeting.locations) {
      tally[loc] = { count: 0, voters: [] };
    }

    for (const r of responses) {
      if (r.selectedLocations) {
        for (const loc of r.selectedLocations) {
          if (tally[loc]) {
            tally[loc].count += 1;
            tally[loc].voters.push(r.participantName);
          }
        }
      }
    }

    return meeting.locations
      .map((loc) => ({
        location: loc,
        votes: tally[loc]?.count || 0,
        percentage: totalResp > 0 ? Math.round(((tally[loc]?.count || 0) / totalResp) * 100) : 0,
        voters: tally[loc]?.voters || [],
      }))
      .sort((a, b) => b.votes - a.votes);
  }, [meeting, responses]);

  // Tie-aware Top Locations computation (공동 1위 동률 완벽 지원)
  const maxLocationVotes = locationVotes.length > 0 ? locationVotes[0].votes : 0;
  const topLocations = useMemo(() => {
    if (maxLocationVotes === 0) return [];
    return locationVotes.filter((l) => l.votes === maxLocationVotes);
  }, [locationVotes, maxLocationVotes]);

  const getLocationRank = (loc: LocationVoteResult, index: number) => {
    if (loc.votes === 0) {
      return {
        label: `${index + 1}위`,
        isTop: false,
        isTie: false,
        badgeClass: 'text-slate-400 font-medium',
      };
    }
    const higherCount = locationVotes.filter((other) => other.votes > loc.votes).length;
    const sameCount = locationVotes.filter((other) => other.votes === loc.votes).length;
    const currentRank = higherCount + 1;
    const isTie = sameCount > 1;

    if (currentRank === 1) {
      return {
        label: isTie ? '공동 1위 👑' : '1위 👑',
        isTop: true,
        isTie,
        badgeClass: 'px-1.5 py-0.5 bg-amber-500 text-black text-[9px] font-black rounded shadow-sm shadow-amber-500/30',
      };
    }
    return {
      label: isTie ? `공동 ${currentRank}위` : `${currentRank}위`,
      isTop: false,
      isTie,
      badgeClass: 'text-slate-400 font-medium',
    };
  };

  const topLocation = topLocations.length > 0 ? topLocations[0] : null;

  // Result Notification when all target participants responded
  useEffect(() => {
    if (!meeting || responses.length === 0) return;
    const isTargetMet = responses.length >= meeting.targetCount;

    if (isTargetMet && activeTab === 'RESULTS') {
      if (fullMatches.length > 0) {
        setShowCelebration(true);
        setShowZeroMatchModal(false);
        confetti({
          particleCount: 70,
          spread: 65,
          origin: { y: 0.55 },
          colors: ['#38bdf8', '#34d399', '#fbbf24', '#f43f5e'],
        });
      } else {
        setShowCelebration(false);
        setShowZeroMatchModal(true);
      }
    }
  }, [meeting, responses.length, fullMatches.length, activeTab]);

  const handleLocationToggle = (loc: string) => {
    setSelectedLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]
    );
  };

  // 🗓️ DATE CLICK HANDLER (첫 클릭 = 정시 참석, 이미 선택된 날 = 늦참/취소 모달 오픈)
  const handleDayClickInVote = (dateStr: string) => {
    const current = mySelections[dateStr];
    if (!current) {
      // First click: select ALL_DAY immediately (정시 참석)
      setMySelections((prev) => ({
        ...prev,
        [dateStr]: { date: dateStr, type: 'ALL_DAY' },
      }));
      toast(`${dateStr} 정시 참석(${meetingTime})으로 지정되었습니다. (한 번 더 누르면 늦참/취소)`);
    } else {
      // Already selected: open the action modal where they can change to late arrival OR DESELECT!
      setDateModalTarget(dateStr);
      setDateModalNote(
        current.note || `${addMinutesToTime(meetingTime, 60)}경 합류 (+1시간 늦참)`
      );
    }
  };

  // Set to ALL_DAY (정시 참석)
  const handleModalSetAllDay = () => {
    if (!dateModalTarget) return;
    setMySelections((prev) => ({
      ...prev,
      [dateModalTarget]: { date: dateModalTarget, type: 'ALL_DAY' },
    }));
    setDateModalTarget(null);
    toast(`${dateModalTarget}: 정시 참석(${meetingTime})으로 변경되었습니다.`);
  };

  // Set to CONDITIONAL (늦게 참석)
  const handleModalSetConditional = () => {
    if (!dateModalTarget) return;
    setMySelections((prev) => ({
      ...prev,
      [dateModalTarget]: {
        date: dateModalTarget,
        type: 'CONDITIONAL',
        note: dateModalNote.trim() || `${addMinutesToTime(meetingTime, 60)}경 합류`,
      },
    }));
    setDateModalTarget(null);
    toast(`${dateModalTarget}: 늦은 참석(늦참)으로 설정되었습니다.`);
  };

  // ❌ DESELECT (지정 취소)
  const handleModalDeselect = () => {
    if (!dateModalTarget) return;
    setMySelections((prev) => {
      const next = { ...prev };
      delete next[dateModalTarget];
      return next;
    });
    setDateModalTarget(null);
    toast(`${dateModalTarget} 선택이 취소(해제)되었습니다.`, 'info');
  };

  const handleSubmitResponse = async () => {
    if (!participantName.trim()) {
      toast('참여자 닉네임을 입력해주세요.', 'warning');
      return;
    }
    const count = Object.keys(mySelections).length;
    if (count === 0) {
      toast('가능한 날짜를 최소 하루 이상 캘린더에서 터치해 주세요.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.submitResponse(
        planId,
        participantName.trim(),
        mySelections,
        selectedLocations
      );
      setHasSubmitted(true);
      localStorage.setItem(`plan_name_${planId}`, participantName.trim());
      setResponses(res.allResponses);
      setActiveTab('RESULTS');
      toast('🎉 내 투표가 완료되었습니다! 전체 결과를 확인해 보세요.');
    } catch {
      toast('저장 중 오류가 발생했습니다.', 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteThisRoom = async () => {
    try {
      await api.deleteMeeting(planId);
      toast('약속방이 삭제되었습니다.', 'info');
      onBack();
    } catch {
      toast('삭제 중 오류가 발생했습니다.', 'warning');
    }
  };

  // Verify host manually if needed
  const handleManualHostAuth = () => {
    if (!meeting) return;
    if (inputHostPin.trim() === meeting.hostToken || inputHostPin.trim() === meeting.hostName) {
      setIsHostUser(true);
      if (meeting.hostToken) {
        localStorage.setItem(`host_token_${planId}`, meeting.hostToken);
      }
      setShowHostAuthModal(false);
      toast('👑 개설자(주관자) 권한이 인증되었습니다!');
    } else {
      toast('일치하지 않습니다. 개설자 닉네임을 정확히 입력하세요.', 'warning');
    }
  };

  const getFullShareUrl = (guestName?: string) => {
    const query = guestName ? `?name=${encodeURIComponent(guestName.trim())}` : '';
    if (typeof window !== 'undefined') {
      const base = window.location.origin + window.location.pathname;
      return `${base}#/plan/${planId}${query}`;
    }
    return `#/plan/${planId}${query}`;
  };

  const handleCopyInvitation = async (customName?: string) => {
    if (!meeting) return;
    const cleanName = customName?.trim() || '';
    const url = getFullShareUrl(cleanName);
    const locText = meeting.locations?.length
      ? `\n📍 장소 후보: ${meeting.locations.join(', ')}`
      : '';
    const timeText = `\n⏰ 모임 예정 시간: ${meetingTime}`;

    const allDatesInRange = getAllDatesInRange(meeting.startDate, meeting.endDate);
    const candidateNote =
      meeting.candidateDates &&
      meeting.candidateDates.length > 0 &&
      meeting.candidateDates.length < allDatesInRange.length
        ? ` (지정 후보일: 총 ${meeting.candidateDates.length}일)`
        : '';
    const dateText = `\n📅 후보 기간: ${meeting.startDate} ~ ${meeting.endDate}${candidateNote}`;

    let text = '';
    if (cleanName) {
      text = `[Let's make plans! 💌 ${cleanName}님 투표 초대장]\n"${meeting.title}" 약속을 위해 가능한 날짜와 장소를 모으고 있습니다!\n\n${cleanName}님! 아래 링크에 접속하여 투표하실 수 있습니다:\n${url}\n${dateText}${timeText}${locText}\n👤 주관자: ${meeting.hostName}`;
    } else {
      text = `[Let's make plans! 💌 약속 투표 초대장]\n"${meeting.title}" 약속을 위해 가능한 날짜와 장소를 모으고 있습니다!\n${dateText}${timeText}${locText}\n👤 주관자: ${meeting.hostName}\n\n아래 링크에 접속하여 투표하실 수 있습니다:\n${url}`;
    }

    const ok = await copyToClipboardRobust(text);
    if (ok) {
      toast(
        cleanName
          ? `💌 "${cleanName}" 님 맞춤 초대장 문구가 복사되었습니다!`
          : '💌 투표 초대장 문구가 복사되었습니다! (SNS·메신저로 전송하세요)'
      );
    } else {
      toast('초대장 문구를 복사했습니다.', 'info');
    }
  };

  const handleCopyLink = async () => {
    const url = getFullShareUrl();
    const ok = await copyToClipboardRobust(url);
    if (ok) {
      toast('초대 링크가 복사되었습니다!');
    } else {
      toast('링크를 복사했습니다: ' + url, 'info');
    }
  };

  const handleCopyKakaoText = async () => {
    // Alias to handleCopyInvitation
    await handleCopyInvitation();
  };

  // 👑 Host Only Final Announcement (공동 1위 동률 장소 및 늦참자 안내 완벽 지원)
  const handleHostFinalAnnouncement = async (dateStr: string) => {
    if (!meeting) return;
    const targetDate = dateStr || fullMatches[0]?.date || bestMatches[0]?.date || meeting.startDate;
    const locNote =
      topLocations.length > 1
        ? `\n📍 모임 장소: ${topLocations.map((l) => l.location).join(', ')} (선호도 공동 1위 각 ${maxLocationVotes}표)`
        : topLocations.length === 1
        ? `\n📍 모임 장소: ${topLocations[0].location} (선호 1위, ${maxLocationVotes}표)`
        : '';

    const agg = aggregatedResults[targetDate];
    const lateArrivals = agg?.participants
      ?.filter((p) => p.type === 'CONDITIONAL' && p.note)
      ?.map((p) => `  - ${p.name}: ${p.note}`)
      ?.join('\n');
    const lateText = lateArrivals ? `\n⏰ 늦참자 안내:\n${lateArrivals}` : '';

    const text = `[Let's make plans! 👑 주관자 최종 확정 공지]\n"${meeting.title}" 약속 날짜와 장소가 최종 확정되었습니다!\n\n📅 최종 일시: ${targetDate} (${meetingTime})${locNote}${lateText}\n👥 참석자(${responses.length}명): ${responses.map((r) => r.participantName).join(', ')}\n\n주관자 ${meeting.hostName} 올림. 늦지 않게 만나요! 🍻`;
    const ok = await copyToClipboardRobust(text);
    if (ok) {
      toast('👑 [주관자 최종 확정 공지] 문구가 클립보드에 복사되었습니다!');
    } else {
      toast('공지 문구를 복사했습니다.', 'info');
    }
  };

  // 📢 Host Alternative Notice (전원 일치일 0일일 때 차선책 일정 공지)
  const handleHostAlternativeAnnouncement = async (targetDate?: string) => {
    if (!meeting) return;
    const bestDate = targetDate || bestMatches[0]?.date || meeting.startDate;
    const agg = aggregatedResults[bestDate];
    const count = agg?.totalAvailableCount || 0;
    const availableNames = agg?.participants
      ?.filter((p) => p.type === 'ALL_DAY' || p.type === 'CONDITIONAL')
      ?.map((p) => (p.type === 'CONDITIONAL' && p.note ? `${p.name}(늦참)` : p.name))
      ?.join(', ') || '';

    const locNote =
      topLocations.length > 0
        ? `\n📍 장소 후보 1위: ${topLocations.map((l) => l.location).join(', ')} (${maxLocationVotes}표)`
        : '';

    const text = `[Let's make plans! 📢 주관자 차선책 일정 안내]\n"${meeting.title}" 투표 결과, 전원 일치일이 없어 가장 많이 모일 수 있는 차선책 일정을 공유합니다!\n\n📅 차선 추천 일시: ${bestDate} (${meetingTime})${locNote}\n👥 참석 가능(${count}/${responses.length}명): ${availableNames}\n\n주관자 ${meeting.hostName} 올림. 해당 일자로 모일지 의견 부탁드립니다! 🍻\n\n결과 캘린더:\n${getFullShareUrl()}`;

    const ok = await copyToClipboardRobust(text);
    if (ok) {
      toast('🥈 [주관자 차선책 공지] 문구가 클립보드에 복사되었습니다!');
    } else {
      toast('공지 문구를 복사했습니다.', 'info');
    }
  };

  // 👤 Regular Participant Share
  const handleParticipantShareStatus = async () => {
    if (!meeting) return;
    const isTargetMet = responses.length >= meeting.targetCount;
    let text = '';
    if (isTargetMet) {
      text = `[Let's make plans! 🎉 투표 완료 알림]\n"${meeting.title}" 목표 인원(${responses.length}명) 투표가 모두 완료되었습니다!\n\n👑 주관자가 투표 결과를 토대로 최종 약속 일정을 곧 확정 공지할 예정입니다.\n\n결과 캘린더 보기:\n${getFullShareUrl()}`;
    } else {
      text = `[Let's make plans! 📊 현재 투표 현황]\n"${meeting.title}" 약속 투표가 진행 중입니다!\n현재 참여: ${responses.length}/${meeting.targetCount}명\n\n아직 투표 안 한 분들은 아래 링크에서 날짜를 찍어주세요:\n${getFullShareUrl()}`;
    }

    const ok = await copyToClipboardRobust(text);
    if (ok) {
      toast(isTargetMet ? '🎉 투표 완료 안내 문구가 복사되었습니다!' : '단톡방 투표 독려 현황 문구가 복사되었습니다!');
    } else {
      toast('문구를 복사했습니다.', 'info');
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#0b1329]">
        <span className="text-4xl animate-bounce">🐿️</span>
        <p className="text-sm font-bold text-slate-300 mt-3">약속방 데이터를 불러오는 중...</p>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#0b1329]">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-2" />
        <h2 className="text-base font-bold text-white">오류가 발생했습니다</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">{error}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl"
        >
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  const selectedCount = Object.keys(mySelections).length;

  return (
    <div className="flex-1 flex flex-col pb-24 bg-[#0b1329] text-slate-100">
      {/* Top Header */}
      <header className="sticky top-0 bg-[#0b1329]/95 backdrop-blur-md z-30 border-b border-[#1c2944] px-4 py-3 flex items-center justify-between">
        {isHostUser ? (
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 hover:bg-[#162344] rounded-xl transition text-slate-300"
            title="모임 목록으로 나가기"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-7" />
        )}

        <div className="flex items-center justify-center gap-1.5 max-w-[240px] truncate text-center">
          <span className="text-xs font-extrabold text-white truncate">
            {meeting.title}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {!isHostUser ? (
            <button
              onClick={() => setShowHostAuthModal(true)}
              className="p-1.5 hover:bg-[#162344] text-slate-500 hover:text-amber-400 rounded-xl transition"
              title="주관자 인증"
            >
              <Key className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="w-7" />
          )}
        </div>
      </header>

      {/* Meeting Summary Banner */}
      <div className="bg-[#101930] border-b border-[#1c2944] p-4">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#182a4a] text-sky-400 border border-[#253f6d]">
              주관자: {meeting.hostName}
            </span>
            {isHostUser && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-amber-300 bg-amber-950/60 hover:bg-amber-900/70 border border-amber-500/40 rounded-lg transition active:scale-95"
                  title="일정·장소·시간 수정 (재투표)"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>방 수정</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition"
                  title="약속방 삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <h1 className="text-lg font-black text-white leading-tight">{meeting.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {meeting.startDate} ~ {meeting.endDate}
              </span>
              {meeting.candidateDates && meeting.candidateDates.length > 0 && (
                <span className="text-[10px] text-sky-400 bg-sky-950/60 border border-sky-600/40 px-1.5 py-0.2 rounded-full font-bold ml-1">
                  {meeting.candidateDates.length}일 후보
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-sky-300 font-semibold">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>시작 예정: {meetingTime}</span>
            </span>
          </div>
          {meeting.locations && meeting.locations.length > 0 && (
            <div className="text-xs text-amber-300 mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-slate-400">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>장소 후보:</span>
              </span>
              {meeting.locations.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setMapTargetLocation(loc)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#142343] hover:bg-[#1f3768] text-amber-300 border border-amber-500/30 transition active:scale-95"
                  title="지도 및 주변 정보 보기"
                >
                  <span>{loc}</span>
                  <Compass className="w-2.5 h-2.5 text-sky-400" />
                </button>
              ))}
            </div>
          )}
          {meeting.description && (
            <p className="text-xs text-slate-300 mt-1.5 bg-[#080d1e] p-2 rounded-lg border border-[#1e2e50]">
              💬 {meeting.description}
            </p>
          )}
        </div>

        {/* Participant Counter */}
        <div className="mt-3 pt-3 border-t border-[#1c2944] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-xs font-bold text-slate-200">
              참여 현황: {responses.length} / {meeting.targetCount}명
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] flex-wrap justify-end">
            {responses.map((r) => (
              <span
                key={r.participantName}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                  r.participantName === participantName
                    ? 'bg-sky-950 text-sky-300 border-sky-600'
                    : 'bg-[#15223e] text-slate-300 border-[#23355e]'
                }`}
              >
                {r.participantName}
                {r.participantName === participantName && ' (나)'}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 🌟 PROMINENT IN-PAGE SHARE BANNER (주관자에게만 노출) */}
      {isHostUser && (
        <div className="mx-4 mt-3 bg-gradient-to-r from-[#142345] to-[#122c4f] border border-[#2b4478] rounded-2xl p-3.5 shadow-lg flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold text-white">친구들에게 초대장 보내기</h3>
            </div>
            <span className="text-[10px] text-sky-300 bg-[#0e1c38] px-2 py-0.5 rounded-full border border-[#223963]">
              주관자 전용
            </span>
          </div>

          <p className="text-[11px] text-slate-300">
            단톡방 전체에 보내거나, 특정 친구 이름을 지정하여 1:1 맞춤 링크를 생성할 수 있습니다.
          </p>

          {/* 특정 친구 지정 옵션 입력칸 */}
          <div className="flex items-center gap-2 bg-[#091124] p-2 rounded-xl border border-[#233860]">
            <span className="text-[11px] font-bold text-slate-300 whitespace-nowrap flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>특정 친구 지정:</span>
            </span>
            <input
              type="text"
              placeholder="친구 이름 입력 (비워두면 단톡방 전체용)"
              value={targetGuestName}
              onChange={(e) => setTargetGuestName(e.target.value)}
              className="flex-1 px-2.5 py-1 text-xs bg-[#0f1a33] border border-[#253966] rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
            />
            {targetGuestName && (
              <button
                type="button"
                onClick={() => setTargetGuestName('')}
                className="text-slate-400 hover:text-white p-0.5"
                title="지우기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="mt-0.5">
            <button
              type="button"
              onClick={() => handleCopyInvitation(targetGuestName)}
              className="w-full py-3 px-4 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-[0.99] text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 transition"
            >
              <Share2 className="w-4 h-4 text-white" />
              <span>
                {targetGuestName.trim()
                  ? `💌 "${targetGuestName.trim()}" 맞춤 초대장 복사`
                  : '💌 단톡방 전체 초대장 복사 (일반용)'}
              </span>
            </button>
            <p className="text-[10px] text-slate-400 mt-1.5 text-center">
              {targetGuestName.trim()
                ? `💡 친구가 링크 접속 시 "${targetGuestName.trim()}" 님으로 자동 지정되어 바로 투표합니다.`
                : '💡 단톡방용: 누구나 접속하여 본인 이름을 입력하고 투표합니다.'}
            </p>
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="p-3 bg-[#0b1329] border-b border-[#1c2944] sticky top-[53px] z-20 mt-1">
        <div className="grid grid-cols-2 p-1 bg-[#101930] rounded-xl text-xs font-bold border border-[#1c2944]">
          <button
            onClick={() => setActiveTab('VOTE')}
            className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'VOTE'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>내 투표하기 {selectedCount > 0 && `(${selectedCount})`}</span>
          </button>
          <button
            onClick={() => setActiveTab('RESULTS')}
            className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'RESULTS'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>전체 결과 캘린더</span>
            {responses.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: Participant Voting */}
      {activeTab === 'VOTE' && (
        <div className="p-4 flex-1 space-y-4">
          {/* 1. Participant Identity */}
          <div className="bg-[#131d38] p-3.5 rounded-2xl border border-[#203056] shadow-lg">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                <span>내 닉네임 (참여자 이름)</span>
              </label>
              {prefilledName && participantName === prefilledName && (
                <span className="text-[10px] text-sky-300 bg-sky-950/70 px-2 py-0.5 rounded-md border border-sky-600/40">
                  초대받은 이름으로 자동 지정됨
                </span>
              )}
            </div>

            <input
              type="text"
              placeholder="예: 김철수, Smart Lee"
              value={participantName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-[#080d1e] border border-[#23355e] focus:border-sky-500 rounded-xl text-white placeholder-slate-500 focus:outline-none transition"
            />
            {hasSubmitted && (
              <p className="text-[10px] text-sky-400 mt-1 pl-1">
                ✓ 이미 투표한 이력이 있어 기존 선택 일정이 불러와졌습니다. (수정 가능)
              </p>
            )}
          </div>

          {/* 2. 📍 Location Selection (If locations exist) */}
          {meeting.locations && meeting.locations.length > 0 && (
            <div className="bg-[#131d38] p-3.5 rounded-2xl border border-[#203056] shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  <span>1. 희망 모임 장소 투표 (복수 선택 가능)</span>
                </label>
                <span className="text-[10px] text-slate-400">
                  선택: {selectedLocations.length}곳
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {meeting.locations.map((loc) => {
                  const isSelected = selectedLocations.includes(loc);
                  return (
                    <div
                      key={loc}
                      onClick={() => handleLocationToggle(loc)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition select-none ${
                        isSelected
                          ? 'bg-amber-950/60 border-amber-500 text-amber-200 shadow-md shadow-amber-950/40'
                          : 'bg-[#090f21] border-[#23355e] text-slate-300 hover:bg-[#15223e]'
                      }`}
                    >
                      <span className="text-xs font-bold flex items-center gap-2">
                        <MapPin
                          className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`}
                        />
                        {loc}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMapTargetLocation(loc);
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-[#142343] hover:bg-[#1e3463] text-sky-300 border border-[#263e70] flex items-center gap-1 transition active:scale-95"
                          title="지도 확인"
                        >
                          <Compass className="w-3 h-3 text-sky-400" />
                          <span>지도</span>
                        </button>
                        <div
                          className={`w-5 h-5 rounded-lg flex items-center justify-center border transition ${
                            isSelected
                              ? 'bg-amber-500 border-amber-400 text-black'
                              : 'border-[#2e416a] text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. 📅 Date Selection Legend */}
          <div className="flex items-center justify-around py-2 px-3 bg-[#131d38] rounded-xl border border-[#203056] text-[11px] font-semibold text-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <span>정시 참석 ({meetingTime})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-500 shadow-sm shadow-amber-500/50" />
              <span>늦게 참석 (늦참)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#1f2d50]" />
              <span>불가</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 px-1">
            💡 <strong>1번 탭</strong>: 정시 참석({meetingTime}) 지정 | <strong>선택된 날짜 탭</strong>: 늦은 참석(늦참) 설정 또는 <strong>선택 취소(해제)</strong>
          </p>

          {/* Multi-month Continuous Calendar Grid */}
          <div className="space-y-6">
            {monthsData.map((month) => (
              <div key={month.monthLabel} className="bg-[#131d38] rounded-2xl border border-[#203056] p-4 shadow-xl">
                <h3 className="text-sm font-black text-white mb-3">{month.monthLabel}</h3>

                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['일', '월', '화', '수', '목', '금', '토'].map((w, idx) => (
                    <span
                      key={w}
                      className={`text-[11px] font-bold ${
                        idx === 0 ? 'text-rose-400' : idx === 6 ? 'text-sky-400' : 'text-slate-500'
                      }`}
                    >
                      {w}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {month.days.map((day, idx) => {
                    const sel = mySelections[day.dateStr];
                    const isCandidate = day.isCandidate !== false;
                    const isSelectable = day.isInRange && day.isCurrentMonth && isCandidate;

                    // If in range but excluded from candidate days by host
                    if (day.isInRange && day.isCurrentMonth && !isCandidate) {
                      return (
                        <div
                          key={idx}
                          onClick={() => toast('주관자가 후보일에서 제외한 날짜입니다.', 'info')}
                          className="h-12 rounded-xl flex flex-col items-center justify-center relative select-none bg-[#090f20]/50 text-slate-600 border border-slate-800/40 cursor-not-allowed opacity-35"
                          title="후보 제외된 날짜"
                        >
                          <span className="text-xs line-through text-slate-500">{day.dayNumber}</span>
                          <span className="text-[8px] text-slate-500 font-medium leading-none mt-0.5">제외</span>
                        </div>
                      );
                    }

                    let bgClass = 'bg-[#080d1e] text-slate-600 cursor-not-allowed opacity-40';
                    if (isSelectable) {
                      if (sel?.type === 'ALL_DAY') {
                        bgClass =
                          'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/40 scale-95 border border-emerald-400';
                      } else if (sel?.type === 'CONDITIONAL') {
                        bgClass =
                          'bg-amber-600 text-white font-bold shadow-md shadow-amber-600/40 scale-95 border border-amber-400';
                      } else {
                        bgClass =
                          'bg-[#182444] hover:bg-[#203056] text-slate-200 border border-[#253966] active:scale-95';
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
                          <span className="text-[9px] text-emerald-100 font-bold mt-0.5">정시</span>
                        )}
                        {sel?.type === 'CONDITIONAL' && (
                          <span className="text-[9px] text-amber-100 font-medium truncate max-w-[42px] px-0.5 mt-0.5">
                            {sel.note?.replace('경 합류', '')?.replace(' 가능', '') || '늦참'}
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

      {/* TAB 2: Aggregated Results */}
      {activeTab === 'RESULTS' && (
        <div className="p-4 flex-1 space-y-4">
          {/* 👑 Host Decision Box OR Participant Status Box */}
          <div className="p-3 rounded-2xl bg-[#111c34] border border-[#20345e] flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isHostUser ? (
                <Crown className="w-5 h-5 text-amber-400" />
              ) : (
                <Users className="w-5 h-5 text-sky-400" />
              )}
              <div>
                <p className="text-xs font-bold text-white">
                  {isHostUser ? '주관자(개설자) 모드' : '모임 참여자 모드'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {isHostUser
                    ? '최종 일자와 장소를 결정하여 공식 확정 공지를 발송할 수 있습니다.'
                    : '주관자가 투표 결과를 토대로 최종 일정을 공지할 예정입니다.'}
                </p>
              </div>
            </div>
            {!isHostUser ? (
              <button
                onClick={handleParticipantShareStatus}
                className="px-2.5 py-1 text-[11px] font-bold bg-[#172c54] hover:bg-[#203d75] text-sky-300 rounded-lg border border-[#2d508f] whitespace-nowrap transition"
              >
                투표 현황 공유
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className="px-2.5 py-1 text-[11px] font-bold bg-[#1d2d4f] hover:bg-[#283e6b] text-amber-300 rounded-lg border border-amber-500/30 whitespace-nowrap transition active:scale-95 flex items-center gap-1"
                title="일정·장소·시간 수정 (재투표)"
              >
                <Edit3 className="w-3 h-3" />
                <span>일정·장소 수정</span>
              </button>
            )}
          </div>

          {/* 전원 가능일 0일 시 특별 알림 배너 */}
          {responses.length >= meeting.targetCount && fullMatches.length === 0 && (
            <div className="p-3.5 bg-gradient-to-r from-[#24170e] to-[#1c130b] border border-amber-500/50 rounded-2xl flex items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-base flex-shrink-0">
                  ⚠️
                </div>
                <div>
                  <p className="text-xs font-black text-amber-300">
                    전원 일치일 0일 (결과 확인 완료)
                  </p>
                  <p className="text-[11px] text-slate-300">
                    {isHostUser
                      ? '일정·장소를 변경하여 재투표를 시작하거나 차선책으로 공지하세요.'
                      : '주관자가 일정 재조정 또는 차선책 결정을 안내할 예정입니다.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowZeroMatchModal(true)}
                className="px-2.5 py-1.5 text-[11px] font-black bg-amber-500 hover:bg-amber-400 text-black rounded-xl whitespace-nowrap transition shadow-md shadow-amber-500/20 active:scale-95"
              >
                결과 상세
              </button>
            </div>
          )}

          {/* 📊 1. 투표 핵심 요약 대시보드 (KPI Summary Board) */}
          <div className="bg-[#131d38] p-4 rounded-2xl border border-[#203056] shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sky-400">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-black text-white">투표 종합 요약</h3>
              </div>
              <span className="text-[11px] text-slate-400">
                참여 완료 <strong className="text-white">{responses.length}/{meeting?.targetCount || 4}명</strong> ({meeting && meeting.targetCount > 0 ? Math.round((responses.length / meeting.targetCount) * 100) : 0}%)
              </span>
            </div>

            <div className={`grid ${meeting.locations && meeting.locations.length > 0 ? 'grid-cols-2' : 'grid-cols-1'} gap-2.5`}>
              {/* 전원 가능일 KPI 카드 */}
              <div
                onClick={() => {
                  if (pureFullMatches.length > 0) {
                    setInspectDate(pureFullMatches[0].date);
                  } else if (conditionalFullMatches.length > 0) {
                    setInspectDate(conditionalFullMatches[0].date);
                  } else if (responses.length >= meeting.targetCount) {
                    setShowZeroMatchModal(true);
                  } else if (bestMatches.length > 0) {
                    setInspectDate(bestMatches[0].date);
                  }
                }}
                className={`p-3 rounded-xl border transition cursor-pointer select-none ${
                  pureFullMatches.length > 0
                    ? 'bg-gradient-to-br from-emerald-950/60 to-[#0d2625] border-emerald-500/50 hover:border-emerald-400 shadow-sm shadow-emerald-500/20'
                    : conditionalFullMatches.length > 0
                    ? 'bg-gradient-to-br from-amber-950/60 to-[#261f0d] border-amber-500/50 hover:border-amber-400 shadow-sm shadow-amber-500/20'
                    : 'bg-[#0a1426] border-[#1c2d52]'
                }`}
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3 text-emerald-400" />
                    <span>전원 가능일</span>
                  </span>
                  {fullMatches.length > 0 ? (
                    <span className="text-[9px] font-black text-emerald-300 bg-emerald-900/80 px-1 py-0.2 rounded">
                      터치 시 확인
                    </span>
                  ) : responses.length >= meeting.targetCount ? (
                    <span className="text-[9px] font-black text-amber-300 bg-amber-900/80 px-1 py-0.2 rounded">
                      결과 보기
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-col">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-xl font-black ${pureFullMatches.length > 0 ? 'text-emerald-400' : conditionalFullMatches.length > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {fullMatches.length > 0 ? `${fullMatches.length}일` : '0일'}
                    </span>
                    {fullMatches.length > 0 && (
                      <span className="text-[10px] font-bold text-slate-300">
                        선택 가능 🌟
                      </span>
                    )}
                  </div>
                  {fullMatches.length > 0 ? (
                    <div className="flex items-center gap-1 text-[10px] font-bold mt-0.5">
                      {pureFullMatches.length > 0 && (
                        <span className="text-emerald-400">🟢 정시 {pureFullMatches.length}</span>
                      )}
                      {conditionalFullMatches.length > 0 && (
                        <span className="text-amber-400">🟠 늦참 {conditionalFullMatches.length}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      (최다 {bestMatches[0]?.totalAvailableCount || 0}명)
                    </span>
                  )}
                </div>
              </div>

              {/* 선호 장소 KPI 카드 (장소 후보가 등록된 경우에만 표시) */}
              {meeting.locations && meeting.locations.length > 0 && (
                <div className="p-3 rounded-xl bg-[#0a1426] border border-[#1c2d52]">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-bold flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-amber-400" />
                      <span>{topLocations.length > 1 ? '공동 1위 장소' : '선호 1위 장소'}</span>
                    </span>
                    {maxLocationVotes > 0 && (
                      <span className="text-[9px] font-black text-amber-400 bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-600/40">
                        {topLocations.length > 1 ? '공동 1위 👑' : '1위 👑'}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5">
                    {maxLocationVotes > 0 ? (
                      <div>
                        <p className="text-xs sm:text-sm font-black text-amber-300 leading-snug break-keep">
                          {topLocations.map((l) => l.location).join(', ')}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {topLocations.map((l) => (
                            <button
                              key={l.location}
                              type="button"
                              onClick={() => setMapTargetLocation(l.location)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#142343] hover:bg-[#1f3768] text-sky-300 border border-[#263e70] transition active:scale-95"
                            >
                              <Compass className="w-2.5 h-2.5 text-sky-400" />
                              <span>{l.location} 지도</span>
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 mt-1">
                          {topLocations.length > 1
                            ? `총 ${topLocations.length}곳 각 ${maxLocationVotes}표 동률`
                            : `${maxLocationVotes}표 획득`}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium">아직 투표 없음</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 원클릭 가이드 안내문 */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090f21] border border-[#1c2d52] text-[11px] text-slate-300">
              <span className="text-sm flex-shrink-0">💡</span>
              <span className="leading-snug">
                캘린더에서 <strong className="text-emerald-400">초록색(정시 가능)</strong> 또는 <strong className="text-amber-400">주황색(늦참 포함)</strong> 날짜를 터치하면 상세 명단 확인 및 
                {isHostUser ? <strong className="text-amber-400"> [확정 공지]</strong> : ' [현황 공유]'}가 가능합니다.
              </span>
            </div>
          </div>

          {/* 📍 2. Location Vote Results (공동 순위 타이 브레이크 지원) */}
          {locationVotes.length > 0 && (
            <div className="bg-[#131d38] p-4 rounded-2xl border border-[#203056] shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-amber-300">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-black">장소 선호도 투표 결과</h3>
                </div>
                {topLocations.length > 1 && maxLocationVotes > 0 && (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-600/40">
                    공동 1위 {topLocations.length}곳 동률
                  </span>
                )}
              </div>

              <div className="space-y-2.5">
                {locationVotes.map((loc, idx) => {
                  const rankInfo = getLocationRank(loc, idx);
                  return (
                    <div key={loc.location} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <span className={rankInfo.badgeClass}>{rankInfo.label}</span>
                          <span>{loc.location}</span>
                          <button
                            type="button"
                            onClick={() => setMapTargetLocation(loc.location)}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#142343] hover:bg-[#1e3463] text-sky-300 border border-[#263e70] flex items-center gap-0.5 transition active:scale-95"
                            title="지도 확인"
                          >
                            <Compass className="w-2.5 h-2.5 text-sky-400" />
                            <span>지도</span>
                          </button>
                        </span>
                        <span className="text-slate-300 text-[11px] font-semibold">
                          {loc.votes}표 ({loc.percentage}%)
                        </span>
                      </div>

                      <div className="w-full h-2 rounded-full bg-[#090f21] overflow-hidden border border-[#1e2d4d]">
                        <div
                          className={`h-full transition-all duration-500 rounded-full ${
                            rankInfo.isTop
                              ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${loc.percentage}%` }}
                        />
                      </div>

                      {loc.voters.length > 0 && (
                        <p className="text-[10px] text-slate-400 pl-1">
                          선택: {loc.voters.join(', ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Heatmap Legend */}
          <div className="flex items-center justify-around py-2 px-3 bg-[#131d38] rounded-xl border border-[#203056] text-[10px] font-semibold text-slate-300">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <span>전원 정시 ({meetingTime})</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-amber-500 shadow-sm shadow-amber-500/50" />
              <span>전원 가능 (늦참 포함)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-blue-500" />
              <span>과반수</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-[#1f2d50]" />
              <span>불가</span>
            </div>
          </div>

          {/* Multi-month Heatmap Calendar */}
          <div className="space-y-6">
            {monthsData.map((month) => (
              <div key={month.monthLabel} className="bg-[#131d38] rounded-2xl border border-[#203056] p-4 shadow-xl">
                <h3 className="text-sm font-black text-white mb-3">{month.monthLabel}</h3>

                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['일', '월', '화', '수', '목', '금', '토'].map((w, idx) => (
                    <span
                      key={w}
                      className={`text-[11px] font-bold ${
                        idx === 0 ? 'text-rose-400' : idx === 6 ? 'text-sky-400' : 'text-slate-500'
                      }`}
                    >
                      {w}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {month.days.map((day, idx) => {
                    const agg = aggregatedResults[day.dateStr];
                    const isCandidate = day.isCandidate !== false;
                    const isSelectable = day.isInRange && day.isCurrentMonth && isCandidate;
                    const totalResp = responses.length;

                    // If in range but excluded from candidate days by host
                    if (day.isInRange && day.isCurrentMonth && !isCandidate) {
                      return (
                        <div
                          key={idx}
                          onClick={() => toast('주관자가 후보일에서 제외한 날짜입니다.', 'info')}
                          className="h-12 rounded-xl flex flex-col items-center justify-center relative select-none bg-[#090f20]/50 text-slate-600 border border-slate-800/40 cursor-not-allowed opacity-35"
                          title="후보 제외된 날짜"
                        >
                          <span className="text-xs line-through text-slate-500">{day.dayNumber}</span>
                          <span className="text-[8px] text-slate-500 font-medium leading-none mt-0.5">제외</span>
                        </div>
                      );
                    }

                    let bgClass = 'bg-[#080d1e] text-slate-700 opacity-40';
                    let extraGlow = '';
                    let isAllDayFull = false;
                    let isConditionalFull = false;

                    if (isSelectable && agg && totalResp > 0) {
                      const isFullMatch = agg.isFullMatch;
                      isAllDayFull = isFullMatch && agg.conditionalCount === 0;
                      isConditionalFull = isFullMatch && agg.conditionalCount > 0;
                      const isMajority = agg.totalAvailableCount >= Math.ceil(totalResp / 2);

                      if (isAllDayFull) {
                        // 🟢 전원 종일 가능 (아무 제약 없는 날)
                        bgClass = 'bg-emerald-600 text-white font-bold cursor-pointer border border-emerald-400';
                        extraGlow = 'glow-full-match';
                      } else if (isConditionalFull) {
                        // 🟠 전원 가능하지만 조건부 포함된 날 (스마트 리 피드백 반영!)
                        bgClass = 'bg-amber-600 text-white font-bold cursor-pointer border border-amber-400';
                        extraGlow = 'glow-conditional-match';
                      } else if (isMajority) {
                        // 🔵 과반수 가능
                        bgClass = agg.conditionalCount > 0
                          ? 'bg-blue-900/90 text-amber-200 font-semibold cursor-pointer border border-amber-500/50'
                          : 'bg-blue-900/80 text-sky-200 font-semibold cursor-pointer border border-blue-500/60';
                      } else if (agg.conditionalCount > 0) {
                        // 🟠 소수 조건부 가능
                        bgClass = 'bg-amber-950/80 text-amber-200 font-semibold cursor-pointer border border-amber-600/60';
                      } else {
                        bgClass = 'bg-[#182444] text-slate-300 border border-[#253966] cursor-pointer';
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
                            className={`text-[9px] font-bold mt-0.5 px-1 rounded flex items-center gap-0.5 ${
                              isAllDayFull
                                ? 'bg-emerald-800 text-emerald-100'
                                : isConditionalFull
                                ? 'bg-amber-800 text-amber-100'
                                : agg.conditionalCount > 0
                                ? 'bg-amber-950 text-amber-300'
                                : 'text-slate-400'
                            }`}
                          >
                            <span>{agg.totalAvailableCount}/{totalResp}명</span>
                            {agg.conditionalCount > 0 && <span className="text-[8px]">🟠</span>}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Inspect Date Bottom Sheet Modal */}
          {inspectDate && (
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
              onClick={() => setInspectDate(null)}
            >
              <div
                className="w-full max-w-md bg-[#131d38] rounded-3xl p-5 shadow-2xl border border-[#2b3d68] animate-in slide-in-from-bottom duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 border-b border-[#1c2944]">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-extrabold text-white">{inspectDate}</h4>
                      {aggregatedResults[inspectDate]?.isFullMatch ? (
                        aggregatedResults[inspectDate]?.conditionalCount === 0 ? (
                          <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-black rounded-md shadow-sm shadow-emerald-500/50">
                            전원 정시 참석 ({meetingTime}) 🌟
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-600 text-white text-[10px] font-black rounded-md shadow-sm shadow-amber-500/50">
                            전원 가능 (늦참 {aggregatedResults[inspectDate]?.conditionalCount}명) 🟠
                          </span>
                        )
                      ) : (
                        <span className="px-2 py-0.5 bg-blue-600/80 text-white text-[10px] font-bold rounded-md">
                          {aggregatedResults[inspectDate]?.totalAvailableCount || 0}/{responses.length}명 가능
                          {aggregatedResults[inspectDate]?.conditionalCount > 0 && ' (늦참 포함)'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {aggregatedResults[inspectDate]?.conditionalCount > 0 && (
                        <span className="text-amber-300 font-semibold mr-1.5">
                          정시 {aggregatedResults[inspectDate]?.allDayCount}명 · 늦참 {aggregatedResults[inspectDate]?.conditionalCount}명 |
                        </span>
                      )}
                      {topLocations.length > 1
                        ? `선호 장소: ${topLocations.map((l) => l.location).join(', ')} (공동 1위 각 ${maxLocationVotes}표)`
                        : topLocations.length === 1
                        ? `선호 1위 장소: ${topLocations[0].location} (${maxLocationVotes}표)`
                        : '참석자별 가능 여부'}
                    </p>
                  </div>
                  <button
                    onClick={() => setInspectDate(null)}
                    className="p-1.5 hover:bg-[#1a294c] rounded-full text-slate-400 hover:text-white transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-3 space-y-2 max-h-52 overflow-y-auto pr-1">
                  {responses.map((r) => {
                    const sel = r.selections[inspectDate];
                    return (
                      <div
                        key={r.participantName}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#090f21] border border-[#203056] text-xs"
                      >
                        <span className="font-bold text-slate-200">{r.participantName}</span>
                        {sel?.type === 'ALL_DAY' && (
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 font-bold rounded-md border border-emerald-700">
                            정시 참석 ({meetingTime}) 🟢
                          </span>
                        )}
                        {sel?.type === 'CONDITIONAL' && (
                          <span className="px-2 py-0.5 bg-amber-950 text-amber-300 font-bold rounded-md border border-amber-700">
                            {sel.note || '늦게 참석'} 🟠
                          </span>
                        )}
                        {(!sel || sel.type === 'UNAVAILABLE') && (
                          <span className="px-2 py-0.5 bg-[#17223e] text-slate-400 font-medium rounded-md border border-[#23355e]">
                            참석 불가 ❌
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isHostUser ? (
                  <button
                    onClick={() => handleHostFinalAnnouncement(inspectDate)}
                    className="w-full mt-4 py-3 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 active:scale-[0.98]"
                  >
                    <Crown className="w-4 h-4" />
                    <span>이 날짜({meetingTime})로 주관자 최종 확정 공지 복사</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleParticipantShareStatus()}
                    className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/25 active:scale-[0.98]"
                  >
                    투표 현황 카톡으로 공유
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Subtle footer for guests */}
          {!isHostUser && (
            <div className="pt-6 pb-2 text-center">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#101b33] hover:bg-[#16274a] text-slate-400 hover:text-sky-300 text-[11px] font-semibold border border-[#1e2f54] transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>나도 새로운 약속 모임 만들기</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Action Bar */}
      {activeTab === 'VOTE' && (
        <div className="fixed bottom-0 inset-x-0 z-30 flex justify-center p-4 bg-gradient-to-t from-[#0b1329] via-[#0b1329]/95 to-transparent">
          <div className="w-full max-w-md">
            <button
              onClick={handleSubmitResponse}
              disabled={isSubmitting}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-extrabold rounded-2xl shadow-xl shadow-blue-600/35 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="text-sm">일정 및 장소 저장 중...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-sky-200" />
                  <span className="text-sm">
                    {hasSubmitted ? '내 투표 수정하여 다시 제출' : '내 투표 확정 제출하기'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 🗓️ DATE ACTION MODAL (설정 변경 및 확실한 선택 취소!) */}
      {dateModalTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#131d38] w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-[#2b3d68] animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c2944]">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-sky-400" />
                <h4 className="text-sm font-extrabold text-white">
                  {dateModalTarget} 일정 설정
                </h4>
              </div>
              <button
                onClick={() => setDateModalTarget(null)}
                className="p-1 hover:bg-[#1a294c] rounded-full text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 기준 시간 안내 배너 */}
            <div className="mt-2.5 p-2 rounded-xl bg-[#090f21] border border-sky-500/30 flex items-center justify-between text-xs">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>모임 시작 예정:</span>
              </span>
              <strong className="text-sky-300 font-bold px-2 py-0.5 bg-[#152037] rounded-md border border-[#23355e]">
                {meetingTime}
              </strong>
            </div>

            <p className="text-[11px] text-slate-400 mt-2">
              정시 참석이 어려우시면 늦게 도착하는 시간(늦참)을 선택해 주세요.
            </p>

            {/* Quick Presets for Late Arrival based on meetingTime */}
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {[
                { label: `+30분 늦참 (${addMinutesToTime(meetingTime, 30)}경)`, val: `${addMinutesToTime(meetingTime, 30)}경 합류 (+30분 늦참)` },
                { label: `+1시간 늦참 (${addMinutesToTime(meetingTime, 60)}경)`, val: `${addMinutesToTime(meetingTime, 60)}경 합류 (+1시간 늦참)` },
                { label: `+1.5시간 늦참 (${addMinutesToTime(meetingTime, 90)}경)`, val: `${addMinutesToTime(meetingTime, 90)}경 합류 (+1.5시간 늦참)` },
                { label: `2차부터 합류 (${addMinutesToTime(meetingTime, 120)}경)`, val: `${addMinutesToTime(meetingTime, 120)}경 2차부터 합류` },
              ].map((preset) => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => setDateModalNote(preset.val)}
                  className={`p-2.5 text-[11px] font-bold rounded-xl border transition text-left ${
                    dateModalNote === preset.val
                      ? 'bg-amber-600 text-white border-amber-400'
                      : 'bg-[#090f21] hover:bg-[#182444] text-slate-300 border-[#23355e]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-2.5">
              <input
                type="text"
                placeholder="직접 입력: 예) 20:30 도착 예정, 야근 후 합류"
                value={dateModalNote}
                onChange={(e) => setDateModalNote(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* 3 Core Action Buttons */}
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleModalSetAllDay}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/30 transition flex flex-col items-center justify-center leading-tight"
                >
                  <span>🟢 정시 참석</span>
                  <span className="text-[10px] text-emerald-200">({meetingTime}부터)</span>
                </button>
                <button
                  type="button"
                  onClick={handleModalSetConditional}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-md shadow-amber-600/30 transition flex flex-col items-center justify-center leading-tight"
                >
                  <span>🟠 늦게 참석</span>
                  <span className="text-[10px] text-amber-200">(늦참 등록)</span>
                </button>
              </div>

              {/* 🌟 Clear Deselect Button (확실한 지정 취소!) */}
              <button
                type="button"
                onClick={handleModalDeselect}
                className="w-full py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>이 날짜 참석 불가 (선택 해제)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host Auth Modal (주관자 인증 모달) */}
      {showHostAuthModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#131d38] w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-amber-500/40 animate-in zoom-in duration-200">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-3">
                <Crown className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-white">주관자(개설자) 인증</h3>
              <p className="text-xs text-slate-400 mt-1">
                이 모임을 개설한 본인인가요? 개설자 닉네임을 입력하시면 주관자 권한이 부여됩니다.
              </p>
            </div>

            <input
              type="text"
              placeholder={`개설자 닉네임 입력 (예: ${meeting.hostName})`}
              value={inputHostPin}
              onChange={(e) => setInputHostPin(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-[#090f21] border border-[#23355e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 mb-3"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowHostAuthModal(false)}
                className="flex-1 py-2.5 bg-[#17223e] hover:bg-[#203056] text-slate-300 text-xs font-bold rounded-xl border border-[#283d6a]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleManualHostAuth}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-xl shadow-lg shadow-amber-500/30"
              >
                인증하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Share Drawer / Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#131d38] w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-[#2b3d68] animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c2944]">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-sky-400" />
                <h4 className="text-sm font-extrabold text-white">친구 초대 및 공유</h4>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-1 hover:bg-[#1a294c] rounded-full text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-2">
              친구들이 설치 없이 바로 접속해서 투표할 수 있는 링크입니다.
            </p>

            <div className="my-3 p-2.5 bg-[#090f21] rounded-xl border border-[#23355e] flex items-center justify-between">
              <span className="text-[11px] text-slate-300 font-mono truncate mr-2 select-all">
                {getFullShareUrl()}
              </span>
              <button
                onClick={handleCopyLink}
                className="px-2.5 py-1 text-[11px] font-bold bg-[#1e3461] hover:bg-[#254178] text-sky-300 rounded-lg whitespace-nowrap transition"
              >
                복사
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleCopyInvitation()}
                className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 transition"
              >
                <Share2 className="w-4 h-4 text-white" />
                <span>💌 투표 초대장 복사 (SNS·메신저 공유)</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full py-2.5 bg-[#17223e] hover:bg-[#203056] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-[#283d6a] transition"
              >
                <Copy className="w-4 h-4 text-sky-400" />
                <span>초대 링크만 클립보드 복사</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Room Confirmation Modal (Host Only) */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#131d38] w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-rose-500/40 animate-in zoom-in duration-200">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <h3 className="text-base font-bold text-white">이 약속방을 삭제하시겠습니까?</h3>
              <p className="text-xs text-slate-400 mt-1">
                현재까지의 참여자 투표 데이터와 초대 링크가 영구히 삭제됩니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 bg-[#17223e] hover:bg-[#203056] text-slate-300 text-xs font-bold rounded-xl border border-[#283d6a]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteThisRoom}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/30"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎉 Full Match Celebration Popup */}
      {showCelebration && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#121c35] w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-emerald-500/50 text-center animate-in zoom-in duration-200">
            <span className="text-4xl">✨</span>
            <h3 className="text-lg font-black text-white mt-2">
              전원 참석 가능한 날을 찾았습니다!
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              목표 인원 {responses.length}명 모두가 가능한 황금 약속일입니다.
            </p>

            <div className="my-4 space-y-2">
              {fullMatches.slice(0, 3).map((item, idx) => (
                <div
                  key={item.date}
                  className="p-3 bg-[#0a1224] border border-emerald-500/30 rounded-2xl text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-400">
                      {idx === 0 ? '🥇 1순위 추천일' : idx === 1 ? '🥈 2순위 추천일' : `후보 ${idx + 1}`}
                    </span>
                    <span className="text-xs font-extrabold text-white">{item.date}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    전원 가능 (정시 {item.allDayCount}명
                    {item.conditionalCount > 0 && `, 늦참 ${item.conditionalCount}명`})
                  </p>
                </div>
              ))}

              {maxLocationVotes > 0 && topLocations.length > 0 && (
                <div className="p-3 bg-[#1c180d] border border-amber-500/40 rounded-2xl text-left flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-amber-400">
                      {topLocations.length > 1 ? '📍 선호도 공동 1위 장소' : '📍 가장 선호하는 모임 장소'}
                    </span>
                    <p className="text-xs font-extrabold text-white mt-0.5">
                      {topLocations.map((l) => l.location).join(', ')} ({topLocations.length > 1 ? `각 ${maxLocationVotes}표 동률` : `${maxLocationVotes}표`})
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setMapTargetLocation(topLocations[0].location)}
                      className="px-2 py-1 bg-[#261f0d] hover:bg-[#382d13] text-amber-300 text-[10px] font-bold rounded-lg border border-amber-500/40 flex items-center gap-1 transition active:scale-95"
                    >
                      <Compass className="w-3 h-3 text-sky-400" />
                      <span>지도</span>
                    </button>
                    <span className="px-2 py-0.5 bg-amber-500 text-black text-[10px] font-black rounded-lg">
                      {topLocations.length > 1 ? '공동 1위' : '1위'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {isHostUser ? (
                <button
                  onClick={() => handleHostFinalAnnouncement(fullMatches[0]?.date || bestMatches[0]?.date || '')}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold rounded-xl shadow-lg shadow-amber-500/30 transition flex items-center justify-center gap-1.5"
                >
                  <Crown className="w-4 h-4" />
                  <span>주관자 최종 확정 공지 복사</span>
                </button>
              ) : (
                <button
                  onClick={handleParticipantShareStatus}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-blue-600/30 transition"
                >
                  투표 현황 단톡방 공유
                </button>
              )}
              <button
                onClick={() => setShowCelebration(false)}
                className="w-full py-2 text-xs font-bold text-slate-400 hover:text-white"
              >
                캘린더 자세히 보기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚠️ Zero Match (전원 가능일 0일) Result Popup Modal */}
      {showZeroMatchModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#101b33] w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-amber-500/40 text-center animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center text-2xl mb-2">
              📅❌
            </div>
            <h3 className="text-lg font-black text-white mt-1">
              전원 참석 가능한 날이 없습니다 😢
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              목표 인원 <strong>{responses.length}명</strong> 모두 투표를 마쳤으나,<br />
              아쉽게도 모든 분의 일정이 겹치는 황금 날짜를 찾지 못했습니다.
            </p>

            {/* Best Alternative Card */}
            <div className="my-4 space-y-2">
              {bestMatches.length > 0 && (
                <div className="p-3.5 bg-[#0a1224] border border-sky-500/40 rounded-2xl text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-sky-400">
                      🥈 가장 많이 모일 수 있는 차선책
                    </span>
                    <span className="text-xs font-extrabold text-white">
                      {bestMatches[0].date}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 mt-1 font-bold">
                    최대 {bestMatches[0].totalAvailableCount}/{responses.length}명 참석 가능
                    <span className="text-slate-400 text-[11px] font-normal ml-1">
                      (정시 {bestMatches[0].allDayCount}명
                      {bestMatches[0].conditionalCount > 0 && `, 늦참 ${bestMatches[0].conditionalCount}명`})
                    </span>
                  </p>
                </div>
              )}

              {topLocations.length > 0 && maxLocationVotes > 0 && (
                <div className="p-3 bg-[#1c180d] border border-amber-500/40 rounded-2xl text-left flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-amber-400">
                      {topLocations.length > 1 ? '📍 선호도 공동 1위 장소' : '📍 가장 선호하는 모임 장소'}
                    </span>
                    <p className="text-xs font-extrabold text-white mt-0.5">
                      {topLocations.map((l) => l.location).join(', ')} ({maxLocationVotes}표)
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setMapTargetLocation(topLocations[0].location)}
                      className="px-2 py-1 bg-[#261f0d] hover:bg-[#382d13] text-amber-300 text-[10px] font-bold rounded-lg border border-amber-500/40 flex items-center gap-1 transition active:scale-95"
                    >
                      <Compass className="w-3 h-3 text-sky-400" />
                      <span>지도</span>
                    </button>
                    <span className="px-2 py-0.5 bg-amber-500 text-black text-[10px] font-black rounded-lg">
                      1위
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {isHostUser ? (
                <>
                  <button
                    onClick={() => {
                      setShowZeroMatchModal(false);
                      setShowEditModal(true);
                    }}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold rounded-xl shadow-lg shadow-amber-500/30 transition flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>✏️ 일정·장소 수정하여 재투표 열기</span>
                  </button>

                  {bestMatches.length > 0 && (
                    <button
                      onClick={() => handleHostAlternativeAnnouncement(bestMatches[0].date)}
                      className="w-full py-2.5 bg-[#17274a] hover:bg-[#203666] text-sky-300 text-xs font-bold rounded-xl border border-[#2b4478] transition flex items-center justify-center gap-1.5"
                    >
                      <span>🥈 차선책({bestMatches[0].totalAvailableCount}명 참석) 공지 복사</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[11px] text-slate-400 py-1">
                    💡 주관자가 일정을 재조정(재투표)하거나 차선책 일정을 결정하여 공지할 예정입니다.
                  </p>
                  <button
                    onClick={handleParticipantShareStatus}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-blue-600/30 transition active:scale-[0.98]"
                  >
                    투표 결과 현황 단톡방 공유
                  </button>
                </>
              )}

              <button
                onClick={() => setShowZeroMatchModal(false)}
                className="w-full py-2 text-xs font-bold text-slate-400 hover:text-white"
              >
                캘린더 자세히 보기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✏️ Host Edit Plan Modal (일정/장소/시간 수정 및 재투표 세팅) */}
      {showEditModal && meeting && (
        <EditPlanModal
          meeting={meeting}
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onUpdated={handleMeetingUpdated}
        />
      )}

      {/* 🗺️ Location Map Modal */}
      {mapTargetLocation && (
        <MapModal
          location={mapTargetLocation}
          onClose={() => setMapTargetLocation(null)}
        />
      )}
    </div>
  );
}
