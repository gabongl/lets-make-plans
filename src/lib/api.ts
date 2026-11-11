import { Meeting, ParticipantResponse, DateSelection } from '@/types';

const LOCAL_STORAGE_KEY_MEETINGS = 'lets_make_plans_db_meetings';
const LOCAL_STORAGE_KEY_RESPONSES = 'lets_make_plans_db_responses';

function getLocalData() {
  let meetings: Record<string, Meeting> = {};
  let responses: Record<string, ParticipantResponse[]> = {};
  try {
    const mStr = localStorage.getItem(LOCAL_STORAGE_KEY_MEETINGS);
    if (mStr) meetings = JSON.parse(mStr);
    const rStr = localStorage.getItem(LOCAL_STORAGE_KEY_RESPONSES);
    if (rStr) responses = JSON.parse(rStr);
  } catch {}
  return { meetings, responses };
}

function saveLocalData(meetings: Record<string, Meeting>, responses: Record<string, ParticipantResponse[]>) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_MEETINGS, JSON.stringify(meetings));
    localStorage.setItem(LOCAL_STORAGE_KEY_RESPONSES, JSON.stringify(responses));
  } catch {}
}

export const api = {
  async createMeeting(params: {
    title: string;
    hostName: string;
    startDate: string;
    endDate: string;
    candidateDates?: string[];
    targetCount: number;
    meetingTime?: string;
    description?: string;
    locations?: string[];
  }): Promise<{ meeting: Meeting; hostToken: string }> {
    const hostToken = 'host_' + Math.random().toString(36).substring(2, 10);

    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, hostToken }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.meeting) {
          try {
            localStorage.setItem(`host_token_${data.meeting.id}`, hostToken);
          } catch {}
          return { meeting: data.meeting, hostToken };
        }
      }
    } catch {
      // Fallback to local storage if API is offline
    }

    // Local fallback
    const id = `plan-${Math.random().toString(36).substring(2, 8)}`;
    const newMeeting: Meeting = {
      id,
      title: params.title.trim(),
      hostName: params.hostName.trim(),
      hostToken,
      startDate: params.startDate,
      endDate: params.endDate,
      candidateDates: params.candidateDates || [],
      targetCount: params.targetCount || 4,
      meetingTime: params.meetingTime || '19:00',
      description: params.description?.trim() || '',
      locations: params.locations || [],
      createdAt: new Date().toISOString(),
      responses: [],
    };
    const { meetings, responses } = getLocalData();
    meetings[id] = newMeeting;
    responses[id] = [];
    saveLocalData(meetings, responses);

    try {
      localStorage.setItem(`host_token_${id}`, hostToken);
    } catch {}

    return { meeting: newMeeting, hostToken };
  },

  async getMeeting(id: string): Promise<Meeting | null> {
    try {
      const res = await fetch(`/api/meetings/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.meeting) {
          return data.meeting;
        }
      }
    } catch {
      // fallback
    }

    const { meetings, responses } = getLocalData();
    const meeting = meetings[id];
    if (!meeting) return null;
    return {
      ...meeting,
      responses: responses[id] || [],
    };
  },

  async updateMeeting(
    id: string,
    params: {
      title?: string;
      startDate?: string;
      endDate?: string;
      candidateDates?: string[];
      targetCount?: number;
      meetingTime?: string;
      description?: string;
      locations?: string[];
    }
  ): Promise<Meeting> {
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.meeting) {
          const { meetings, responses } = getLocalData();
          meetings[id] = { ...data.meeting, responses: [] };
          responses[id] = [];
          saveLocalData(meetings, responses);

          try {
            const recents = JSON.parse(localStorage.getItem('lets_make_plans_recents') || '[]');
            const rIdx = recents.findIndex((p: any) => p.id === id);
            if (rIdx >= 0) {
              recents[rIdx] = {
                ...recents[rIdx],
                title: data.meeting.title,
                startDate: data.meeting.startDate,
                endDate: data.meeting.endDate,
                meetingTime: data.meeting.meetingTime,
              };
              localStorage.setItem('lets_make_plans_recents', JSON.stringify(recents));
            }
          } catch {}

          return data.meeting;
        }
      }
    } catch {}

    const { meetings, responses } = getLocalData();
    const meeting = meetings[id];
    if (meeting) {
      if (params.title !== undefined) meeting.title = params.title.trim();
      if (params.startDate !== undefined) meeting.startDate = params.startDate;
      if (params.endDate !== undefined) meeting.endDate = params.endDate;
      if (params.candidateDates !== undefined) meeting.candidateDates = params.candidateDates;
      if (params.targetCount !== undefined) meeting.targetCount = Number(params.targetCount) || meeting.targetCount;
      if (params.meetingTime !== undefined) meeting.meetingTime = params.meetingTime.trim();
      if (params.description !== undefined) meeting.description = params.description.trim();
      if (params.locations !== undefined) meeting.locations = params.locations;
      meeting.responses = [];
      responses[id] = [];
      saveLocalData(meetings, responses);

      try {
        const recents = JSON.parse(localStorage.getItem('lets_make_plans_recents') || '[]');
        const rIdx = recents.findIndex((p: any) => p.id === id);
        if (rIdx >= 0) {
          recents[rIdx] = {
            ...recents[rIdx],
            title: meeting.title,
            startDate: meeting.startDate,
            endDate: meeting.endDate,
            meetingTime: meeting.meetingTime,
          };
          localStorage.setItem('lets_make_plans_recents', JSON.stringify(recents));
        }
      } catch {}

      return meeting;
    }
    throw new Error('해당 모임을 찾을 수 없습니다.');
  },

  async deleteMeeting(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // continue to clean local
        }
      }
    } catch {
      // fallback
    }

    const { meetings, responses } = getLocalData();
    delete meetings[id];
    delete responses[id];
    saveLocalData(meetings, responses);

    // Clean up recents
    try {
      const recents = JSON.parse(localStorage.getItem('lets_make_plans_recents') || '[]');
      const filtered = recents.filter((p: any) => p.id !== id);
      localStorage.setItem('lets_make_plans_recents', JSON.stringify(filtered));
      localStorage.removeItem(`host_token_${id}`);
    } catch {}

    return true;
  },

  async submitResponse(
    meetingId: string,
    participantName: string,
    selections: Record<string, DateSelection>,
    selectedLocations: string[] = []
  ): Promise<{ response: ParticipantResponse; allResponses: ParticipantResponse[] }> {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantName, selections, selectedLocations }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return {
            response: data.response,
            allResponses: data.allResponses,
          };
        }
      }
    } catch {
      // fallback
    }

    const trimmedName = participantName.trim();
    const { meetings, responses } = getLocalData();
    const list = responses[meetingId] || [];
    const newResp: ParticipantResponse = {
      id: `resp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      meetingId,
      participantName: trimmedName,
      selectedLocations,
      selections,
      submittedAt: new Date().toISOString(),
    };
    const existingIdx = list.findIndex((r) => (r.participantName || '').trim() === trimmedName);
    if (existingIdx >= 0) {
      list[existingIdx] = newResp;
    } else {
      list.push(newResp);
    }
    responses[meetingId] = list;
    saveLocalData(meetings, responses);
    return { response: newResp, allResponses: list };
  },
};
