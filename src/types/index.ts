export type AvailabilityType = 'ALL_DAY' | 'CONDITIONAL' | 'UNAVAILABLE';

export interface DateSelection {
  date: string; // YYYY-MM-DD
  type: AvailabilityType;
  note?: string; // e.g. "18:00 이후 가능", "점심만 가능"
}

export interface ParticipantResponse {
  id: string;
  meetingId: string;
  participantName: string;
  selectedLocations?: string[]; // voted locations
  selections: Record<string, DateSelection>; // key: YYYY-MM-DD
  submittedAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  hostName: string;
  hostToken?: string; // secret token for host authority
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  candidateDates?: string[]; // specific votable dates chosen by host (특정 후보일만 지정)
  targetCount: number; // e.g. 4
  meetingTime?: string; // e.g. "19:00", "18:30" (주관자 모임 시작 예정 시간)
  description?: string;
  locations?: string[]; // up to 3 location options e.g. ["강남역", "을지로/종로", "여의도"]
  createdAt: string;
  responses?: ParticipantResponse[];
}

export interface AggregatedDateResult {
  date: string;
  allDayCount: number;
  conditionalCount: number;
  totalAvailableCount: number;
  isFullMatch: boolean;
  participants: {
    name: string;
    type: AvailabilityType;
    note?: string;
  }[];
}

export interface LocationVoteResult {
  location: string;
  votes: number;
  percentage: number;
  voters: string[];
}
