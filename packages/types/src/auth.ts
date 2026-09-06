export type User = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export type AuthProvider = "google";

export type AuthStatus = {
  authenticated: boolean;
  user: User | null;
  providers: AuthProvider[];
};
