import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/lark';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const meeting = await db.getMeeting(id);

    if (!meeting) {
      return NextResponse.json({ error: '해당 모임을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      meeting,
      isLarkConnected: db.isLarkConfigured(),
    });
  } catch (err: any) {
    console.error('API get meeting error:', err);
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();
    const existing = await db.getMeeting(id);

    if (!existing) {
      return NextResponse.json({ error: '해당 모임을 찾을 수 없습니다.' }, { status: 404 });
    }

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
      responses: [], // Reset responses for revote
    };

    const saved = await db.updateMeeting(id, updated);

    return NextResponse.json({
      success: true,
      meeting: saved,
    });
  } catch (err: any) {
    console.error('API update meeting error:', err);
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    await db.deleteMeeting(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

