export type UserRole = "pasajero" | "conductor";

export type Profile = {
  id: string;
  role: UserRole;
  created_at: string;
};
