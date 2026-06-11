import { StaffUser } from '../types';

const STAFF_KEY = 'vietpos_staff';
const SESSION_KEY = 'vietpos_session';

const DEFAULT_STAFF: StaffUser[] = [
  { id: '1', username: 'admin', displayName: 'Quản lý', role: 'manager', pin: '123456' },
  { id: '2', username: 'nhanvien', displayName: 'Nhân viên bán hàng', role: 'sales', pin: '0000' },
];

export function getStaffList(): StaffUser[] {
  const raw = localStorage.getItem(STAFF_KEY);
  if (!raw) {
    localStorage.setItem(STAFF_KEY, JSON.stringify(DEFAULT_STAFF));
    return DEFAULT_STAFF;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_STAFF;
  }
}

export function saveStaffList(list: StaffUser[]): void {
  localStorage.setItem(STAFF_KEY, JSON.stringify(list));
}

export function login(username: string, pin: string): StaffUser | null {
  const staff = getStaffList();
  const user = staff.find(
    (s) => s.username.toLowerCase() === username.toLowerCase() && s.pin === pin,
  );
  if (user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return user;
  }
  return null;
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getCurrentUser(): StaffUser | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
