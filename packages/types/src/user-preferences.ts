export interface UserPreferences {
  id: string;
  userId: string;
  dayBoundary: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string | null;
  suppressCheckInsDuringFocus: boolean;
  createdAt: string;
  updatedAt: string;
}
