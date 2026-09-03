export type TeamPickCandidate = {
  season: number;
  candidateId: number;
  nameEn: string;
  nameHe: string;
  logoUrl: string | null;
  points: number;
  probability: number;
  rank: number;
};

export type PlayerPickCandidate = {
  season: number;
  candidateId: number;
  nameEn: string;
  nameHe: string;
  photoUrl: string | null;
  teamNameEn: string;
  teamNameHe: string;
  position: string | null;
  points: number;
  probability: number;
  rank: number;
};
