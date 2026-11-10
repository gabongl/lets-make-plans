import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/lark';
import { ParticipantResponse } from '@/types';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();
    const { participantName, selections, selectedLocations } = body;

    if (!participantName || !participantName.trim()) {
      return NextResponse.json({ error: '참여자 이름을 입력해주세요.' }, { status: 400 });
    }

    if (!selections || Object.keys(selections).length === 0) {
      return NextResponse.json({ error: '최소 하루 이상의 가능한 날짜를 선택해주세요.' }, { status: 400 });
    }

    const meeting = await db.getMeeting(id);
    if (!meeting) {
      return NextResponse.json({ error: '모임 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const responseItem: ParticipantResponse = {
      id: `resp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      meetingId: id,
      participantName: participantName.trim(),
      selections,
      selectedLocations: selectedLocations || [],
      submittedAt: new Date().toISOString(),
    };

    const saved = await db.addResponse(id, responseItem);
    const allResponses = await db.getResponses(id);

    return NextResponse.json({
      success: true,
      response: saved,
      allResponses,
    });
  } catch (err: any) {
    console.error('API submit response error:', err);
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const responses = await db.getResponses(id);
    return NextResponse.json({ success: true, responses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

