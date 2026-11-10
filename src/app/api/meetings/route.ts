import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/lark';
import { Meeting } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
      return NextResponse.json({ error: '필수 입력 항목이 누락되었습니다.' }, { status: 400 });
    }

    if (startDate > endDate) {
      return NextResponse.json({ error: '종료일은 시작일보다 이후여야 합니다.' }, { status: 400 });
    }

    // Generate a clean human-readable slug ID e.g. plan-xxxxxx
    const randomHex = Math.random().toString(36).substring(2, 8);
    const meetingId = `plan-${randomHex}`;

    const newMeeting: Meeting = {
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
    return NextResponse.json({ success: true, meeting: saved });
  } catch (err: any) {
    console.error('API create meeting error:', err);
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

