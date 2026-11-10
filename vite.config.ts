import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Helper for local dev data storage
const DB_FILE = path.resolve(process.cwd(), '.local_dev_db.json');

function getDevDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch {}
  }
  return { meetings: {}, responses: {} };
}

function saveDevDb(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-api-server',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/api/')) {
            return next();
          }

          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });

          req.on('end', () => {
            let parsedBody: any = {};
            if (body) {
              try {
                parsedBody = JSON.parse(body);
              } catch {}
            }

            res.setHeader('Content-Type', 'application/json');
            const url = req.url || '';
            const db = getDevDb();

            // 1. POST /api/meetings (Create meeting)
            if (url === '/api/meetings' && req.method === 'POST') {
              const { title, hostName, startDate, endDate, candidateDates, targetCount, meetingTime, description, locations, hostToken } = parsedBody;
              const id = `plan-${Math.random().toString(36).substring(2, 8)}`;
              const meeting = {
                id,
                title: (title || '').trim(),
                hostName: (hostName || '').trim(),
                hostToken: hostToken || '',
                startDate,
                endDate,
                candidateDates: Array.isArray(candidateDates) ? candidateDates : [],
                targetCount: Number(targetCount) || 4,
                meetingTime: (meetingTime || '19:00').trim(),
                description: (description || '').trim(),
                locations: Array.isArray(locations) ? locations.filter(Boolean) : [],
                createdAt: new Date().toISOString(),
                responses: [],
              };
              db.meetings[id] = meeting;
              db.responses[id] = [];
              saveDevDb(db);

              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, meeting }));
              return;
            }

            // 2. DELETE /api/meetings/:id (Delete meeting)
            const matchMeetingDelete = url.match(/^\/api\/meetings\/([^/?]+)$/);
            if (matchMeetingDelete && req.method === 'DELETE') {
              const meetingId = matchMeetingDelete[1];
              delete db.meetings[meetingId];
              delete db.responses[meetingId];
              saveDevDb(db);

              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
              return;
            }

            // 2-1. PUT/PATCH /api/meetings/:id (Update meeting & reset responses for revote)
            const matchMeetingPut = url.match(/^\/api\/meetings\/([^/?]+)$/);
            if (matchMeetingPut && (req.method === 'PUT' || req.method === 'PATCH')) {
              const meetingId = matchMeetingPut[1];
              const meeting = db.meetings[meetingId];
              if (!meeting) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: '모임을 찾을 수 없습니다.' }));
                return;
              }

              const { title, startDate, endDate, candidateDates, targetCount, meetingTime, description, locations } = parsedBody;
              if (title !== undefined) meeting.title = (title || '').trim();
              if (startDate !== undefined) meeting.startDate = startDate;
              if (endDate !== undefined) meeting.endDate = endDate;
              if (candidateDates !== undefined) meeting.candidateDates = Array.isArray(candidateDates) ? candidateDates : [];
              if (targetCount !== undefined) meeting.targetCount = Number(targetCount) || meeting.targetCount;
              if (meetingTime !== undefined) meeting.meetingTime = (meetingTime || '19:00').trim();
              if (description !== undefined) meeting.description = (description || '').trim();
              if (locations !== undefined) meeting.locations = Array.isArray(locations) ? locations.filter(Boolean) : [];

              // Reset responses so participants revote under new dates/locations
              db.responses[meetingId] = [];
              meeting.responses = [];
              saveDevDb(db);

              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, meeting }));
              return;
            }

            // 3. GET /api/meetings/:id (Get meeting)
            const matchMeetingGet = url.match(/^\/api\/meetings\/([^/?]+)$/);
            if (matchMeetingGet && req.method === 'GET') {
              const meetingId = matchMeetingGet[1];
              const meeting = db.meetings[meetingId];
              if (!meeting) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: '모임을 찾을 수 없습니다.' }));
                return;
              }
              const meetingData = {
                ...meeting,
                responses: db.responses[meetingId] || [],
              };
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, meeting: meetingData }));
              return;
            }

            // 4. POST /api/meetings/:id/responses (Submit response)
            const matchResponsePost = url.match(/^\/api\/meetings\/([^/?]+)\/responses$/);
            if (matchResponsePost && req.method === 'POST') {
              const meetingId = matchResponsePost[1];
              const { participantName, selections, selectedLocations } = parsedBody;
              const list = db.responses[meetingId] || [];
              const responseItem = {
                id: `resp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                meetingId,
                participantName: (participantName || '').trim(),
                selectedLocations: Array.isArray(selectedLocations) ? selectedLocations : [],
                selections: selections || {},
                submittedAt: new Date().toISOString(),
              };

              const existingIdx = list.findIndex(
                (r: any) => r.participantName === responseItem.participantName
              );
              if (existingIdx >= 0) {
                list[existingIdx] = responseItem;
              } else {
                list.push(responseItem);
              }

              db.responses[meetingId] = list;
              saveDevDb(db);

              res.statusCode = 200;
              res.end(
                JSON.stringify({
                  success: true,
                  response: responseItem,
                  allResponses: list,
                })
              );
              return;
            }

            // 5. GET /api/meetings/:id/responses
            const matchResponseGet = url.match(/^\/api\/meetings\/([^/?]+)\/responses$/);
            if (matchResponseGet && req.method === 'GET') {
              const meetingId = matchResponseGet[1];
              const list = db.responses[meetingId] || [];
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, responses: list }));
              return;
            }

            next();
          });
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
});
