// Vercel Serverless Function (Node.js ESM)
// Directly connects to Lark Base (Bitable) Cloud DB

const LARK_API_DOMAIN = process.env.LARK_API_DOMAIN || 'https://open.larksuite.com';
const LARK_APP_ID = process.env.LARK_APP_ID || 'cli_a956e36179b8de15';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET || 'TDmS2UeL3bU3nE0MdUBrLbuMwEvXxyc7';
const LARK_BASE_TOKEN = process.env.LARK_BASE_TOKEN || 'ZGJZbg5gnamSsPs4Q6SjKUqJpqb';
const LARK_TABLE_MEETINGS = process.env.LARK_TABLE_MEETINGS || 'tblGaHgpPwH1iB3U';
const LARK_TABLE_RESPONSES = process.env.LARK_TABLE_RESPONSES || 'tbl5LZCZGu5SGLZw';

// In-memory token cache
let cachedToken = null;

async function getLarkTenantAccessToken() {
  if (!LARK_APP_ID || !LARK_APP_SECRET) return null;

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
    }
    console.error('Lark token error:', json);
    return null;
  } catch (err) {
    console.error('Failed to get Lark token:', err);
    return null;
  }
}

function deduplicateResponses(list) {
  const byName = new Map();
  for (const item of list) {
    const key = (item.participantName || '').trim();
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev || (item.submittedAt || '') >= (prev.submittedAt || '')) {
      byName.set(key, { ...item, participantName: key });
    }
  }
  return Array.from(byName.values());
}

async function deleteLarkRecords(token, tableId, recordIds) {
  if (!recordIds || recordIds.length === 0) return;
  try {
    if (recordIds.length > 1) {
      const batchRes = await fetch(
        `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${tableId}/records/batch_delete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ records: recordIds }),
        }
      );
      const batchData = await batchRes.json();
      if (batchData.code === 0) return;
    }
    for (const rid of recordIds) {
      await fetch(
        `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${tableId}/records/${rid}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
    }
  } catch (err) {
    console.error('Lark delete records error:', err);
  }
}

async function clearMeetingResponsesInLark(token, meetingId) {
  if (!token || !LARK_BASE_TOKEN || !LARK_TABLE_RESPONSES) return;
  try {
    const res = await fetch(
      `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_RESPONSES}/records?page_size=500&filter=CurrentValue.[meeting_id]=%22${encodeURIComponent(
        meetingId
      )}%22`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (data.code === 0 && data.data?.items?.length > 0) {
      const ids = data.data.items.map((item) => item.record_id);
      await deleteLarkRecords(token, LARK_TABLE_RESPONSES, ids);
    }
  } catch (err) {
    console.error('Lark clearMeetingResponses error:', err);
  }
}

// Memory fallback for runtime
const memoryStore = {
  meetings: {},
  responses: {},
};

const larkDB = {
  async createMeeting(meeting) {
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
        if (data.code === 0) return meeting;
        console.warn('Lark createMeeting non-zero:', data);
      } catch (err) {
        console.error('Lark createMeeting error:', err);
      }
    }
    memoryStore.meetings[meeting.id] = meeting;
    return meeting;
  },

  async getMeeting(id) {
    const token = await getLarkTenantAccessToken();
    if (token && LARK_BASE_TOKEN && LARK_TABLE_MEETINGS) {
      try {
        const res = await fetch(
          `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_MEETINGS}/records?filter=CurrentValue.[meeting_id]=%22${encodeURIComponent(
            id
          )}%22`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.code === 0 && data.data?.items?.length > 0) {
          const item = data.data.items[0];
          const fields = item.fields;
          let candidateDates;
          try {
            if (fields.candidate_dates) candidateDates = JSON.parse(fields.candidate_dates);
          } catch {}

          let locations = [];
          try {
            if (fields.locations) locations = JSON.parse(fields.locations);
          } catch {}

          const meeting = {
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
        console.error('Lark getMeeting error:', err);
      }
    }
    const meeting = memoryStore.meetings[id];
    if (!meeting) return null;
    meeting.responses = memoryStore.responses[id] || [];
    return meeting;
  },

  async updateMeeting(id, meeting) {
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
        await clearMeetingResponsesInLark(token, id);
      } catch (err) {
        console.error('Lark updateMeeting error:', err);
      }
    }
    memoryStore.meetings[id] = { ...meeting, responses: [] };
    memoryStore.responses[id] = [];
    return memoryStore.meetings[id];
  },

  async deleteMeeting(id) {
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
        await clearMeetingResponsesInLark(token, id);
      } catch (err) {
        console.error('Lark deleteMeeting error:', err);
      }
    }
    delete memoryStore.meetings[id];
    delete memoryStore.responses[id];
    return true;
  },

  async addResponse(meetingId, response) {
    const token = await getLarkTenantAccessToken();
    const targetName = (response.participantName || '').trim();
    const normalizedResponse = { ...response, participantName: targetName };

    if (token && LARK_BASE_TOKEN && LARK_TABLE_RESPONSES) {
      try {
        // 1. Search existing records for this meeting_id to upsert by participant_name
        const searchRes = await fetch(
          `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_RESPONSES}/records?page_size=500&filter=CurrentValue.[meeting_id]=%22${encodeURIComponent(
            meetingId
          )}%22`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();
        const matchingItems =
          searchData.code === 0 && searchData.data?.items
            ? searchData.data.items.filter(
                (item) => (item.fields?.participant_name || '').trim() === targetName
              )
            : [];

        const fields = {
          meeting_id: meetingId,
          participant_name: targetName,
          selections: JSON.stringify(normalizedResponse.selections || {}),
          selected_locations: JSON.stringify(normalizedResponse.selectedLocations || []),
          submitted_at: normalizedResponse.submittedAt,
        };

        if (matchingItems.length > 0) {
          const primaryRecordId = matchingItems[0].record_id;
          const putRes = await fetch(
            `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_RESPONSES}/records/${primaryRecordId}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ fields }),
            }
          );
          const putData = await putRes.json();

          // Clean up any extra duplicate rows for the same participant_name
          if (matchingItems.length > 1) {
            const extraIds = matchingItems.slice(1).map((item) => item.record_id);
            await deleteLarkRecords(token, LARK_TABLE_RESPONSES, extraIds);
          }

          if (putData.code === 0) {
            return { ...normalizedResponse, id: primaryRecordId };
          }
          console.warn('Lark updateResponse non-zero:', putData);
        } else {
          const postRes = await fetch(
            `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_RESPONSES}/records`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ fields }),
            }
          );
          const postData = await postRes.json();
          if (postData.code === 0) {
            return {
              ...normalizedResponse,
              id: postData.data?.record?.record_id || normalizedResponse.id,
            };
          }
          console.warn('Lark addResponse non-zero:', postData);
        }
      } catch (err) {
        console.error('Lark addResponse error:', err);
      }
    }
    if (!memoryStore.responses[meetingId]) memoryStore.responses[meetingId] = [];
    const idx = memoryStore.responses[meetingId].findIndex(
      (r) => (r.participantName || '').trim() === targetName
    );
    if (idx >= 0) {
      memoryStore.responses[meetingId][idx] = normalizedResponse;
    } else {
      memoryStore.responses[meetingId].push(normalizedResponse);
    }
    return normalizedResponse;
  },

  async getResponses(meetingId) {
    const token = await getLarkTenantAccessToken();
    if (token && LARK_BASE_TOKEN && LARK_TABLE_RESPONSES) {
      try {
        const res = await fetch(
          `${LARK_API_DOMAIN}/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_RESPONSES}/records?page_size=500&filter=CurrentValue.[meeting_id]=%22${encodeURIComponent(
            meetingId
          )}%22`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.code === 0 && data.data?.items) {
          const mapped = data.data.items.map((item) => {
            const f = item.fields;
            let selections = {};
            try {
              selections = JSON.parse(f.selections || '{}');
            } catch {}
            let selectedLocations = [];
            try {
              if (f.selected_locations) selectedLocations = JSON.parse(f.selected_locations);
            } catch {}
            return {
              id: item.record_id,
              meetingId: f.meeting_id,
              participantName: (f.participant_name || '').trim(),
              selections,
              selectedLocations,
              submittedAt: f.submitted_at,
            };
          });
          return deduplicateResponses(mapped);
        }
      } catch (err) {
        console.error('Lark getResponses error:', err);
      }
    }
    return deduplicateResponses(memoryStore.responses[meetingId] || []);
  },
};

// Vercel Serverless Function entry point
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';
  const pathname = url.split('?')[0];

  try {
    // 0. Base Status Check
    if (pathname === '/api' || pathname === '/api/' || (pathname === '/api/meetings' && req.method === 'GET')) {
      return res.status(200).json({
        status: 'ok',
        service: "Let's make plans! API",
        larkConnected: true,
        baseToken: LARK_BASE_TOKEN ? `${LARK_BASE_TOKEN.substring(0, 6)}...` : null,
      });
    }

    // 1. POST /api/meetings -> Create Meeting
    if ((pathname === '/api/meetings' || pathname === '/api') && req.method === 'POST') {
      const body = req.body || {};
      const {
        title,
        hostName,
        startDate,
        endDate,
        candidateDates,
        targetCount,
        meetingTime,
        description,
        locations,
        hostToken,
      } = body;

      if (!title || !hostName || !startDate || !endDate) {
        return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
      }

      const randomHex = Math.random().toString(36).substring(2, 8);
      const meetingId = `plan-${randomHex}`;

      const newMeeting = {
        id: meetingId,
        title: title.trim(),
        hostName: hostName.trim(),
        startDate,
        endDate,
        candidateDates: candidateDates || undefined,
        targetCount: Number(targetCount) || 4,
        meetingTime: meetingTime || '19:00',
        description: description?.trim() || '',
        locations: locations || [],
        hostToken: hostToken || '',
        createdAt: new Date().toISOString(),
      };

      const saved = await larkDB.createMeeting(newMeeting);
      return res.status(200).json({ success: true, meeting: saved });
    }

    // 2. /api/meetings/:id/responses -> GET / POST responses
    const responsesMatch = pathname.match(/\/api\/meetings\/([^/]+)\/responses/);
    if (responsesMatch) {
      const meetingId = responsesMatch[1];
      if (req.method === 'GET') {
        const responses = await larkDB.getResponses(meetingId);
        return res.status(200).json({ success: true, responses });
      }
      if (req.method === 'POST') {
        const body = req.body || {};
        const { participantName, selections, selectedLocations } = body;
        if (!participantName || !participantName.trim()) {
          return res.status(400).json({ error: '참여자 이름을 입력해주세요.' });
        }
        const responseItem = {
          id: `resp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          meetingId,
          participantName: participantName.trim(),
          selections,
          selectedLocations: selectedLocations || [],
          submittedAt: new Date().toISOString(),
        };
        const saved = await larkDB.addResponse(meetingId, responseItem);
        const allResponses = await larkDB.getResponses(meetingId);
        return res.status(200).json({ success: true, response: saved, allResponses });
      }
    }

    // 3. /api/meetings/:id -> GET, PUT, DELETE Meeting
    const meetingMatch = pathname.match(/\/api\/meetings\/([^/]+)$/);
    if (meetingMatch) {
      const id = meetingMatch[1];
      if (req.method === 'GET') {
        const meeting = await larkDB.getMeeting(id);
        if (!meeting) {
          return res.status(404).json({ error: '모임을 찾을 수 없습니다.' });
        }
        return res.status(200).json({ success: true, meeting, isLarkConnected: true });
      }
      if (req.method === 'PUT') {
        const existing = await larkDB.getMeeting(id);
        if (!existing) {
          return res.status(404).json({ error: '모임을 찾을 수 없습니다.' });
        }
        const body = req.body || {};
        const updated = {
          ...existing,
          title: body.title !== undefined ? body.title.trim() : existing.title,
          startDate: body.startDate !== undefined ? body.startDate : existing.startDate,
          endDate: body.endDate !== undefined ? body.endDate : existing.endDate,
          candidateDates: body.candidateDates !== undefined ? body.candidateDates : existing.candidateDates,
          targetCount: body.targetCount !== undefined ? Number(body.targetCount) : existing.targetCount,
          meetingTime: body.meetingTime !== undefined ? body.meetingTime.trim() : existing.meetingTime,
          description: body.description !== undefined ? body.description.trim() : existing.description,
          locations: body.locations !== undefined ? body.locations : existing.locations,
          responses: [],
        };
        const saved = await larkDB.updateMeeting(id, updated);
        return res.status(200).json({ success: true, meeting: saved });
      }
      if (req.method === 'DELETE') {
        await larkDB.deleteMeeting(id);
        return res.status(200).json({ success: true });
      }
    }

    return res.status(404).json({ error: 'API route not found: ' + pathname });
  } catch (err) {
    console.error('Serverless error:', err);
    return res.status(500).json({ error: err.message || '서버 오류' });
  }
}

