export interface AdminGuildDto {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  joinedAt: string | null;
}
