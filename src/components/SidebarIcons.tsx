import React from "react";

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const BellIcon: React.FC = () => (
  <svg {...base}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

export const BarChartIcon: React.FC = () => (
  <svg {...base}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

export const ClockIcon: React.FC = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

export const ListChecksIcon: React.FC = () => (
  <svg {...base}>
    <path d="m3 7 2 2 4-4" />
    <path d="M11 6h10" />
    <path d="m3 17 2 2 4-4" />
    <path d="M11 18h10" />
  </svg>
);

export const ImageIcon: React.FC = () => (
  <svg {...base}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

export const TimerIcon: React.FC = () => (
  <svg {...base}>
    <line x1="10" y1="2" x2="14" y2="2" />
    <line x1="12" y1="14" x2="12" y2="9" />
    <circle cx="12" cy="14" r="8" />
  </svg>
);

export const FilmIcon: React.FC = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="8" y1="4" x2="8" y2="9" />
    <line x1="16" y1="4" x2="16" y2="9" />
  </svg>
);

export const WaveformIcon: React.FC = () => (
  <svg {...base}>
    <line x1="3" y1="12" x2="3" y2="12" />
    <line x1="7" y1="8" x2="7" y2="16" />
    <line x1="11" y1="5" x2="11" y2="19" />
    <line x1="15" y1="9" x2="15" y2="15" />
    <line x1="19" y1="6" x2="19" y2="18" />
  </svg>
);

export const SparkleMicIcon: React.FC = () => (
  <svg {...base}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <line x1="12" y1="18" x2="12" y2="21" />
    <path d="M19 4l.6 1.4L21 6l-1.4.6L19 8l-.6-1.4L17 6l1.4-.6z" />
  </svg>
);

export const TextEditIcon: React.FC = () => (
  <svg {...base}>
    <path d="M4 6h11" />
    <path d="M4 12h7" />
    <path d="M4 18h5" />
    <path d="M15 18l5-5a1.7 1.7 0 0 0-2.4-2.4l-5 5V18h2.4z" />
  </svg>
);
