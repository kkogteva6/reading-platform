export type Role = "student" | "parent" | "teacher" | "admin";

export type MockUser = {
  id: string;
  email: string;
  password: string;
  role: Role;
  displayName: string;
};

// Моковые пользователи (потом заменим на backend)
export const MOCK_USERS: MockUser[] = [
  { id: "u1", email: "student@test.ru", password: "1234", role: "student", displayName: "Ученик" },
  { id: "u2", email: "parent@test.ru", password: "1234", role: "parent", displayName: "Родитель" },
  { id: "u3", email: "teacher@test.ru", password: "1234", role: "teacher", displayName: "Учитель" },
  { id: "u4", email: "admin@test.ru", password: "1234", role: "admin", displayName: "Администратор" },
];
