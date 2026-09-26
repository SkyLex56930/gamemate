import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "activity" | "alert-circle" | "arrow-left" | "arrow-right" | "ban" | "bell"
  | "calendar" | "calendar-clock" | "check" | "chevron-down" | "chevron-right"
  | "clock" | "close" | "download" | "edit" | "eye" | "eye-off" | "flask"
  | "gamepad" | "globe" | "gauge" | "headphones" | "home" | "info" | "layout-grid"
  | "life-buoy" | "link" | "lock" | "log-in" | "log-out" | "map-pin" | "maximize" | "menu" | "message-circle" | "minus"
  | "mic" | "mic-off" | "monitor" | "more-horizontal" | "music" | "palette" | "play"
  | "plus" | "refresh" | "search" | "send" | "settings" | "shield" | "sparkles"
  | "target" | "terminal" | "trash" | "trophy" | "upload" | "user" | "user-check"
  | "user-plus" | "user-x" | "users" | "volume-2" | "volume-x" | "wifi" | "zap";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
  size?: number | string;
  label?: string;
};

export function Icon({ name, size = 20, label, className = "", ...props }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `gm-svg-icon ${className}`.trim(),
    role: label ? "img" : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
    focusable: false,
    ...props,
  };

  return <svg {...common}>{iconPaths[name]}</svg>;
}

const iconPaths: Record<IconName, ReactNode> = {
  activity: <><path d="M3 12h4l2.2-7 4.3 14 2.2-7H21" /></>,
  "alert-circle": <><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></>,
  "arrow-left": <><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></>,
  "arrow-right": <><path d="m9 18 6-6-6-6" /><path d="M4 12h11" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  "calendar-clock": <><path d="M15 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8" /><path d="M16 1v4M8 1v4M3 9h18" /><circle cx="18" cy="18" r="4" /><path d="M18 16v2l1.4 1" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 21h14" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6" /><circle cx="12" cy="12" r="2.5" /></>,
  "eye-off": <><path d="m3 3 18 18" /><path d="M10.6 6.2A9 9 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3-.5" /></>,
  flask: <><path d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8a3 3 0 0 0 2.6-4l-5-9V3" /><path d="M7.5 15h9" /></>,
  gamepad: <><path d="M6.5 7h11a4 4 0 0 1 3.8 5l-1.2 5a2.6 2.6 0 0 1-4.4 1.2L13.5 16h-3l-2.2 2.2A2.6 2.6 0 0 1 3.9 17l-1.2-5a4 4 0 0 1 3.8-5Z" /><path d="M7 10v4M5 12h4M16 11h.01M18 13h.01" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
  gauge: <><path d="M4 18a9 9 0 1 1 16 0" /><path d="M12 14l4-4" /><path d="M5 18h14" /></>,
  headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h3v6H5a1 1 0 0 1-1-1v-5ZM20 14h-3v6h2a1 1 0 0 0 1-1v-5Z" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  "layout-grid": <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  "life-buoy": <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="m5.6 5.6 4.3 4.3m4.2 4.2 4.3 4.3m0-12.8-4.3 4.3m-4.2 4.2-4.3 4.3" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  "log-in": <><path d="m14 8 4 4-4 4M18 12H7" /><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /></>,
  "log-out": <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" /></>,
  "map-pin": <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  maximize: <rect x="4" y="4" width="16" height="16" rx="1" />,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  "message-circle": <><path d="M21 11.5a8.5 8.5 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.6-4.6A8.5 8.5 0 1 1 21 11.5Z" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></>,
  "mic-off": <><path d="m3 3 18 18" /><path d="M9 9v2a3 3 0 0 0 4.5 2.6M15 10V6a3 3 0 0 0-5.8-1" /><path d="M5 11a7 7 0 0 0 11.8 5M19 11a7 7 0 0 1-.4 2.3M12 18v3M8 21h8" /></>,
  minus: <path d="M5 12h14" />,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  "more-horizontal": <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  palette: <><path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h3a6 6 0 0 0 0-12Z" /><circle cx="7.5" cy="10" r=".7" fill="currentColor" /><circle cx="10" cy="6.5" r=".7" fill="currentColor" /><circle cx="15" cy="6.5" r=".7" fill="currentColor" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8A7 7 0 0 1 18.4 6L20 8M4 16l1.6 2A7 7 0 0 0 18 16" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  sparkles: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3ZM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8ZM5 14l.7 1.8L7.5 16l-1.8.7L5 18.5l-.7-1.8L2.5 16l1.8-.7Z" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0ZM12 13v4M8 21h8M10 17h4" /><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4" /></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M5 21h14" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  "user-check": <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 11.5-5.4M16 18l2 2 4-5" /></>,
  "user-plus": <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 12-5M19 8v6M16 11h6" /></>,
  "user-x": <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 12-5M17 17l5 5M22 17l-5 5" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M18 15a6 6 0 0 1 4 6" /></>,
  "volume-2": <><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" /></>,
  "volume-x": <><path d="M11 5 6 9H3v6h3l5 4ZM16 10l5 5M21 10l-5 5" /></>,
  wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8 16a6 6 0 0 1 8 0M11 19.5a2 2 0 0 1 2 0M2 9a14 14 0 0 1 20 0" /></>,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
};
