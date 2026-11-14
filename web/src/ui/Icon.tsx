/** أيقونات خطية موحدة (24×24). الاتجاهية منها تنعكس في RTL عبر flip. */
const PATHS = {
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5',
  inbox: 'M4 13h4l2 3h4l2-3h4M4 13l2.5-8h11L20 13v6H4z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M21 21v-1a6 6 0 0 0-4-5.6',
  tasks: 'M10 6h10M10 12h10M10 18h10M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  crm: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  wallet: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7V6a2 2 0 0 1 2-2h10M16 13.5h.01',
  finance: 'M4 20V11M10 20V5M16 20v-7M2 20h20',
  settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  logout: 'M9 4H5v16h4M14 8l-4 4 4 4M10 12h10',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  alert: 'M12 8v5M12 16.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  history: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4M12 8v4l3 2',
  building: 'M5 21V5l7-2v18M12 8h7v13M8 9h1M8 13h1M8 17h1M15 12h1M15 16h1M3 21h18',
  grid: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  key: 'M15 9a3 3 0 1 0 0-.01M13 11l-8 8v2h3v-2h2v-2h2l1.5-1.5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  chevron: 'M15 6l-6 6 6 6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  pin: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  printer: 'M7 9V4h10v5M7 17H5v-6h14v6h-2M8 14h8v6H8z',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  briefcase: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  login: 'M14 4h5v16h-5M4 12h11M11 8l4 4-4 4',
  logoutArrow: 'M10 4H5v16h5M20 12H9M13 8l-4 4 4 4',
  chevronDown: 'M6 9l6 6 6-6',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  filter: 'M4 6h16M7 12h10M10 18h4',
  sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  fingerprint: 'M6.5 5.5A8 8 0 0 1 20 11v1M4 9.5A8 8 0 0 0 4 12v1M8 12a4 4 0 0 1 8 0v1.5a13 13 0 0 1-1 5M12 12v2a10 10 0 0 1-2.2 6.3M8.2 16.5A12 12 0 0 1 7 20M19.5 15.5a17 17 0 0 1-.7 3.5M9.5 4.2A8 8 0 0 1 12 4'
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className, strokeWidth = 1.7 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}
