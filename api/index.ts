import { db } from '../src/lib/lark';

export default async function handler(req: any, res: any) {
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
    // 1. POST /api/meetings -> Create Meeting
    if ((pathname === '/api/meetings' || pathname === '/api') && req.method === 'POST' && req.body?.title) {
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

      const saved = await db.createMeeting(newMeeting);
      return res.status(200).json({ success: true, meeting: saved });
    }

    // 2. /api/meetings/:id/responses -> GET / POST responses
    const responsesMatch = pathname.match(/\/api\/meetings\/([^/]+)\/responses/);
    if (responsesMatch) {
      const meetingId = responsesMatch[1];
      if (req.method === 'GET') {
        const responses = await db.getResponses(meetingId);
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
        const saved = await db.addResponse(meetingId, responseItem);
        const allResponses = await db.getResponses(meetingId);
        return res.status(200).json({ success: true, response: saved, allResponses });
      }
    }

    // 3. /api/meetings/:id -> GET, PUT, DELETE Meeting
    const meetingMatch = pathname.match(/\/api\/meetings\/([^/]+)$/);
    if (meetingMatch) {
      const id = meetingMatch[1];
      if (req.method === 'GET') {
        const meeting = await db.getMeeting(id);
        if (!meeting) {
          return res.status(404).json({ error: '모임을 찾을 수 없습니다.' });
        }
        return res.status(200).json({ success: true, meeting, isLarkConnected: db.isLarkConfigured() });
      }
      if (req.method === 'PUT') {
        const existing = await db.getMeeting(id);
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
        const saved = await db.updateMeeting(id, updated);
        return res.status(200).json({ success: true, meeting: saved });
      }
      if (req.method === 'DELETE') {
        await db.deleteMeeting(id);
        return res.status(200).json({ success: true });
      }
    }

    return res.status(404).json({ error: 'API route not found: ' + pathname });
  } catch (err: any) {
    console.error('Serverless error:', err);
    return res.status(500).json({ error: err.message || '서버 오류' });
  }
}
