import { Meeting, ParticipantResponse } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// Environment variables for Lark Open Platform
const LARK_API_DOMAIN = process.env.LARK_API_DOMAIN || 'https://open.larksuite.com'; // or https://open.feishu.cn
const LARK_APP_ID = process.env.LARK_APP_ID || 'cli_a956e36179b8de15';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET || 'TDmS2UeL3bU3nE0MdUBrLbuMwEvXxyc7';
const LARK_BASE_TOKEN = process.env.LARK_BASE_TOKEN || 'ZGJZbg5gnamSsPs4Q6SjKUqJpqb'; // Base App Token from URL
const LARK_TABLE_MEETINGS = process.env.LARK_TABLE_MEETINGS || 'tblGaHgpPwH1iB3U';
const LARK_TABLE_RESPONSES = process.env.LARK_TABLE_RESPONSES || 'tbl5LZCZGu5SGLZw';

// Local fallback store for development or before Lark credentials are provided
interface LocalStore {
  meetings: Record<string, Meeting>;
  responses: Record<string, ParticipantResponse[]>;
}

// In-memory / file fallback store
let memoryStore: LocalStore = {
  meetings: {},
  responses: {},
};

const STORE_PATH = path.join(process.cwd(), '.local_data.json');

function loadLocalStore(): LocalStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = fs.readFileSync(STORE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // ignore error in serverless environments
  }
  return memoryStore;
}

function saveLocalStore(store: LocalStore) {
  memoryStore = store;
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // ignore file write errors in read-only serverless environments
  }
}

// Token cache for Lark
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getLarkTenantAccessToken(): Promise<string | null> {
  if (!LARK_APP_ID || !LARK_APP_SECRET) {
    return null;
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.token;
  }

  try {
    const res = await fetch(`${LARK_API_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: LARK_APP_ID,
        app_secret: LARK_APP_SECRET,
      }),
    });
    const json = await res.json();
    if (json.code === 0 && json.tenant_access_token) {
      cachedToken = {
        token: json.tenant_access_token,
        expiresAt: now + (json.expire - 120) * 1000,
      };
      return cachedToken.token;
    } else {
      console.warn('Lark token error:', json);
      return null;
    }
  } catch (err) {
    console.error('Failed to get Lark tenant access token:', err);
    return null;
  }
}

export const db = {
  isLarkConfigured(): boolean {
    return !!(LARK_APP_ID && LARK_APP_SECRET && LARK_BASE_TOKEN && LARK_TABLE_MEETINGS && LARK_TABLE_RESPONSES);
  },

  async createMeeting(meeting: Meeting): Promise<Meeting> {
    const token = await getLarkTenantAccessToken();

    if (token && LARK_BASE_TOKEN && LARK_TABLE_MEETINGS) {
      try {
        const res = await fetch(
          `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_MEETINGS}/records`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              fields: {
                meeting_id: meeting.id,
                title: meeting.title,
                host_name: meeting.hostName,
                start_date: meeting.startDate,
                end_date: meeting.endDate,
                candidate_dates: JSON.stringify(meeting.candidateDates || []),
                meeting_time: meeting.meetingTime || '19:00',
                target_count: meeting.targetCount,
                description: meeting.description || '',
                locations: JSON.stringify(meeting.locations || []),
                host_token: meeting.hostToken || '',
                created_at: meeting.createdAt,
              },
            }),
          }
        );
        const data = await res.json();
        if (data.code === 0) {
          return meeting;
        }
        console.warn('Lark createMeeting returned non-zero code, falling back to local store:', data);
      } catch (err) {
        console.error('Lark createMeeting error, falling back:', err);
      }
    }

    // Local fallback
    const store = loadLocalStore();
    store.meetings[meeting.id] = meeting;
    if (!store.responses[meeting.id]) {
      store.responses[meeting.id] = [];
    }
    saveLocalStore(store);
    return meeting;
  },

  async getMeeting(id: string): Promise<Meeting | null> {
    const token = await getLarkTenantAccessToken();

    if (token && LARK_BASE_TOKEN && LARK_TABLE_MEETINGS) {
      try {
        // Query meeting by meeting_id filter
        const res = await fetch(
          `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_MEETINGS}/records?filter=CurrentValue.[meeting_id]=%22${encodeURIComponent(
            id
          )}%22`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await res.json();
        if (data.code === 0 && data.data?.items?.length > 0) {
          const item = data.data.items[0];
          const fields = item.fields;
          let candidateDates: string[] | undefined;
          try {
            if (fields.candidate_dates) {
              candidateDates = JSON.parse(fields.candidate_dates);
            }
          } catch {}

          let locations: string[] = [];
          try {
            if (fields.locations) {
              locations = JSON.parse(fields.locations);
            }
          } catch {}

          const meeting: Meeting = {
            id: fields.meeting_id,
            title: fields.title,
            hostName: fields.host_name,
            startDate: fields.start_date,
            endDate: fields.end_date,
            candidateDates,
            meetingTime: fields.meeting_time || '19:00',
            targetCount: Number(fields.target_count || 4),
            description: fields.description || '',
            locations,
            hostToken: fields.host_token || '',
            createdAt: fields.created_at,
          };
          meeting.responses = await this.getResponses(id);
          return meeting;
        }
      } catch (err) {
        console.error('Lark getMeeting error, falling back:', err);
      }
    }

    // Local fallback
    const store = loadLocalStore();
    const meeting = store.meetings[id];
    if (!meeting) return null;
    meeting.responses = store.responses[id] || [];
    return meeting;
  },

  async updateMeeting(id: string, meeting: Meeting): Promise<Meeting> {
    const token = await getLarkTenantAccessToken();

    if (token && LARK_BASE_TOKEN && LARK_TABLE_MEETINGS) {
      try {
        // Find record_id first
        const searchRes = await fetch(
          `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_MEETINGS}/records?filter=CurrentValue.[meeting_id]=%22${encodeURIComponent(
            id
          )}%22`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();
        if (searchData.code === 0 && searchData.data?.items?.length > 0) {
          const recordId = searchData.data.items[0].record_id;
          await fetch(
            `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_MEETINGS}/records/${recordId}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                fields: {
                  title: meeting.title,
                  start_date: meeting.startDate,
                  end_date: meeting.endDate,
                  candidate_dates: JSON.stringify(meeting.candidateDates || []),
                  meeting_time: meeting.meetingTime || '19:00',
                  target_count: meeting.targetCount,
                  description: meeting.description || '',
                  locations: JSON.stringify(meeting.locations || []),
                },
              }),
            }
          );
        }
      } catch (err) {
        console.error('Lark updateMeeting error:', err);
      }
    }

    // Reset responses in local fallback store
    const store = loadLocalStore();
    store.meetings[id] = { ...meeting, responses: [] };
    store.responses[id] = [];
    saveLocalStore(store);
    return store.meetings[id];
  },

  async deleteMeeting(id: string): Promise<boolean> {
    const token = await getLarkTenantAccessToken();

    if (token && LARK_BASE_TOKEN && LARK_TABLE_MEETINGS) {
      try {
        const searchRes = await fetch(
          `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_MEETINGS}/records?filter=CurrentValue.[meeting_id]=%22${encodeURIComponent(
            id
          )}%22`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();
        if (searchData.code === 0 && searchData.data?.items?.length > 0) {
          const recordId = searchData.data.items[0].record_id;
          await fetch(
            `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_MEETINGS}/records/${recordId}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            }
          );
        }
      } catch (err) {
        console.error('Lark deleteMeeting error:', err);
      }
    }

    const store = loadLocalStore();
    delete store.meetings[id];
    delete store.responses[id];
    saveLocalStore(store);
    return true;
  },

  async addResponse(meetingId: string, response: ParticipantResponse): Promise<ParticipantResponse> {
    const token = await getLarkTenantAccessToken();

    if (token && LARK_BASE_TOKEN && LARK_TABLE_RESPONSES) {
      try {
        const res = await fetch(
          `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_RESPONSES}/records`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              fields: {
                meeting_id: meetingId,
                participant_name: response.participantName,
                selections: JSON.stringify(response.selections),
                selected_locations: JSON.stringify(response.selectedLocations || []),
                submitted_at: response.submittedAt,
              },
            }),
          }
        );
        const data = await res.json();
        if (data.code === 0) {
          return response;
        }
        console.warn('Lark addResponse returned non-zero code, falling back:', data);
      } catch (err) {
        console.error('Lark addResponse error, falling back:', err);
      }
    }

    // Local fallback
    const store = loadLocalStore();
    if (!store.responses[meetingId]) {
      store.responses[meetingId] = [];
    }
    // Update existing response if participant already submitted, or add new
    const existingIndex = store.responses[meetingId].findIndex(
      (r) => r.participantName === response.participantName
    );
    if (existingIndex >= 0) {
      store.responses[meetingId][existingIndex] = response;
    } else {
      store.responses[meetingId].push(response);
    }
    saveLocalStore(store);
    return response;
  },

  async getResponses(meetingId: string): Promise<ParticipantResponse[]> {
    const token = await getLarkTenantAccessToken();

    if (token && LARK_BASE_TOKEN && LARK_TABLE_RESPONSES) {
      try {
        const res = await fetch(
          `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_RESPONSES}/records?filter=CurrentValue.[meeting_id]=%22${encodeURIComponent(
            meetingId
          )}%22`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await res.json();
        if (data.code === 0 && data.data?.items) {
          return data.data.items.map((item: any) => {
            const f = item.fields;
            let selections = {};
            try {
              selections = JSON.parse(f.selections || '{}');
            } catch {}
            let selectedLocations: string[] = [];
            try {
              if (f.selected_locations) {
                selectedLocations = JSON.parse(f.selected_locations);
              }
            } catch {}
            return {
              id: item.record_id,
              meetingId: f.meeting_id,
              participantName: f.participant_name,
              selections,
              selectedLocations,
              submittedAt: f.submitted_at,
            };
          });
        }
      } catch (err) {
        console.error('Lark getResponses error, falling back:', err);
      }
    }

    const store = loadLocalStore();
    return store.responses[meetingId] || [];
  },
};

