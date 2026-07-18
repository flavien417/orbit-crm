import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseJSON<T>(str: string | null | undefined, fallback: T): T {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
}

export const CONNECTION_TAGS = [
  "Friend", "Close Friend", "Acquaintance", "Colleague", "Mentor",
  "Mentee", "Family", "Neighbor", "Client", "Partner", "Alumni",
];

export const INDUSTRY_TAGS = [
  "Technology", "Finance", "Healthcare", "Education", "Legal",
  "Media", "Marketing", "Design", "Engineering", "Science",
  "Government", "Non-profit", "Real Estate", "Retail", "Hospitality",
  "Arts", "Sports", "Consulting", "Startup", "Other",
];

export const CONTACT_METHOD_TYPES = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "Twitter / X" },
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
];

export function tagColor(tag: string): string {
  // Deterministic color from tag string
  const colors = [
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  ];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % colors.length;
  return colors[h];
}

export function initials(first: string, last: string): string {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export function avatarBg(name: string): string {
  const hues = [220, 265, 320, 25, 185, 155, 45, 0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % hues.length;
  return `hsl(${hues[h]}, 60%, 50%)`;
}
